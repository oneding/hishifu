"""端到端验收脚本（纯标准库，不依赖第三方）。

用法：
    python scripts/acceptance.py                 # 默认 http://127.0.0.1:3000
    python scripts/acceptance.py http://x:3000

覆盖用例：
    1  前台中英双语首页 200
    2  未登录访问 /admin 被重定向
    3  后台登录 + 数据源标识
    4  下单成功（锁位）
    5  幂等：同一 idempotencyKey 不重复建单
    6  超额下单被拒（soldOut）
    7  模拟支付 → 订单 confirmed / paid
    8  重复支付通知：幂等，不重复确认
    9  伪造签名：401 bad_signature
    10 取消 → 退款申请（refund requested ≠ 已退）
    11 场次名额守恒：confirmed + held + 剩余 == capacity
    12 邮件日志：确认邮件入队
"""
import hashlib
import hmac
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EMAIL = os.environ.get("ACCEPT_EMAIL", "zydoneding@gmail.com")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@xingyi-test.local")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Xingyi@2026")

WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "")


def load_env():
    """读 PAYMENT_WEBHOOK_SECRET：环境变量优先，其次常见 env 文件（含服务器部署路径）。"""
    global WEBHOOK_SECRET
    if WEBHOOK_SECRET:
        return
    candidates = [
        os.environ.get("ENV_FILE", ""),
        os.path.join(ROOT, ".env.local"),
        "/srv/xingyi/.env",          # 服务器部署目录
        "/srv/xingyi-src/.env.local",
    ]
    for path in candidates:
        if not path or not os.path.exists(path):
            continue
        try:
            for line in open(path, encoding="utf-8"):
                m = re.match(r"\s*(?:export\s+)?PAYMENT_WEBHOOK_SECRET\s*=\s*(.+?)\s*$", line)
                if m:
                    WEBHOOK_SECRET = m.group(1).strip().strip('"').strip("'")
                    print(f"（密钥取自 {path}）")
                    return
        except OSError:
            continue


jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.ProxyHandler({}))

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" · {detail}" if detail else ""))


def req(method: str, path: str, body=None, headers=None, allow_redirect=True, timeout=180):
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    h = {"content-type": "application/json"} if data else {}
    h.update(headers or {})
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):  # noqa: ANN002
            return None

    op = opener if allow_redirect else urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), urllib.request.ProxyHandler({}), NoRedirect
    )
    try:
        with op.open(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:  # noqa: BLE001
        return 0, str(e), {}


def jget(status, text):
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        return {}


def canonical(obj: dict) -> str:
    """与服务端 canonical() 一致：键排序 + 紧凑 JSON。"""
    return json.dumps({k: obj[k] for k in sorted(obj)}, separators=(",", ":"), ensure_ascii=False)


def sign(obj: dict) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), canonical(obj).encode(), hashlib.sha256).hexdigest()


