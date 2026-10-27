import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { courseTranslations, courses, venueTranslations, venues } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { CourseForm } from "../CourseForm";

export const dynamic = "force-dynamic";

export default async function CourseAdminPage() {
  const admin = await ensureAdmin();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);

  const db = await getDb();
  const course = (await db.select().from(courses).limit(1))[0];
  const venue = (await db.select().from(venues).limit(1))[0];

  const tr = course
    ? await db.select().from(courseTranslations).where(eq(courseTranslations.courseId, course.id))
    : [];
  const vtr = venue
    ? await db.select().from(venueTranslations).where(eq(venueTranslations.venueId, venue.id))
    : [];

  const pick = (l: string, f: string) => tr.find((t) => t.locale === l)?.[f as never] ?? "";
  const vpick = (l: string, f: string) => vtr.find((t) => t.locale === l)?.[f as never] ?? "";

  const initial = {
    courseId: course?.id ?? "",
    durationMinutes: course?.durationMinutes ?? 90,
    taughtLanguages: (course?.taughtLanguages as string[] | null)?.join(",") ?? "zh,en",
    venueId: venue?.id ?? "",
    mapUrl: venue?.mapUrl ?? "",
    zh: {
      title: String(pick("zh", "title")),
      summary: String(pick("zh", "summary")),
      description: String(pick("zh", "description")),
      audience: String(pick("zh", "audience")),
      includes: String(pick("zh", "includes")),
      excludes: String(pick("zh", "excludes")),
      cancelPolicy: String(pick("zh", "cancelPolicy")),
      notes: String(pick("zh", "notes")),
      venueName: String(vpick("zh", "name")),
      venueAddress: String(vpick("zh", "addressLine")),
      venueDirections: String(vpick("zh", "directions")),
    },
    en: {
      title: String(pick("en", "title")),
      summary: String(pick("en", "summary")),
      description: String(pick("en", "description")),
      audience: String(pick("en", "audience")),
      includes: String(pick("en", "includes")),
      excludes: String(pick("en", "excludes")),
      cancelPolicy: String(pick("en", "cancelPolicy")),
      notes: String(pick("en", "notes")),
      venueName: String(vpick("en", "name")),
      venueAddress: String(vpick("en", "addressLine")),
      venueDirections: String(vpick("en", "directions")),
    },
  };

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <CourseForm data={initial} />
    </AdminShell>
  );
}
