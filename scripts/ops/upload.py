"""上传文件到自有云服务器（密码由 SSH_PW 传入）。

走 `cat > 远端路径` 的 stdin 管道，不依赖 SFTP 子系统（部分云镜像会关掉 sftp-server）。

用法：
    SSH_PW='...' python scripts/ops/upload.py <本地文件> [远端路径]

大文件（>20MB）请先在服务器开启 sftp 或改用对象存储中转。
"""
import os
import shlex
import sys

import paramiko

HOST = os.environ.get("SSH_HOST", "150.158.139.170")
USER = os.environ.get("SSH_USER", "ubuntu")
PW = os.environ.get("SSH_PW", "")

if not PW:
    print("请设置 SSH_PW 环境变量", file=sys.stderr)
    sys.exit(1)
if len(sys.argv) < 2:
    print("用法: upload.py <本地文件> [远端路径]", file=sys.stderr)
    sys.exit(1)

local = sys.argv[1]
remote = sys.argv[2] if len(sys.argv) > 2 else "/home/ubuntu/" + os.path.basename(local)

if not os.path.exists(local):
    print(f"本地文件不存在: {local}", file=sys.stderr)
    sys.exit(1)

data = open(local, "rb").read()
size_mb = len(data) / 1048576

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PW, timeout=20, look_for_keys=False, allow_agent=False)

print(f"[upload] {local} ({size_mb:.2f} MB) → {remote}")
stdin, stdout, stderr = client.exec_command(f"cat > {shlex.quote(remote)}", timeout=300)
stdin.write(data)
stdin.flush()
stdin.channel.shutdown_write()

rc = stdout.channel.recv_exit_status()
err = stderr.read().decode("utf-8", "replace").strip()
if rc != 0 or err:
    print(f"[upload] 失败 rc={rc} {err}", file=sys.stderr)
    client.close()
    sys.exit(rc or 1)

# 回读大小确认落盘
stdin2, stdout2, _ = client.exec_command(f"stat -c %s {shlex.quote(remote)}", timeout=30)
got = stdout2.read().decode().strip()
print(f"[upload] 完成，远端大小 {int(got or 0)} 字节")
client.close()
