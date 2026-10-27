import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { applyRefundResult } from "@/lib/booking";
import { audit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 标记退款结果（后台「订单」页按钮的等价接口）。
 * outcome=refunded 表示支付渠道通知退款成功；failed 表示退款未成功。
 * 申请退款（requested）由取消流程自动产生，两者分开记录。
 */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bookingId = String(body?.bookingId ?? "");
  const outcome = String(body?.outcome ?? "") === "refunded" ? "refunded" : "failed";

  const updated = await applyRefundResult(bookingId, outcome);
  if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "booking.refund",
    targetType: "booking",
    targetId: bookingId,
    detail: { outcome },
  });

  return NextResponse.json({
    ok: true,
    status: updated.status,
    paymentStatus: updated.paymentStatus,
    refundStatus: updated.refundStatus,
  });
}
