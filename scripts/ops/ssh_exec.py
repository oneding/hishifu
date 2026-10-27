"""运维辅助：通过 SSH 在自有云服务器上执行命令（密码由环境变量 SSH_PW 传入，不落盘）。

用法：
  SSH_PW='...' python scripts/ops/ssh_exec.py "docker ps --format '{{.Names}} {{.Status}}'"
  SSH_PW='...' python scripts/ops/ssh_exec.py --sudo "ss -lntp"
"""
import os
import sys

import paramiko

HOST = os.environ.get("SSH_HOST", "150.158.139.170")
USER = os.environ.get("SSH_USER", "ubuntu")
PW = os.environ.get("SSH_PW", "")
TIMEOUT = int(os.environ.get("SSH_TIMEOUT", "90"))

if not PW:
    print("请设置 SSH_PW 环境变量", file=sys.stderr)
    sys.exit(1)

use_sudo = "--sudo" in sys.argv
args = [a for a in sys.argv[1:] if a != "--sudo"]
cmd = " ".join(args) if args else "echo ok"
if use_sudo and not cmd.strip().startswith("sudo"):
    cmd = f"sudo -S -p '' bash -c {cmd!r}"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PW, timeout=20, look_for_keys=False, allow_agent=False)

stdin, stdout, stderr = client.exec_command(cmd, timeout=TIMEOUT)
if use_sudo:
    # sudo 凭证可能已缓存（5 分钟内免密），此时 stdin 可能已关闭，忽略写入失败即可
    try:
        stdin.write(PW + "\n")
        stdin.flush()
    except Exception:  # noqa: BLE001
        pass

out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
rc = stdout.channel.recv_exit_status()

if out.strip():
    print(out.rstrip())
if err.strip():
    print("[stderr]", err.strip(), file=sys.stderr)
print(f"[exit={rc}]", file=sys.stderr)
client.close()
sys.exit(0 if rc == 0 else rc)
