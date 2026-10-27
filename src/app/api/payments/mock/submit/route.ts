import { NextResponse } from "next/server";
import { z } from "zod";
import { getBookingByCode } from "@/lib/booking";
import { paymentWebhookSecret } from "@/lib/config";
import { hmacSign, randomToken } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(3),
  outcome: z.enum(["succeeded", "failed", "abandoned"]),
  delayMs: z.number().int().min(0).max(60000).optional(),
});

function canonical(body: Record<string, unknown>) {
  const keys = Object.keys(body).sort();
  return JSON.stringify(
    keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {}),
  );
}

/**
 * 模拟收银台提交。
 * 真实渠道是「用户付款 → 渠道异步通知商户」，这里如法炮制：
 * 立即返回受理结果，稍后由服务端带签名回调 webhook，状态只认通知。
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }
  const { code, outcome, delayMs } = parsed.data;

  const booking = await getBookingByCode(code);
  if (!booking) return NextResponse.json({ ok: false, error: "booking_not_found" }, { status: 404 });
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ ok: false, error: "not_pending", status: booking.status }, { status: 409 });
  }

  const payload = {
    eventId: `evt_${randomToken(16)}`,
    bookingCode: booking.code,
    providerRef: `MOCK-${randomToken(8).toUpperCase()}`,
    outcome,
    amountCents: booking.amountCents,
    currency: booking.currency,
    ts: Date.now(),
  };
  const signature = hmacSign(
    canonical(payload as unknown as Record<string, unknown>),
    paymentWebhookSecret(),
  );

  // 异步通知：模拟渠道的回调延迟（放弃付款走更长延迟，便于观察「处理中」与超时释放）
  // 回调用当前请求的 origin，而不是配置的站点域名：
  // 否则域名还没解析（或配错）时回调会打到不可达的地址，订单永远停在待付款。
  const callbackBase = new URL(req.url).origin;
  const delay = delayMs ?? (outcome === "abandoned" ? 1500 : 900);
  setTimeout(async () => {
    try {
      await fetch(`${callbackBase}/api/payments/mock/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-mock-signature": signature },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("[mock-pay] webhook failed", e);
    }
  }, delay);

  return NextResponse.json({ ok: true, accepted: true, eventId: payload.eventId, delay });
}
