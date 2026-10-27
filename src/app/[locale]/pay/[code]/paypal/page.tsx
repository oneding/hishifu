/**
 * PayPal 批准后的回跳页：在这里完成 capture（真实扣款），再跳结果页。
 * 即便 webhook 没配，这条路径也能保证订单被确认。
 */
import { redirect } from "next/navigation";
import { getBookingByCode } from "@/lib/booking";
import { applyNormalizedEvent } from "@/lib/payments/apply";
import { capturePayPalOrder } from "@/lib/payments/paypal";
import { isLocale, type Locale } from "@/i18n/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PayPalReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ token?: string; PayerID?: string; cancel?: string }>;
}) {
  const { locale, code } = await params;
  const sp = await searchParams;
  const lang: Locale = isLocale(locale) ? locale : "zh";
  const back = `/${lang}/pay/${code}`;

  if (sp.cancel === "1" || !sp.token) redirect(`${back}?pp=cancelled`);

  const booking = await getBookingByCode(code);
  if (!booking) redirect(`${back}?pp=notfound`);

  // 已付款（webhook 先到 / 用户重复刷新）→ 直接去结果页
  if (booking.paymentStatus === "paid" || booking.status === "confirmed") {
    redirect(`/${lang}/r/${booking.code}`);
  }

  const captured = await capturePayPalOrder(String(sp.token));

  if (!captured.ok) {
    // 重复 capture 时 PayPal 会报 ORDER_ALREADY_CAPTURED；以数据库状态为准
    const fresh = await getBookingByCode(code);
    if (fresh && (fresh.paymentStatus === "paid" || fresh.status === "confirmed")) {
      redirect(`/${lang}/r/${fresh.code}`);
    }
    redirect(`${back}?pp=${encodeURIComponent(captured.error)}`);
  }

  await applyNormalizedEvent("paypal", {
    eventId: `capture:${captured.captureId}`,
    bookingCode: captured.bookingCode || booking.code,
    providerRef: captured.captureId,
    outcome: "succeeded",
    amountCents: captured.amountCents || booking.amountCents,
    currency: captured.currency || booking.currency,
  });

  redirect(`/${lang}/r/${booking.code}`);
}
