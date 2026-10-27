"""SSH 隧道：把本机端口转发到自有云服务器 docker 网络内的 Postgres。

用法（后台运行）：
  SSH_PW='...' python scripts/ops/tunnel.py

默认：本机 127.0.0.1:15432  ->  <SSH 服务器>  ->  172.20.0.2:5432 (supabase-db)
可用环境变量覆盖：LOCAL_PORT / PG_HOST(容器内地址) / PG_PORT
"""
import os
import select
import socketserver
import sys
import threading

import paramiko

SSH_HOST = os.environ.get("SSH_HOST", "150.158.139.170")
SSH_USER = os.environ.get("SSH_USER", "ubuntu")
SSH_PW = os.environ.get("SSH_PW", "")
LOCAL_PORT = int(os.environ.get("LOCAL_PORT", "15432"))
REMOTE_PG = (os.environ.get("PG_HOST", "172.20.0.2"), int(os.environ.get("PG_PORT", "5432")))

if not SSH_PW:
    print("请设置 SSH_PW", file=sys.stderr)
    sys.exit(1)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(SSH_HOST, username=SSH_USER, password=SSH_PW, timeout=20, look_for_keys=False, allow_agent=False)
transport = client.get_transport()


class Handler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        chan = None
        try:
            chan = transport.open_channel(
                "direct-tcpip", REMOTE_PG, self.request.getpeername()
            )
        except Exception as e:  # noqa: BLE001
            print(f"[tunnel] 通道建立失败: {e}", file=sys.stderr)
            return
        if chan is None:
            return
        try:
            while True:
                r, _, _ = select.select([self.request, chan], [], [], 5)
                if self.request in r:
                    data = self.request.recv(4096)
                    if not data:
                        break
                    chan.send(data)
                if chan in r:
                    data = chan.recv(4096)
                    if not data:
                        break
                    self.request.send(data)
        except Exception:  # noqa: BLE001
            pass
        finally:
            chan.close()
            self.request.close()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


srv = Server(("127.0.0.1", LOCAL_PORT), Handler)
print(f"[tunnel] 就绪：127.0.0.1:{LOCAL_PORT} -> {SSH_HOST} -> {REMOTE_PG[0]}:{REMOTE_PG[1]}", flush=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()

try:
    while True:
        import time

        time.sleep(5)
        if not transport.is_alive():
            print("[tunnel] SSH 连接断开", file=sys.stderr)
            break
except KeyboardInterrupt:
    pass
finally:
    srv.shutdown()
    client.close()
