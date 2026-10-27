import { notFound } from "next/navigation";
import { OrderDetail, type OrderDTO } from "@/components/OrderDetail";
import { getBookingByToken } from "@/lib/booking";
import { courseContent, getSessionRow, venueContent } from "@/lib/booking";
import { contactEmail } from "@/lib/settings";
import { getDb } from "@/db";
import { courses, venues } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/messages";
import { cancelCutoffHours } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByToken(token);
  if (!b) notFound();

  const session = await getSessionRow(b.sessionId);
  if (!session) notFound();

  const db = await getDb();
  const course = (await db.select().from(courses).where(eq(courses.id, b.courseId)).limit(1))[0];
  const ct = await courseContent(b.courseId, b.locale as Locale);
  const vt = await venueContent(session.venueId, b.locale as Locale);
  const venue = session.venueId
    ? (await db.select().from(venues).where(eq(venues.id, session.venueId)).limit(1))[0]
    : null;

  const cutoff = await cancelCutoffHours();
  const hoursLeft = (session.startAt.getTime() - Date.now()) / 3600_000;

  const dto: OrderDTO = {
    code: b.code,
    courseTitle: ct?.title ?? course?.slug ?? "",
    startAt: session.startAt.toISOString(),
    endAt: session.endAt.toISOString(),
    qty: b.qty,
    amountCents: b.amountCents,
    currency: b.currency,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    status: b.status,
    paymentStatus: b.paymentStatus,
    refundStatus: b.refundStatus,
    venueName: vt?.name ?? "",
    venueAddress: vt?.addressLine ?? "",
    mapUrl: venue?.mapUrl ?? "",
    directions: vt?.directions ?? "",
    taughtLanguages: (course?.taughtLanguages as string[]) ?? [],
    contactEmail: await contactEmail(),
    cancelPolicy: ct?.cancelPolicy ?? "",
    canCancel:
      (b.status === "confirmed" || b.status === "pending_payment") &&
      hoursLeft >= cutoff &&
      session.startAt.getTime() > Date.now(),
    cutoffHours: cutoff,
    token,
  };

  return <OrderDetail order={dto} locale={(b.locale as Locale) || "zh"} />;
}
