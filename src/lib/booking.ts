import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  courseTranslations,
  courses,
  customers,
  payments,
  venueTranslations,
  venues,
} from "@/db/schema";
import type { Locale } from "@/i18n/messages";
import { siteUrl } from "./config";
import { buildMapUrl } from "./map";
import { contactEmail, holdMinutes } from "./settings";
import { sendEmail } from "./email";
import type { BookingMailData } from "./mail-templates";
import {
  adminResetMail,
  bookingCancelledMail,
  bookingConfirmedMail,
  lookupLinkMail,
  refundUpdateMail,
  sessionChangedMail,
} from "./mail-templates";
import { bookingCode, decryptToken, encryptToken, randomToken, sha256Hex } from "./security";

export type BookingRow = typeof bookings.$inferSelect;
export type SessionRow = typeof classSessions.$inferSelect;

/* ============================ 查询 ============================ */

export async function getPublishedCourse() {
  const db = await getDb();
  const rows = await db.select().from(courses).where(eq(courses.status, "published")).limit(1);
  return rows[0] ?? null;
}

export async function availableSessions(courseId: string) {
  const db = await getDb();
  return db
    .select()
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId))
    .orderBy(asc(classSessions.startAt));
}

export function seatsLeft(s: SessionRow): number {
  return Math.max(0, s.capacity - s.seatsConfirmed - s.seatsHeld);
}

export function isBookable(s: SessionRow): boolean {
  return s.status === "open" && seatsLeft(s) > 0 && s.startAt.getTime() > Date.now();
}

/** 课程 + 指定语言的翻译（fallback 到另一种语言） */
export async function courseContent(courseId: string, locale: Locale) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(courseTranslations)
    .where(eq(courseTranslations.courseId, courseId));
  const pick =
    rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "zh") ?? rows[0] ?? null;
  return pick;
}

export async function venueContent(venueId: string | null, locale: Locale) {
  if (!venueId) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(venueTranslations)
    .where(eq(venueTranslations.venueId, venueId));
  return (
    rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "zh") ?? rows[0] ?? null
  );
}

export async function getSessionRow(sessionId: string) {
  const db = await getDb();
  const rows = await db.select().from(classSessions).where(eq(classSessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

/* ========================== 创建订单 ========================== */

export interface CreateBookingInput {
  sessionId: string;
  name: string;
  email: string;
  qty: number;
  locale: Locale;
  idempotencyKey?: string | null;
}

export type CreateBookingResult =
  | { ok: true; booking: BookingRow; accessToken: string; duplicated: boolean }
  | { ok: false; error: "session_not_found" | "closed" | "sold_out" | "invalid_qty" | "blocked" };

/**
 * 下单后同步客户档案（以邮箱为唯一键）。
 * 仅补录姓名/语言，不覆盖已有姓名；失败不影响下单主流程。
 */
export async function syncCustomer(email: string, name: string, locale: Locale): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  try {
    const db = await getDb();
    const found = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.email, key))
      .limit(1);
    if (!found[0]) {
      await db.insert(customers).values({ email: key, name: name.trim(), locale });
    } else if (!found[0].name && name.trim()) {
      await db.update(customers).set({ name: name.trim(), updatedAt: new Date() }).where(eq(customers.id, found[0].id));
    }
  } catch {
    /* 客户档案写入失败不影响下单 */
  }
}

/** 客户是否被列入黑名单 */
export async function isCustomerBlocked(email: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  if (!key) return false;
  try {
    const db = await getDb();
    const row = await db
      .select({ blocked: customers.isBlocked })
      .from(customers)
      .where(eq(customers.email, key))
      .limit(1);
    return Boolean(row[0]?.blocked);
  } catch {
    return false;
  }
}

