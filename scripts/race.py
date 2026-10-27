"""临时验收：对真实 Postgres（私有 Supabase）跑并发抢位，验证不超卖。"""
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000/api/bookings"
SID = sys.argv[2] if len(sys.argv) > 2 else "dc08e1a8-d633-4b0e-99a0-52def5989833"
N = int(sys.argv[3]) if len(sys.argv) > 3 else 20

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def go(i):
    payload = {
        "sessionId": SID,
        "name": f"压测用户{i:02d}",
        "email": "zydoneding@gmail.com",
        "qty": 1,
        "locale": "zh",
        "idempotencyKey": f"race-pg-{i:03d}",
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with opener.open(req, timeout=180) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


with ThreadPoolExecutor(max_workers=N) as ex:
    results = list(ex.map(go, range(N)))

ok = [r for r in results if r[0] == 200]
sold_out = [r for r in results if r[0] == 409 and "soldOut" in r[1]]
other = [r for r in results if r not in ok and r not in sold_out]

print(f"总请求 {N}  成功 {len(ok)}  soldOut {len(sold_out)}  其他 {len(other)}")
for r in other[:5]:
    print("  异常:", r)
for r in ok[:3]:
    print("  样例:", r[1][:120])
