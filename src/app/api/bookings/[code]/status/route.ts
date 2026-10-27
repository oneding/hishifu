import { NextResponse } from "next/server";
import { getBookingByCode, getBookingByToken, tokenForBooking } from "@/lib/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 订单状态轮询接口：结果页据此展示「处理中 / 成功 / 失败」。
 * code 查询需谨慎：这里只返回状态与编号，不含个人信息。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const booking = code.startsWith("tok:") || token
    ? await (token ? getBookingByToken(token) : null)
    : await getBookingByCode(code);

  if (!booking) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    code: booking.code,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    refundStatus: booking.refundStatus,
    qty: booking.qty,
    amountCents: booking.amountCents,
    currency: booking.currency,
    holdExpiresAt: booking.holdExpiresAt,
    email: booking.customerEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
    hasToken: Boolean(tokenForBooking(booking)),
  });
}
