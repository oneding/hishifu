"""在 Nginx 反代配置里补 X-Forwarded-Host / X-Forwarded-Port。

幂等：已存在就跳过。改完 `nginx -t` 校验，通过才 reload。
"""
import subprocess
import sys

PATH = "/etc/nginx/sites-available/hishifu"
ANCHOR = "proxy_set_header X-Forwarded-Proto $scheme;"
ADD = (
    "proxy_set_header X-Forwarded-Host $host;\n"
    "        proxy_set_header X-Forwarded-Port $server_port;"
)

with open(PATH, encoding="utf-8") as f:
    src = f.read()

if "X-Forwarded-Host" in src:
    print("[nginx] 已包含 X-Forwarded-Host，无需修改")
    sys.exit(0)

if ANCHOR not in src:
    print("[nginx] 找不到锚点行，未修改")
    sys.exit(1)

indent = " " * 8  # location 内缩进
src = src.replace(ANCHOR, ANCHOR + "\n" + indent + ADD.replace("\n        ", "\n" + indent))

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

r = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
print(r.stderr.strip() or r.stdout.strip())
if r.returncode != 0:
    print("[nginx] 配置校验失败，已回滚")
    sys.exit(1)

subprocess.run(["systemctl", "reload", "nginx"], check=True)
print("[nginx] 已重载")