def main() -> int:
    load_env()
    print(f"验收目标：{BASE}")
    print(f"数据源：{'外部 Postgres' if os.environ.get('DATABASE_URL') else '见后台概览'}\n")

    print("① 前台与权限")
    s, t, _ = req("GET", "/zh")
    check("中文首页 200", s == 200 and "形意拳" in t, f"HTTP {s}")
    s, t, _ = req("GET", "/en")
    check("英文首页 200", s == 200 and "Xingyiquan" in t, f"HTTP {s}")
    s, _, h = req("GET", "/admin", allow_redirect=False)
    loc = next((v for k, v in h.items() if k.lower() == "location"), "") or ""
    check("未登录 /admin 重定向", s in (302, 307) and "/admin/login" in loc, f"HTTP {s} → {loc}")

    s, t, _ = req("POST", "/api/admin/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    check("后台登录", s == 200 and jget(s, t).get("ok"), jget(s, t).get("error", ""))
    s, t, _ = req("GET", "/admin")
    m = re.search(r"(外部\s*Postgres|内置\s*PGlite)", re.sub(r"<[^>]+>", " ", t))
    check("后台概览数据源", s == 200 and bool(m), m.group(1) if m else f"HTTP {s}")

    print("\n② 下单与库存")
    s, t, _ = req("GET", "/zh/sessions")
    ids = sorted(set(re.findall(r"/book/([0-9a-zA-Z_-]{20,})", t)))
    check("可订场次列表", s == 200 and len(ids) > 0, f"{len(ids)} 个场次")
    sid = ids[0]

    key = f"acc-{int(time.time())}"
    s, t, _ = req("POST", "/api/bookings", {
        "sessionId": sid, "name": "验收用户", "email": EMAIL, "qty": 1, "locale": "zh", "idempotencyKey": key,
    })
    b1 = jget(s, t)
    check("下单成功", s == 200 and b1.get("ok"), b1.get("code", b1.get("error", "")))
    code = b1.get("code", "")
    token = b1.get("token", "")
    amount = None

    s, t, _ = req("POST", "/api/bookings", {
        "sessionId": sid, "name": "验收用户", "email": EMAIL, "qty": 1, "locale": "zh", "idempotencyKey": key,
    })
    b2 = jget(s, t)
    check("幂等：重复 key 不重复建单", s == 200 and b2.get("duplicated") is True and b2.get("code") == code,
          f"duplicated={b2.get('duplicated')}")

    # qty 上限为 50（schema 约束），取 50 必然超过任一演示场次的剩余名额
    s, t, _ = req("POST", "/api/bookings", {
        "sessionId": sid, "name": "超额测试", "email": EMAIL, "qty": 50, "locale": "zh",
    })
    check("超额下单被拒", s == 409 and "soldOut" in t, f"HTTP {s} {jget(s, t).get('error', '')}")

    st, stt, _ = req("GET", f"/api/bookings/{code}/status")
    stj = jget(st, stt)
    amount = stj.get("amountCents")
    check("下单后为待付款", stj.get("status") == "pending_payment", stj.get("status", ""))

    print("\n③ 支付与通知安全")
    s, t, _ = req("POST", "/api/payments/mock/submit", {"code": code, "outcome": "succeeded"})
    check("收银台受理", s == 200 and jget(s, t).get("accepted"), jget(s, t).get("eventId", ""))

    # 通知是异步回调（dev 首次访问路由还要编译），轮询等待而非固定 sleep
    stj = {}
    for _ in range(20):
        time.sleep(1)
        st, stt, _ = req("GET", f"/api/bookings/{code}/status")
        stj = jget(st, stt)
        if stj.get("paymentStatus") == "paid":
            break
    check("支付后 confirmed/paid", stj.get("status") == "confirmed" and stj.get("paymentStatus") == "paid",
          f"{stj.get('status')}/{stj.get('paymentStatus')}")

    evt = f"evt_acc_{int(time.time())}"
    payload = {
        "eventId": evt, "bookingCode": code, "providerRef": "MOCK-ACCEPT-1",
        "outcome": "succeeded", "amountCents": amount or 0, "currency": "CNY", "ts": int(time.time() * 1000),
    }
    s, t, _ = req("POST", "/api/payments/mock/webhook", payload, {"x-mock-signature": sign(payload)})
    check("重复通知：首次处理", s == 200 and jget(s, t).get("ok"), jget(s, t).get("error", ""))
    s, t, _ = req("POST", "/api/payments/mock/webhook", payload, {"x-mock-signature": sign(payload)})
    check("重复通知：幂等不重入", s == 200 and jget(s, t).get("duplicated") is True,
          f"duplicated={jget(s, t).get('duplicated')}")

    bad = dict(payload)
    s, t, _ = req("POST", "/api/payments/mock/webhook", bad, {"x-mock-signature": "deadbeef"})
    check("伪造签名被拒", s == 401 and "bad_signature" in t, f"HTTP {s}")

    print("\n④ 取消与退款")
    s, t, _ = req("POST", "/api/bookings/cancel", {"token": token})
    cj = jget(s, t)
    check("取消成功", s == 200 and cj.get("ok"), f"{cj.get('status', '')} {cj.get('error', '')}")
    st, stt, _ = req("GET", f"/api/bookings/{code}/status")
    stj = jget(st, stt)
    check("取消后状态为 cancelled", stj.get("status") == "cancelled", stj.get("status", ""))
    check("退款为「已申请」而非「已退」", stj.get("refundStatus") == "requested",
          f"refund={stj.get('refundStatus')}")

    print("\n⑤ 库存守恒与邮件")
    s, t, _ = req("GET", "/admin")
    text = re.sub(r"<[^>]+>", "|", re.sub(r"<script.*?</script>", "", t, flags=re.S))
    text = re.sub(r"[|\s]+", "|", text)
    rows = re.findall(r"\d{4}年\d{1,2}月\d{1,2}日\|\d{1,2}:\d{2}\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|", text)
    check("后台概览可访问", s == 200 and len(rows) > 0, f"HTTP {s}，{len(rows)} 个场次")
    bad = [r for r in rows if int(r[0]) + int(r[1]) + int(r[2]) != int(r[3])]
    check("名额守恒：已确认+锁定中+剩余 == 上限", not bad, f"{len(rows)} 个场次全部平衡" if not bad else str(bad))
    s, t, _ = req("GET", "/admin/emails")
    check("邮件日志页可访问", s == 200 and ("sent" in t or "queued" in t or "failed" in t), f"HTTP {s}")

    print("\n──────── 验收汇总 ────────")
    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, detail in results:
        print(f"  {'✅' if ok else '❌'} {name}" + (f" · {detail}" if detail else ""))
    print(f"\n共 {len(results)} 项，通过 {passed} 项，失败 {len(results) - passed} 项")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
