import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelBooking, getBookingByToken } from "@/lib/booking";
import { getSessionRow } from "@/lib/booking";
import { cancelCutoffHours } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const booking = await getBookingByToken(parsed.data.token);
  if (!booking) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const session = await getSessionRow(booking.sessionId);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const cutoffHours = await cancelCutoffHours();
  const hoursLeft = (session.startAt.getTime() - Date.now()) / 3600_000;

  if (hoursLeft < cutoffHours) {
    return NextResponse.json(
      {
        ok: false,
        error: "too_late",
        cutoffHours,
        hoursLeft: Math.max(0, Math.round(hoursLeft * 10) / 10),
      },
      { status: 409 },
    );
  }

  const res = await cancelBooking({
    bookingId: booking.id,
    actor: "customer",
    reason: "cancelled_by_customer",
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    status: res.booking.status,
    refundStatus: res.booking.refundStatus,
    refundRequested: res.refundRequested,
  });
}
