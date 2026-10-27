import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { classSessions, courses, venues } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import { SessionsAdmin, type SessionRowDTO } from "../SessionsAdmin";

export const dynamic = "force-dynamic";

export default async function SessionsAdminPage() {
  const admin = await ensureAdmin();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);

  const db = await getDb();
  const venue = (await db.select().from(venues).limit(1))[0];
  const rows = await db.select().from(classSessions).orderBy(asc(classSessions.startAt));

  const sessions: SessionRowDTO[] = rows.map((s) => ({
    id: s.id,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    startInput: toShanghaiInput(s.startAt),
    endInput: toShanghaiInput(s.endAt),
    priceCents: s.priceCents,
    currency: s.currency,
    capacity: s.capacity,
    seatsConfirmed: s.seatsConfirmed,
    seatsHeld: s.seatsHeld,
    left: Math.max(0, s.capacity - s.seatsConfirmed - s.seatsHeld),
    status: s.status,
    note: s.note,
    venueId: s.venueId ?? venue?.id ?? "",
  }));

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <SessionsAdmin sessions={sessions} venueId={venue?.id ?? ""} />
    </AdminShell>
  );
}
