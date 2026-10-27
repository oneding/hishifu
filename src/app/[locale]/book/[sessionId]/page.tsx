import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { BookingForm } from "@/components/BookingForm";
import { loadCoursePage } from "@/lib/dto";
import { holdMinutes } from "@/lib/settings";
import { releaseExpiredHolds } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  if (!isLocale(locale)) notFound();
  void releaseExpiredHolds().catch(() => {});

  const { course, sessions } = await loadCoursePage();
  const session = sessions.find((s) => s.id === sessionId);
  if (!course || !session) notFound();

  const hold = await holdMinutes();

  return (
    <SiteShell initialLocale={locale as Locale}>
      <BookingForm session={session} course={course} holdMinutes={hold} />
    </SiteShell>
  );
}
