"""把前端代码同步到 GitHub（自动递增版本号 → 提交 → 打 tag → 推送）。

用法：
    python scripts/ops/github_sync.py                      # 默认 patch 递增：1.0.0 → 1.0.1
    python scripts/ops/github_sync.py -m "修复支付回调"      # 带说明
    python scripts/ops/github_sync.py --bump minor          # 次版本递增
    python scripts/ops/github_sync.py --bump none           # 不改版本号（仅提交）
    python scripts/ops/github_sync.py --public              # 建仓时设为公开（默认私有）

说明：
- Token 从 ~/.git-credentials 读取，不落盘到 .git/config，也不打印。
- 推送走本机代理（可用 PROXY 环境变量覆盖），避免直连 github.com 卡住。
- 仓库不存在时自动创建（默认私有）。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OWNER = os.environ.get("GH_OWNER", "oneding")
REPO = os.environ.get("GH_REPO", "hishifu")
BRANCH = os.environ.get("GH_BRANCH", "main")
PROXY = os.environ.get("PROXY", "http://127.0.0.1:7890")


def read_github_token() -> str:
    """从 ~/.git-credentials 取 GitHub token（不打印）。"""
    path = os.path.expanduser("~/.git-credentials")
    if not os.path.exists(path):
        return ""
    text = open(path, encoding="utf-8", errors="ignore").read()
    m = re.search(r"https://([^:\s]+):([^@\s]+)@github\.com", text)
    return m.group(2) if m else ""


def _json(text: str) -> dict:
    try:
        return json.loads(text or "{}")
    except Exception:  # noqa: BLE001
        return {"message": (text or "")[:300]}


def gh_api(method: str, path: str, token: str, body: dict | None = None):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        data=json.dumps(body).encode() if body else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "xingyi-sync",
        },
        method=method,
    )
    if PROXY:
        host, _, port = PROXY.replace("http://", "").replace("https://", "").partition(":")
        req.set_proxy(host, "http")
        req.set_proxy(host, "https")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, _json(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, _json(e.read().decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return 0, {"message": f"{type(e).__name__}: {e}"}


def run(args: list[str], check=True, capture=True) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    return subprocess.run(
        args, cwd=ROOT, env=env, check=check,
        capture_output=capture, text=True, encoding="utf-8", errors="replace",
    )


def git_config_proxy() -> list[str]:
    return ["-c", f"http.proxy={PROXY}", "-c", f"https.proxy={PROXY}", "-c", "credential.helper="]


def bump_version(kind: str) -> str:
    pkg_path = os.path.join(ROOT, "package.json")
    pkg = json.load(open(pkg_path, encoding="utf-8"))
    old = pkg.get("version", "1.0.0")
    if kind == "none":
        return old
    major, minor, patch = (int(x) for x in re.findall(r"\d+", old)[:3]) if re.findall(r"\d+", old) else (1, 0, 0)
    if kind == "major":
        major, minor, patch = major + 1, 0, 0
    elif kind == "minor":
        minor, patch = minor + 1, 0
    else:
        patch += 1
    new = f"{major}.{minor}.{patch}"
    pkg["version"] = new
    json.dump(pkg, open(pkg_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(pkg_path, "a", encoding="utf-8").write("\n")
    print(f"[sync] 版本号 {old} → {new}")
    return new


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-m", "--message", default="", help="本次更新说明")
    ap.add_argument("--bump", default="patch", choices=["patch", "minor", "major", "none"])
    ap.add_argument("--public", action="store_true", help="建仓时设为公开（默认私有）")
    ap.add_argument("--no-tag", action="store_true", help="不打版本 tag")
    args = ap.parse_args()

    token = read_github_token()
    if not token:
        print("[sync] 未找到 GitHub token（~/.git-credentials），无法推送", file=sys.stderr)
        return 1

    # 1) 仓库是否存在
    status, info = gh_api("GET", f"/repos/{OWNER}/{REPO}", token)
    if status == 404:
        print(f"[sync] 仓库 {OWNER}/{REPO} 不存在，创建中（{'public' if args.public else 'private'}）…")
        status, info = gh_api("POST", "/user/repos", token, {
            "name": REPO, "private": not args.public, "auto_init": False,
            "description": "上海零基础形意拳体验课预约网站",
        })
        if status not in (200, 201):
            print(f"[sync] 建仓失败 {status}: {info.get('message')}", file=sys.stderr)
            return 1
        print(f"[sync] 已创建 {info.get('html_url')}")
    elif status != 200:
        print(f"[sync] 查询仓库失败 {status}: {info.get('message')}", file=sys.stderr)
        return 1
    else:
        print(f"[sync] 目标仓库 {OWNER}/{REPO} 已存在")

    # 2) 本地仓库初始化（项目目录独立于上层仓库）
    if not os.path.exists(os.path.join(ROOT, ".git")):
        print("[sync] 初始化本地仓库…")
        run(["git", "init"])
        run(["git", "checkout", "-b", BRANCH])
    else:
        run(["git", "checkout", "-B", BRANCH], check=False)

    # 3) 版本号递增
    version = bump_version(args.bump)

    # 4) 提交
    run(["git", "add", "-A"])
    diff = run(["git", "diff", "--cached", "--name-only"], check=False)
    changed = [l for l in (diff.stdout or "").splitlines() if l.strip()]
    if not changed:
        print("[sync] 没有需要提交的改动")
        return 0
    msg = args.message.strip() or "chore: update"
    full = f"{msg}\n\nrelease v{version}" if args.bump != "none" else msg
    run(["git", "commit", "-m", full])
    print(f"[sync] 已提交 {len(changed)} 个文件：{msg}")

    if not args.no_tag and args.bump != "none":
        run(["git", "tag", "-f", f"v{version}"], check=False)

    # 5) 推送
    #    remote 只存「不含 token」的地址，token 仅出现在本次命令行，避免写进 .git/config
    safe_url = f"https://github.com/{OWNER}/{REPO}.git"
    remotes = (run(["git", "remote"], check=False).stdout or "").split()
    if "origin" in remotes:
        run(["git", "remote", "set-url", "origin", safe_url], check=False)
    else:
        run(["git", "remote", "add", "origin", safe_url], check=False)

    url = f"https://{token}@github.com/{OWNER}/{REPO}.git"
    last = ""
    for attempt in range(1, 4):
        print(f"[sync] 推送到 {OWNER}/{REPO}:{BRANCH}（第 {attempt} 次）…")
        p = run(["git"] + git_config_proxy() + ["push", url, f"{BRANCH}:{BRANCH}"], check=False)
        out = ((p.stdout or "") + (p.stderr or "")).strip()
        last = re.sub(r"https://[^@\s]+@github\.com", "https://***@github.com", out)
        if p.returncode == 0:
            break
        print(f"  {last}")
    else:
        print("[sync] 推送失败（已重试 3 次）。常见原因：代理抖动，稍后重跑本脚本即可", file=sys.stderr)
        return 1

    if last:
        print(last)
    # tag 单独推（失败不致命）
    if not args.no_tag and args.bump != "none":
        run(["git"] + git_config_proxy() + ["push", url, f"v{version}"], check=False)
    run(["git", "branch", f"--set-upstream-to=origin/{BRANCH}", BRANCH], check=False)

    print(f"[sync] ✅ 完成 v{version} → https://github.com/{OWNER}/{REPO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