/**
 * 创建待付款订单并临时锁位。
 * 防超卖的关键：单条条件 UPDATE —— 数据库层面原子判定
 * `seats_confirmed + seats_held + qty <= capacity`，并发下绝不会超卖。
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const db = await getDb();
  const qty = Math.max(1, Math.floor(input.qty || 1));
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: "invalid_qty" };

  // 幂等：同一表单重复提交（双击 / 刷新）返回第一次的订单
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      return { ok: true, booking: existing[0], accessToken: "", duplicated: true };
    }
  }

  const session = await getSessionRow(input.sessionId);
  if (!session) return { ok: false, error: "session_not_found" };
  if (session.status !== "open") return { ok: false, error: "closed" };

  // 黑名单客户禁止下单
  if (await isCustomerBlocked(input.email)) return { ok: false, error: "blocked" };

  const holdMin = await holdMinutes();
  const accessToken = randomToken(32);

  try {
    const result = await db.transaction(async (tx) => {
      // 1) 原子占座。返回 0 行 = 名额不足或已关闭
      const upd = await (tx as any).execute(
        sql`update class_sessions
            set seats_held = seats_held + ${qty}, updated_at = now()
            where id = ${input.sessionId}
              and status = 'open'
              and seats_confirmed + seats_held + ${qty} <= capacity
            returning *`,
      );
      const rows: any[] = upd?.rows ?? upd ?? [];
      if (!rows.length) throw new Error("SOLD_OUT");
      const s = rows[0];

      // 2) 建单
      const code = bookingCode();
      const expiresAt = new Date(Date.now() + holdMin * 60_000);
      const inserted = await (tx as any)
        .insert(bookings)
        .values({
          code,
          courseId: s.course_id,
          sessionId: s.id,
          customerName: input.name.trim(),
          customerEmail: input.email.trim().toLowerCase(),
          locale: input.locale,
          qty,
          unitPriceCents: s.price_cents,
          amountCents: s.price_cents * qty,
          currency: s.currency,
          status: "pending_payment",
          paymentStatus: "unpaid",
          refundStatus: "none",
          accessTokenHash: sha256Hex(accessToken),
          accessTokenCipher: encryptToken(accessToken),
          holdExpiresAt: expiresAt,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
      return inserted[0] as BookingRow;
    });

    void syncCustomer(result.customerEmail, result.customerName, result.locale as Locale).catch(() => {});

    return { ok: true, booking: result, accessToken, duplicated: false };
  } catch (e) {
    if ((e as Error)?.message === "SOLD_OUT") return { ok: false, error: "sold_out" };
    // 并发下唯一键冲突 → 视为重复提交，回查原单
    if (input.idempotencyKey) {
      const existing = await db
        .select()
        .from(bookings)
        .where(eq(bookings.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing[0]) return { ok: true, booking: existing[0], accessToken: "", duplicated: true };
    }
    throw e;
  }
}

/* ====================== 支付通知（服务端核验） ====================== */

export type PaymentOutcome = "succeeded" | "failed" | "abandoned";

export interface PaymentNotifyInput {
  bookingId: string;
  providerRef: string;
  eventId: string;
  outcome: PaymentOutcome;
  amountCents: number;
  currency: string;
  /** 渠道标识：mock | stripe | paypal | wechat */
  provider?: string;
}

export type PaymentNotifyResult =
  | { ok: true; booking: BookingRow; duplicated: boolean }
  | { ok: false; error: string };

/**
 * 以服务端核验的支付通知为准更新状态：
 * - event_id 唯一 → 重复通知幂等，不重复扣减名额、不重复发邮件
 * - 已 paid 的订单再次收到成功通知 → 直接返回，不重复确认
 */
