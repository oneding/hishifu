import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { ResultClient } from "@/components/ResultClient";
import { getBookingByCode } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const b = await getBookingByCode(code);
  if (!b) notFound();

  return (
    <SiteShell initialLocale={locale as Locale}>
      <ResultClient code={b.code} initial={b.status as never} />
    </SiteShell>
  );
}
