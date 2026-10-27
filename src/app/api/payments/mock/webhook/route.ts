import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPaymentNotification, getBookingByCode } from "@/lib/booking";
import { paymentWebhookSecret } from "@/lib/config";
import { hmacSign, verifyHmac } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Payload = z.object({
  eventId: z.string().min(8),
  bookingCode: z.string().min(3),
  providerRef: z.string().min(3),
  outcome: z.enum(["succeeded", "failed", "abandoned"]),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(1),
  ts: z.number().int(),
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
 * 模拟支付渠道的服务端通知。
 * - 必须带正确的 HMAC 签名（x-mock-signature），否则拒绝
 * - event_id 全局唯一：重复通知只处理一次，不重复扣减名额、不重复发邮件
 * 订单「已付款」只能由这里产生，绝不因为用户跳回成功页就认定付款成功。
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-mock-signature") ?? "";

  if (!verifyHmac(canonical(JSON.parse(raw)), paymentWebhookSecret(), signature)) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  const parsed = Payload.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const p = parsed.data;
  const booking = await getBookingByCode(p.bookingCode);
  if (!booking) return NextResponse.json({ ok: false, error: "booking_not_found" }, { status: 404 });

  // 金额必须与订单一致，防止被篡改
  if (p.amountCents !== booking.amountCents || p.currency !== booking.currency) {
    return NextResponse.json({ ok: false, error: "amount_mismatch" }, { status: 409 });
  }

  const res = await applyPaymentNotification({
    bookingId: booking.id,
    providerRef: p.providerRef,
    eventId: p.eventId,
    outcome: p.outcome,
    amountCents: p.amountCents,
    currency: p.currency,
  });

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    duplicated: res.duplicated,
    status: res.booking.status,
    paymentStatus: res.booking.paymentStatus,
  });
}

/** 便于验收时手工构造一条带签名的通知（演示用） */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const payload = {
    eventId: url.searchParams.get("eventId") ?? "",
    bookingCode: url.searchParams.get("bookingCode") ?? "",
    providerRef: url.searchParams.get("providerRef") ?? "MOCK-MANUAL",
    outcome: url.searchParams.get("outcome") ?? "succeeded",
    amountCents: Number(url.searchParams.get("amountCents") ?? 0),
    currency: url.searchParams.get("currency") ?? "CNY",
    ts: Date.now(),
  };
  const sig = hmacSign(canonical(payload as unknown as Record<string, unknown>), paymentWebhookSecret());
  const site = url.origin;
  return NextResponse.json({
    hint: "用下面的 curl 复现一条支付通知（重复执行可验证幂等）",
    curl: `curl -X POST ${site}/api/payments/mock/webhook -H "content-type: application/json" -H "x-mock-signature: ${sig}" -d '${JSON.stringify(
      payload,
    )}'`,
    payload,
    signature: sig,
  });
}
