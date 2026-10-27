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
# 代理优先取 PROXY，其次沿用系统环境（编辑器环境会自带一个可用代理），最后才是常见的 7890
PROXY = (
    os.environ.get("PROXY")
    or os.environ.get("https_proxy")
    or os.environ.get("HTTPS_PROXY")
    or os.environ.get("http_proxy")
    or os.environ.get("HTTP_PROXY")
    or "http://127.0.0.1:7890"
)


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


def _state_path() -> str:
    return os.path.join(ROOT, ".git", "gh-sync-state")


def read_state() -> str:
    try:
        return open(_state_path(), encoding="utf-8").read().strip()
    except OSError:
        return ""


def write_state(sha: str) -> None:
    try:
        open(_state_path(), "w", encoding="utf-8").write(sha)
    except OSError:
        pass


def api_push(token: str, message: str, version: str, tag: bool) -> bool:
    """git 协议被墙/代理不放行时的备用通道：用 GitHub Git Data API 提交。

    第一次全量上传，之后按上次同步的 commit 做增量。
    """
    base = f"/repos/{OWNER}/{REPO}"
    st, ref = gh_api("GET", f"{base}/git/ref/heads/{BRANCH}", token)
    if st != 200:
        print(f"[sync] 读取分支失败 {st}: {ref.get('message')}", file=sys.stderr)
        return False
    head_sha = ref["object"]["sha"]

    last = read_state()
    if last:
        d = run(["git", "diff", "--name-status", last, "HEAD"], check=False)
        entries = [l.split("\t") for l in (d.stdout or "").splitlines() if "\t" in l]
        if not entries:
            print("[sync] 没有需要同步的改动")
            return True
        print(f"[sync] 增量同步 {len(entries)} 个文件")
    else:
        d = run(["git", "ls-files"], check=False)
        entries = [["M", p] for p in (d.stdout or "").splitlines() if p.strip()]
        print(f"[sync] 首次全量同步 {len(entries)} 个文件")

    st, commit_info = gh_api("GET", f"{base}/git/commits/{head_sha}", token)
    base_tree = commit_info.get("tree", {}).get("sha", "") if st == 200 else ""

    import base64

    tree = []
    for status, *paths in entries:
        rel = paths[0].strip()
        full = os.path.join(ROOT, *rel.split("/"))
        if status.startswith("D") or not os.path.exists(full):
            tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": None})
            continue
        data = open(full, "rb").read()
        st2, blob = gh_api("POST", f"{base}/git/blobs", token, {
            "content": base64.b64encode(data).decode(), "encoding": "base64",
        })
        if st2 not in (200, 201):
            print(f"[sync] 上传失败 {rel}: {blob.get('message')}", file=sys.stderr)
            return False
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    payload = {"tree": tree}
    if base_tree:
        payload["base_tree"] = base_tree
    st, new_tree = gh_api("POST", f"{base}/git/trees", token, payload)
    if st not in (200, 201):
        print(f"[sync] 创建 tree 失败 {st}: {new_tree.get('message')}", file=sys.stderr)
        return False

    st, new_commit = gh_api("POST", f"{base}/git/commits", token, {
        "message": message, "tree": new_tree["sha"], "parents": [head_sha],
    })
    if st not in (200, 201):
        print(f"[sync] 创建 commit 失败 {st}: {new_commit.get('message')}", file=sys.stderr)
        return False

    st, res = gh_api("PATCH", f"{base}/git/refs/heads/{BRANCH}", token, {"sha": new_commit["sha"]})
    if st != 200:
        print(f"[sync] 更新分支失败 {st}: {res.get('message')}", file=sys.stderr)
        return False

    print(f"[sync] 已推送 {new_commit['sha'][:7]}")
    write_state(run(["git", "rev-parse", "HEAD"], check=False).stdout.strip())

    if tag:
        gh_api("POST", f"{base}/git/refs", token, {"ref": f"refs/tags/v{version}", "sha": new_commit["sha"]})
    return True


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
    if p.returncode != 0:
        # git 协议走不通（常见于代理只放行 api.github.com）→ 改用 API 提交
        print("[sync] git 协议不可达，改用 GitHub API 提交…")
        if api_push(token, full, version, not args.no_tag and args.bump != "none"):
            print(f"[sync] ✅ 完成 v{version} → https://github.com/{OWNER}/{REPO}")
            return 0
        print("[sync] 两种通道都失败，请检查网络/代理或稍后重试", file=sys.stderr)
        return 1

    if last:
        print(last)
    if not args.no_tag and args.bump != "none":
        run(["git"] + git_config_proxy() + ["push", url, f"v{version}"], check=False)
    run(["git", "branch", f"--set-upstream-to=origin/{BRANCH}", BRANCH], check=False)
    write_state(run(["git", "rev-parse", "HEAD"], check=False).stdout.strip())

    print(f"[sync] ✅ 完成 v{version} → https://github.com/{OWNER}/{REPO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
