/**
 * Stripe 通知。
 * 控制台回调地址：https://<域名>/api/payments/stripe/webhook
 * 监听：checkout.session.completed / async_payment_succeeded / async_payment_failed / expired
 */
import { NextResponse } from "next/server";
import { applyNormalizedEvent } from "@/lib/payments/apply";
import { stripeProvider } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ev = await stripeProvider.parseWebhook(req);
  if (!ev) return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });

  const res = await applyNormalizedEvent("stripe", ev);
  if (!res.ok) {
    const status = res.error === "booking_not_found" ? 404 : res.error === "amount_mismatch" ? 409 : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ...res, ok: true });
}
