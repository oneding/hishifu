/**
 * 把各渠道归一化后的事件落到订单上（统一的金额校验 + 幂等）。
 */
import { applyPaymentNotification, getBookingByCode } from "@/lib/booking";
import type { NormalizedEvent, ProviderId } from "./types";

export type ApplyResult =
  | { ok: true; duplicated: boolean; status: string; paymentStatus: string }
  | { ok: false; error: string };

export async function applyNormalizedEvent(
  provider: ProviderId,
  ev: NormalizedEvent,
): Promise<ApplyResult> {
  const booking = await getBookingByCode(ev.bookingCode);
  if (!booking) return { ok: false, error: "booking_not_found" };

  // 金额与币种必须一致，防止被篡改或被渠道币种转换坑到
  if (ev.amountCents !== booking.amountCents || ev.currency !== booking.currency) {
    return { ok: false, error: "amount_mismatch" };
  }

  if (ev.outcome === "pending") return { ok: false, error: "pending_ignored" };

  const res = await applyPaymentNotification({
    bookingId: booking.id,
    providerRef: ev.providerRef,
    eventId: `${provider}:${ev.eventId}`,
    outcome: ev.outcome,
    amountCents: ev.amountCents,
    currency: ev.currency,
    provider,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    duplicated: res.duplicated,
    status: res.booking.status,
    paymentStatus: res.booking.paymentStatus,
  };
}
