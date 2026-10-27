import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { CheckoutClient, type CheckoutDTO } from "@/components/CheckoutClient";
import { getBookingByCode } from "@/lib/booking";
import { getSessionRow } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();

  const b = await getBookingByCode(code);
  if (!b) notFound();
  const s = await getSessionRow(b.sessionId);
  if (!s) notFound();

  const dto: CheckoutDTO = {
    code: b.code,
    qty: b.qty,
    amountCents: b.amountCents,
    currency: b.currency,
    holdExpiresAt: b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    priceCents: s.priceCents,
    sessionId: s.id,
    status: b.status,
  };

  return (
    <SiteShell initialLocale={locale as Locale}>
      <CheckoutClient booking={dto} />
    </SiteShell>
  );
}
