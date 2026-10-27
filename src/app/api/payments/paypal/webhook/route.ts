/**
 * PayPal 通知（先经 PayPal 复核签名，再落单）。
 * 控制台回调地址：https://<域名>/api/payments/paypal/webhook
 * 监听：PAYMENT.CAPTURE.COMPLETED / PAYMENT.CAPTURE.DENIED
 */
import { NextResponse } from "next/server";
import { applyNormalizedEvent } from "@/lib/payments/apply";
import { paypalProvider } from "@/lib/payments/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ev = await paypalProvider.parseWebhook(req);
  if (!ev) return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });

  const res = await applyNormalizedEvent("paypal", ev);
  if (!res.ok) {
    const status = res.error === "booking_not_found" ? 404 : res.error === "amount_mismatch" ? 409 : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ...res, ok: true });
}