export async function applyPaymentNotification(
  input: PaymentNotifyInput,
): Promise<PaymentNotifyResult> {
  const db = await getDb();

  const dup = await db
    .select()
    .from(payments)
    .where(eq(payments.eventId, input.eventId))
    .limit(1);
  const booking = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1)
    .then((r) => r[0]);
  if (dup.length) {
    return booking ? { ok: true, booking, duplicated: true } : { ok: false, error: "booking_not_found" };
  }
  if (!booking) return { ok: false, error: "booking_not_found" };

  const alreadyPaid = booking.paymentStatus === "paid";
  const succeeded = input.outcome === "succeeded";

  const updated = await db.transaction(async (tx) => {
    await (tx as any).insert(payments).values({
      bookingId: booking.id,
      provider: input.provider ?? "mock",
      providerRef: input.providerRef,
      eventId: input.eventId,
      status: input.outcome,
      amountCents: input.amountCents,
      currency: input.currency,
      raw: { simulated: true, at: new Date().toISOString() },
    });

    if (succeeded && !alreadyPaid) {
      // held → confirmed 原子转换
      const upd = await (tx as any).execute(
        sql`update class_sessions
            set seats_held = greatest(seats_held - ${booking.qty}, 0),
                seats_confirmed = seats_confirmed + ${booking.qty},
                updated_at = now()
            where id = ${booking.sessionId}
            returning *`,
      );
      if (!(upd?.rows ?? upd ?? []).length) throw new Error("SESSION_MISSING");

      const r = await (tx as any)
        .update(bookings)
        .set({
          status: "confirmed",
          paymentStatus: "paid",
          confirmedAt: new Date(),
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, booking.id), ne(bookings.paymentStatus, "paid")))
        .returning();
      return r[0] ?? booking;
    }

    if (succeeded && alreadyPaid) return booking;

    // 失败 / 放弃：释放锁位
    const upd = await (tx as any).execute(
      sql`update class_sessions
          set seats_held = greatest(seats_held - ${booking.qty}, 0), updated_at = now()
          where id = ${booking.sessionId}
          returning *`,
    );
    if (!(upd?.rows ?? upd ?? []).length) throw new Error("SESSION_MISSING");

    const r = await (tx as any)
      .update(bookings)
      .set({
        status: input.outcome === "failed" ? "cancelled" : "expired",
        paymentStatus: input.outcome === "failed" ? "failed" : "unpaid",
        cancelledAt: new Date(),
        holdExpiresAt: null,
        cancelReason: input.outcome === "failed" ? "payment_failed" : "payment_abandoned",
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();
    return r[0] ?? booking;
  });

  // 仅在「首次确认成功」时发确认邮件，重复通知不发
  if (succeeded && !alreadyPaid) {
    void sendBookingEmail(updated.id, "booking_confirmed").catch(() => {});
  }

  return { ok: true, booking: updated, duplicated: false };
}

/* ========================== 锁位释放 ========================== */

/** 超时未付款 → 释放锁位并标记 expired */
export async function releaseExpiredHolds(): Promise<number> {
  const db = await getDb();
  const expired = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "pending_payment"),
        lte(bookings.holdExpiresAt, new Date()),
      ),
    );
  let n = 0;
  for (const b of expired) {
    await db.transaction(async (tx) => {
      await (tx as any).execute(
        sql`update class_sessions
            set seats_held = greatest(seats_held - ${b.qty}, 0), updated_at = now()
            where id = ${b.sessionId}`,
      );
      await (tx as any)
        .update(bookings)
        .set({
          status: "expired",
          cancelledAt: new Date(),
          cancelReason: "hold_timeout",
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, "pending_payment")));
    });
    n++;
  }
  return n;
}

/* ========================== 取消 / 退款 ========================== */

export type CancelResult = { ok: true; booking: BookingRow; refundRequested: boolean } | { ok: false; error: string };

export async function cancelBooking(opts: {
  bookingId: string;
  reason?: string;
  actor: "customer" | "admin";
}): Promise<CancelResult> {
  const db = await getDb();
  const booking = await db.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1).then((r) => r[0]);
  if (!booking) return { ok: false, error: "not_found" };
  if (["cancelled", "expired"].includes(booking.status)) {
    return { ok: true, booking, refundRequested: booking.refundStatus !== "none" };
  }

  const wasConfirmed = booking.status === "confirmed";
  const wasPaid = booking.paymentStatus === "paid";

  const updated = await db.transaction(async (tx) => {
    if (wasConfirmed) {
      await (tx as any).execute(
        sql`update class_sessions
            set seats_confirmed = greatest(seats_confirmed - ${booking.qty}, 0), updated_at = now()
            where id = ${booking.sessionId}`,
      );
    } else {
      await (tx as any).execute(
        sql`update class_sessions
            set seats_held = greatest(seats_held - ${booking.qty}, 0), updated_at = now()
            where id = ${booking.sessionId}`,
      );
    }
    const r = await (tx as any)
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: opts.reason ?? (opts.actor === "admin" ? "cancelled_by_admin" : "cancelled_by_customer"),
        // 申请退款 ≠ 退款成功：这里只置为 requested，最终以支付渠道通知为准
        refundStatus: wasPaid ? "requested" : "none",
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();
    return r[0] as BookingRow;
  });

  void sendBookingEmail(updated.id, "booking_cancelled").catch(() => {});
  if (wasPaid) void sendBookingEmail(updated.id, "refund_requested").catch(() => {});

  return { ok: true, booking: updated, refundRequested: wasPaid };
}

/**
 * 后台执行模拟退款。outcome 由「支付渠道通知」决定，
 * 这里由运营在后台选择通知结果（成功 / 失败），保持与真实渠道一致的状态语义。
 */
