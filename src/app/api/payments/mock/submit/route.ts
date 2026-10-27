import { NextResponse } from "next/server";
import { z } from "zod";
import { simulatePayment } from "@/lib/payments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(3),
  outcome: z.enum(["succeeded", "failed", "abandoned"]),
  delayMs: z.number().int().min(0).max(60000).optional(),
});

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

  const res = await simulatePayment({
    code,
    outcome,
    delayMs,
    reqOrigin: new URL(req.url).origin,
  });

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error },
      { status: res.error === "booking_not_found" ? 404 : 409 },
    );
  }
  return NextResponse.json({ ok: true, accepted: true, eventId: res.eventId, delay: res.delay });
}
