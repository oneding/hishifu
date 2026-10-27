import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ==========================================================================
 * 管理员（邮箱 + 密码登录，Resend 负责验证邮件 / 找回密码）
 * ========================================================================== */
export const admins = pgTable(
  "admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("admin"), // owner | admin | staff
    emailVerified: boolean("email_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("admins_email_unq").on(t.email)],
);

/** 管理员会话（httpOnly cookie 存明文 token，库里只存 sha256） */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_sessions_token_unq").on(t.tokenHash),
    index("admin_sessions_admin_idx").on(t.adminId),
  ],
);

/**
 * 邮件令牌：注册验证 / 找回密码 / 邮箱登录码
 * 库里只存哈希，链接里带明文，一次性消费
 */
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // verify_email | reset_password | login_code
    tokenHash: text("token_hash").notNull(),
    codeHash: text("code_hash"), // 6 位短码（登录/找回备用）
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_tokens_hash_unq").on(t.tokenHash),
    index("email_tokens_email_idx").on(t.email),
  ],
);

/* ==========================================================================
 * 课程 / 场地 / 场次
 * ========================================================================== */
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("published"), // draft | published
  durationMinutes: integer("duration_minutes").notNull().default(90),
  /** 实际授课语言，与「页面语言」分开标注 */
  taughtLanguages: jsonb("taught_languages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseTranslations = pgTable(
  "course_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(), // zh | en | fr | es | ru | ar（预留）
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    audience: text("audience").notNull().default(""),
    includes: text("includes").notNull().default(""), // 费用包含，换行分隔
    excludes: text("excludes").notNull().default(""), // 费用不包含
    cancelPolicy: text("cancel_policy").notNull().default(""),
    notes: text("notes").notNull().default(""),
  },
  (t) => [uniqueIndex("course_tr_unq").on(t.courseId, t.locale)],
);

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  mapUrl: text("map_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const venueTranslations = pgTable(
  "venue_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull().default(""),
    addressLine: text("address_line").notNull().default(""),
    directions: text("directions").notNull().default(""), // 到店指引
  },
  (t) => [uniqueIndex("venue_tr_unq").on(t.venueId, t.locale)],
);

/**
 * 场次：库存核心表。
 * seatsConfirmed = 已付款确认人数；seatsHeld = 待付款锁定位。
 * 防超卖依赖单条条件 UPDATE（见 lib/booking.ts），不依赖应用层读取判断。
 */
export const classSessions = pgTable(
  "class_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    capacity: integer("capacity").notNull().default(10),
    seatsConfirmed: integer("seats_confirmed").notNull().default(0),
    seatsHeld: integer("seats_held").notNull().default(0),
    status: text("status").notNull().default("open"), // open | closed | cancelled
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("class_sessions_start_idx").on(t.startAt),
    index("class_sessions_course_idx").on(t.courseId),
  ],
);

/* ==========================================================================
 * 订单 / 支付
 * ========================================================================== */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // 人类可读单号 XYQ-20261027-A1B2
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    locale: text("locale").notNull().default("zh"),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    /** 预约状态与支付/退款状态分别记录 */
    status: text("status").notNull().default("pending_payment"), // pending_payment | confirmed | cancelled | expired
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | paid | failed | refunded
    refundStatus: text("refund_status").notNull().default("none"), // none | requested | processing | refunded | failed
    /** 安全链接令牌：库里只存 sha256 用于校验 */
    accessTokenHash: text("access_token_hash").notNull(),
    /** 明文令牌的 AES-256-GCM 密文，仅用于「原样重发邮件」，不用于校验 */
    accessTokenCipher: text("access_token_cipher").notNull().default(""),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /** 同一表单重复提交的幂等键 */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_code_unq").on(t.code),
    uniqueIndex("bookings_idem_unq").on(t.idempotencyKey),
    index("bookings_email_idx").on(t.customerEmail),
    index("bookings_session_idx").on(t.sessionId),
    index("bookings_created_idx").on(t.createdAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("mock"),
    providerRef: text("provider_ref").notNull(), // 模拟支付流水号
    /** 支付通知去重：同一 eventId 只处理一次 */
    eventId: text("event_id").notNull(),
    status: text("status").notNull(), // succeeded | failed | abandoned
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_event_unq").on(t.eventId),
    index("payments_booking_idx").on(t.bookingId),
  ],
);

/* ==========================================================================
 * 邮件 / 审计 / 设置 / 幂等
 * ========================================================================== */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull().default(""),
    locale: text("locale").notNull().default("zh"),
    template: text("template").notNull().default(""),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    /** logged = 无 Key 时的降级记录（未真实发出） */
    status: text("status").notNull().default("queued"), // queued | sent | failed | logged
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    html: text("html").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_logs_created_idx").on(t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    adminEmail: text("admin_email").notNull().default(""),
    action: text("action").notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown> | string | number | boolean>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 通用幂等记录：重复点击 / 重复支付通知 / 重复退款 */
export const idempotencyRecords = pgTable("idempotency_records", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull().default(""),
  response: jsonb("response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