export async function applyRefundResult(bookingId: string, outcome: "refunded" | "failed") {
  const db = await getDb();
  const r = await db
    .update(bookings)
    .set({
      refundStatus: outcome === "refunded" ? "refunded" : "failed",
      paymentStatus: outcome === "refunded" ? "refunded" : "paid",
      refundedAt: outcome === "refunded" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning();
  const updated = r[0];
  if (updated) {
    void sendBookingEmail(updated.id, outcome === "refunded" ? "refund_completed" : "refund_failed").catch(() => {});
  }
  return updated;
}

/** 失败/超时后重新支付：重新锁位（需重新校验余位） */
export async function retryBooking(bookingId: string) {
  const db = await getDb();
  const b = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).then((r) => r[0]);
  if (!b) return { ok: false as const, error: "not_found" };
  if (b.status === "confirmed") return { ok: true as const, booking: b };

  const holdMin = await holdMinutes();
  try {
    const updated = await db.transaction(async (tx) => {
      const upd = await (tx as any).execute(
        sql`update class_sessions
            set seats_held = seats_held + ${b.qty}, updated_at = now()
            where id = ${b.sessionId}
              and status = 'open'
              and seats_confirmed + seats_held + ${b.qty} <= capacity
            returning *`,
      );
      if (!(upd?.rows ?? upd ?? []).length) throw new Error("SOLD_OUT");
      const r = await (tx as any)
        .update(bookings)
        .set({
          status: "pending_payment",
          paymentStatus: "unpaid",
          refundStatus: "none",
          cancelledAt: null,
          cancelReason: null,
          holdExpiresAt: new Date(Date.now() + holdMin * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, b.id))
        .returning();
      return r[0] as BookingRow;
    });
    return { ok: true as const, booking: updated };
  } catch (e) {
    if ((e as Error)?.message === "SOLD_OUT") return { ok: false as const, error: "sold_out" };
    throw e;
  }
}

/* ========================== 安全链接 ========================== */

export async function getBookingByToken(token: string) {
  const db = await getDb();
  const r = await db
    .select()
    .from(bookings)
    .where(eq(bookings.accessTokenHash, sha256Hex(token)))
    .limit(1);
  return r[0] ?? null;
}

export async function getBookingByCode(code: string) {
  const db = await getDb();
  const r = await db.select().from(bookings).where(eq(bookings.code, code)).limit(1);
  return r[0] ?? null;
}

/** 按邮箱找回：返回该邮箱名下有效订单（口令不落库明文） */
export async function lookupByEmail(email: string) {
  const db = await getDb();
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.customerEmail, email.trim().toLowerCase()), ne(bookings.status, "expired")))
    .orderBy(desc(bookings.createdAt));
}

/* ========================== 邮件发送 ========================== */

/** 还原订单安全链接明文令牌（仅用于重发邮件，不用于校验） */
export function tokenForBooking(b: BookingRow): string {
  return b.accessTokenCipher ? decryptToken(b.accessTokenCipher) ?? "" : "";
}

export async function buildBookingMailData(
  booking: BookingRow,
  locale: Locale,
): Promise<BookingMailData> {
  const db = await getDb();
  const session = (await db.select().from(classSessions).where(eq(classSessions.id, booking.sessionId)).limit(1))[0];
  const course = (await db.select().from(courses).where(eq(courses.id, booking.courseId)).limit(1))[0];
  const venue = session?.venueId
    ? (await db.select().from(venues).where(eq(venues.id, session.venueId)).limit(1))[0]
    : null;
  const ct = await courseContent(booking.courseId, locale);
  const vt = await venueContent(session?.venueId ?? null, locale);

  const token = tokenForBooking(booking);
  const orderUrl = token ? `${siteUrl()}/o/${token}` : `${siteUrl()}/lookup`;

  return {
    code: booking.code,
    courseTitle: ct?.title || course?.slug || "",
    startAt: session?.startAt ?? new Date(),
    endAt: session?.endAt ?? new Date(),
    qty: booking.qty,
    amountCents: booking.amountCents,
    currency: booking.currency,
    venueName: vt?.name ?? "",
    venueAddress: vt?.addressLine ?? "",
    // 有经纬度 → 高德定位链接；否则回退 mapUrl
    mapUrl: buildMapUrl(venue, vt?.name || undefined),
    directions: vt?.directions ?? "",
    taughtLanguages: (course?.taughtLanguages as string[]) ?? [],
    contactEmail: await contactEmail(),
    cancelPolicy: ct?.cancelPolicy ?? "",
    orderUrl,
  };
}

