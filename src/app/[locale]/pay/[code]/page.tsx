import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { PayClient } from "@/components/PayClient";
import { getBookingByCode } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const b = await getBookingByCode(code);
  if (!b) notFound();

  return (
    <SiteShell initialLocale={locale as Locale} showNav={false}>
      <PayClient code={b.code} amountCents={b.amountCents} currency={b.currency} />
    </SiteShell>
  );
}
