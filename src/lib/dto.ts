import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, courseTranslations, courses, venueTranslations, venues } from "@/db/schema";
import { seatsLeft } from "./booking";

export type TranslationDTO = { locale: string } & Record<string, string>;

export type SessionDTO = {
  id: string;
  startAt: string;
  endAt: string;
  priceCents: number;
  currency: string;
  capacity: number;
  seatsConfirmed: number;
  seatsHeld: number;
  left: number;
  status: string;
  note: string;
  bookable: boolean;
  venueMapUrl: string;
  venue: TranslationDTO[];
};

export type CourseDTO = {
  id: string;
  slug: string;
  durationMinutes: number;
  taughtLanguages: string[];
  imageUrl: string | null;
  translations: TranslationDTO[];
  venues: { mapUrl: string; translations: TranslationDTO[] }[];
};

async function loadVenue(venueId: string | null) {
  if (!venueId) return { mapUrl: "", translations: [] as TranslationDTO[] };
  const db = await getDb();
  const v = (await db.select().from(venues).where(eq(venues.id, venueId)).limit(1))[0];
  const tr = await db.select().from(venueTranslations).where(eq(venueTranslations.venueId, venueId));
  return {
    mapUrl: v?.mapUrl ?? "",
    translations: tr.map((t) => ({
      locale: t.locale,
      name: t.name,
      addressLine: t.addressLine,
      directions: t.directions,
    })) as TranslationDTO[],
  };
}

export async function loadCourse(courseId: string): Promise<CourseDTO | null> {
  const db = await getDb();
  const c = (await db.select().from(courses).where(eq(courses.id, courseId)).limit(1))[0];
  if (!c) return null;
  const tr = await db.select().from(courseTranslations).where(eq(courseTranslations.courseId, c.id));
  return {
    id: c.id,
    slug: c.slug,
    durationMinutes: c.durationMinutes,
    taughtLanguages: (c.taughtLanguages as string[]) ?? [],
    imageUrl: c.imageUrl,
    translations: tr.map((t) => ({
      locale: t.locale,
      title: t.title,
      summary: t.summary,
      description: t.description,
      audience: t.audience,
      includes: t.includes,
      excludes: t.excludes,
      cancelPolicy: t.cancelPolicy,
      notes: t.notes,
    })) as TranslationDTO[],
    venues: [],
  };
}

export async function loadSessions(courseId: string): Promise<SessionDTO[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId))
    .orderBy(asc(classSessions.startAt));

  return Promise.all(
    rows.map(async (s) => {
      const venue = await loadVenue(s.venueId);
      return {
        id: s.id,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        priceCents: s.priceCents,
        currency: s.currency,
        capacity: s.capacity,
        seatsConfirmed: s.seatsConfirmed,
        seatsHeld: s.seatsHeld,
        left: seatsLeft(s),
        status: s.status,
        note: s.note,
        bookable: s.status === "open" && seatsLeft(s) > 0 && s.startAt.getTime() > Date.now(),
        venueMapUrl: venue.mapUrl,
        venue: venue.translations,
      };
    }),
  );
}

export async function loadCoursePage() {
  const db = await getDb();
  const c = (await db.select().from(courses).where(eq(courses.status, "published")).limit(1))[0];
  if (!c) return { course: null as CourseDTO | null, sessions: [] as SessionDTO[], venue: null };
  const course = await loadCourse(c.id);
  const sessions = await loadSessions(c.id);
  const venue = await loadVenue(sessions[0] ? await venueIdOfSession(sessions[0].id) : null);
  if (course) course.venues = [venue];
  return { course, sessions, venue };
}

async function venueIdOfSession(sessionId: string) {
  const db = await getDb();
  const s = (await db.select().from(classSessions).where(eq(classSessions.id, sessionId)).limit(1))[0];
  return s?.venueId ?? null;
}