export type BookingEmailKind =
  | "booking_confirmed"
  | "booking_cancelled"
  | "refund_requested"
  | "refund_completed"
  | "refund_failed";

/** 邮件发送失败绝不影响订单状态（只写日志，后台可重发） */
export async function sendBookingEmail(bookingId: string, kind: BookingEmailKind) {
  const db = await getDb();
  const b = (await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
  if (!b) return null;
  const locale = (b.locale as Locale) || "zh";
  const data = await buildBookingMailData(b, locale);

  let mail: { subject: string; html: string };
  let template: any = kind;
  if (kind === "booking_confirmed") mail = bookingConfirmedMail(locale, data);
  else if (kind === "booking_cancelled") mail = bookingCancelledMail(locale, data);
  else if (kind === "refund_requested") mail = refundUpdateMail(locale, data, "requested");
  else if (kind === "refund_completed") mail = refundUpdateMail(locale, data, "refunded");
  else mail = refundUpdateMail(locale, data, "failed");

  return sendEmail({
    to: b.customerEmail,
    subject: mail.subject,
    html: mail.html,
    locale,
    template,
    bookingId: b.id,
  });
}

/** 场次改期/改地点后通知已报名用户 */
export async function notifySessionChange(
  sessionId: string,
  changeNote: { zh: string; en: string },
): Promise<number> {
  const db = await getDb();
  const affected = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), or(eq(bookings.status, "confirmed"), eq(bookings.status, "pending_payment"))));
  let n = 0;
  for (const b of affected) {
    const locale = (b.locale as Locale) || "zh";
    const data = await buildBookingMailData(b, locale);
    const mail = sessionChangedMail(locale, data, changeNote);
    await sendEmail({
      to: b.customerEmail,
      subject: mail.subject,
      html: mail.html,
      locale,
      template: "session_changed",
      bookingId: b.id,
    });
    n++;
  }
  return n;
}

/** 凭邮箱重发订单链接（一次列出该邮箱所有有效预约） */
export async function sendLookupLinks(email: string) {
  const list = await lookupByEmail(email);
  if (!list.length) return { found: 0 };
  const db = await getDb();
  const byLocale = new Map<string, typeof list>();
  for (const b of list) {
    const l = (b.locale as Locale) || "zh";
    byLocale.set(l, [...(byLocale.get(l) ?? []), b]);
  }
  for (const [locale, items] of byLocale) {
    const payload = await Promise.all(
      items.map(async (b) => {
        const s = (await db.select().from(classSessions).where(eq(classSessions.id, b.sessionId)).limit(1))[0];
        const ct = await courseContent(b.courseId, locale as Locale);
        return {
          code: b.code,
          courseTitle: ct?.title ?? "",
          url: `${siteUrl()}/o/${tokenForBooking(b)}`,
          startAt: s?.startAt ?? new Date(),
          endAt: s?.endAt ?? new Date(),
        };
      }),
    );
    const mail = lookupLinkMail(locale as Locale, payload);
    await sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      locale: locale as Locale,
      template: "lookup_link",
    });
  }
  return { found: list.length };
}

/* ========================== 后台统计 ========================== */

export async function sessionStats(sessionId: string) {
  const s = await getSessionRow(sessionId);
  if (!s) return null;
  return {
    capacity: s.capacity,
    confirmed: s.seatsConfirmed,
    held: s.seatsHeld,
    left: seatsLeft(s),
  };
}

export async function listBookings(filter?: { sessionId?: string; status?: string; q?: string }) {
  const db = await getDb();
  const conds = [];
  if (filter?.sessionId) conds.push(eq(bookings.sessionId, filter.sessionId));
  if (filter?.status && filter.status !== "all") conds.push(eq(bookings.status, filter.status));
  if (filter?.q) {
    const like = `%${filter.q}%`;
    conds.push(
      or(sql`${bookings.code} ilike ${like}`, sql`${bookings.customerEmail} ilike ${like}`, sql`${bookings.customerName} ilike ${like}`)!,
    );
  }
  const rows = await db
    .select()
    .from(bookings)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(500);
  return rows;
}

export async function rosterForSession(sessionId: string) {
  const db = await getDb();
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), inArray(bookings.status, ["confirmed", "pending_payment"])))
    .orderBy(asc(bookings.createdAt));
}

export { adminResetMail };
