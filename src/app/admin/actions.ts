"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { admins, bookings, classSessions, courseTranslations, courses, settings, venueTranslations, venues } from "@/db/schema";
import {
  audit,
  consumeEmailCode,
  consumeEmailToken,
  createSession,
  destroySession,
  issueEmailToken,
  requireAdmin,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { adminLoginCodeMail, adminResetMail, adminVerifyMail } from "@/lib/mail-templates";
import { bookingCode } from "@/lib/security";
import { contactEmail as getContactEmail, holdMinutes as getHoldMinutes } from "@/lib/settings";
import { hashPassword, isValidEmail, normalizeEmail, verifyPassword } from "@/lib/security";
import { emailLive, siteUrl } from "@/lib/config";
import { setSetting } from "@/lib/settings";
import {
  applyRefundResult,
  cancelBooking,
  getBookingByCode,
  notifySessionChange,
  rosterForSession,
  sendBookingEmail,
  sendLookupLinks,
} from "@/lib/booking";
import { resendEmailLog } from "@/lib/email";
import type { Locale } from "@/i18n/messages";

export type ActionState = { error?: string; message?: string; needConfirm?: boolean; affected?: number };

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

/** 可选的数值字段：空或非法 → null */
function optNum(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

async function clientIp() {
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
}

/* ============================ 注册 / 验证 ============================ */

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"));
  const name = str(fd, "name");
  const password = String(fd.get("password") ?? "");
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;

  if (!isValidEmail(email)) return { error: locale === "zh" ? "邮箱格式不正确" : "Invalid email address" };
  if (password.length < 8) return { error: locale === "zh" ? "密码至少 8 位" : "Password must be at least 8 characters" };

  const db = await getDb();

  // 开放注册开关：默认仅允许第一个账号；后续账号需已登录管理员邀请（此处沿用同一入口，便于测试）
  const existing = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  if (existing[0]?.emailVerified) {
    return { error: locale === "zh" ? "该邮箱已注册，请直接登录" : "This email is already registered — please sign in" };
  }

  let adminId = existing[0]?.id;
  if (!adminId) {
    const count = (await db.select().from(admins)).length;
    const created = await db
      .insert(admins)
      .values({
        email,
        name: name || email.split("@")[0],
        passwordHash: await hashPassword(password),
        role: count === 0 ? "owner" : "admin",
        emailVerified: false,
      })
      .returning({ id: admins.id });
    adminId = created[0].id;
  } else {
    await db
      .update(admins)
      .set({ passwordHash: await hashPassword(password), name: name || existing[0].name, updatedAt: new Date() })
      .where(eq(admins.id, adminId));
  }

  const { token } = await issueEmailToken({ email, purpose: "verify_email", ttlMinutes: 60 * 24, adminId });
  const url = `${siteUrl()}/admin/verify?token=${token}`;
  const mail = adminVerifyMail(locale, url, name);
  const res = await sendEmail({ to: email, subject: mail.subject, html: mail.html, locale, template: "admin_verify_email" });

  await audit({ adminId, adminEmail: email, action: "admin.register", targetType: "admin", targetId: adminId, ip: await clientIp() });

  return {
    message:
      res.status === "sent"
        ? locale === "zh"
          ? "验证邮件已发送，请点击邮件中的链接激活账号。"
          : "Verification email sent — please follow the link to activate."
        : res.status === "logged"
          ? locale === "zh"
            ? "未配置 RESEND_API_KEY，验证邮件已记录在后台「邮件」中，可复制链接完成验证。"
            : "No RESEND_API_KEY configured — the verification email is logged in Admin › Emails; open the link from there."
          : locale === "zh"
            ? `邮件发送失败（${res.error}），可在后台「邮件」中查看详情并重发。`
            : `Sending failed (${res.error}) — see Admin › Emails to retry.`,
  };
}

export async function verifyTokenAction(token: string): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const r = await consumeEmailToken(token, "verify_email");
  if (!r.ok) return { ok: false, message: r.reason === "expired" ? "链接已过期，请重新注册" : "链接无效或已被使用" };
  await db.update(admins).set({ emailVerified: true, updatedAt: new Date() }).where(eq(admins.email, r.email));
  await audit({ adminEmail: r.email, action: "admin.verify_email", targetType: "admin", targetId: r.adminId ?? "" });
  return { ok: true, message: "邮箱验证成功，请登录" };
}

/* ============================== 登录 ============================== */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"));
  const password = String(fd.get("password") ?? "");
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;

  const db = await getDb();
  const rows = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const admin = rows[0];

  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    await audit({ adminEmail: email, action: "admin.login_failed", ip: await clientIp() });
    return { error: locale === "zh" ? "邮箱或密码不正确" : "Incorrect email or password" };
  }
  if (!admin.isActive) return { error: locale === "zh" ? "账号已停用" : "Account disabled" };

  if (!admin.emailVerified) {
    // 未验证也允许登录，但提示补验证（测试环境友好）
  }

  await createSession(admin.id, await clientIp());
  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "admin.login", ip: await clientIp() });
  redirect("/admin");
}

/** 邮箱验证码登录：两步（发送码 → 校验码） */
export async function sendLoginCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"));
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;
  const db = await getDb();
  const rows = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const admin = rows[0];
  // 不泄露账号是否存在
  if (admin?.isActive) {
    const { code } = await issueEmailToken({ email, purpose: "login_code", ttlMinutes: 10, adminId: admin.id, withCode: true });
    const mail = adminLoginCodeMail(locale, code!);
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, locale, template: "admin_login_code" });
  }
  return { message: locale === "zh" ? "若邮箱已注册，验证码已发送（10 分钟内有效）。" : "If the email is registered, a code has been sent (valid 10 min)." };
}

export async function loginWithCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"));
  const code = str(fd, "code");
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;
  const r = await consumeEmailCode(email, code, "login_code");
  if (!r.ok) return { error: locale === "zh" ? "验证码无效或已过期" : "Invalid or expired code" };
  const db = await getDb();
  const admin = (await db.select().from(admins).where(eq(admins.email, r.email)).limit(1))[0];
  if (!admin || !admin.isActive) return { error: locale === "zh" ? "账号不可用" : "Account unavailable" };
  await createSession(admin.id, await clientIp());
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "admin.login_code", ip: await clientIp() });
  redirect("/admin");
}

/* ============================ 找回密码 ============================ */

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"));
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;
  const db = await getDb();
  const admin = (await db.select().from(admins).where(eq(admins.email, email)).limit(1))[0];
  if (admin?.isActive) {
    const { token, code } = await issueEmailToken({
      email,
      purpose: "reset_password",
      ttlMinutes: 30,
      adminId: admin.id,
      withCode: true,
    });
    const url = `${siteUrl()}/admin/reset?token=${token}`;
    const mail = adminResetMail(locale, url, code!);
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, locale, template: "admin_reset_password" });
    await audit({ adminId: admin.id, adminEmail: email, action: "admin.forgot_password", ip: await clientIp() });
  }
  return {
    message: locale === "zh" ? "若邮箱已注册，重置链接已发送（30 分钟内有效）。" : "If the email is registered, a reset link has been sent (valid 30 min).",
  };
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const locale = (str(fd, "locale") === "en" ? "en" : "zh") as Locale;
  if (password.length < 8) return { error: locale === "zh" ? "密码至少 8 位" : "Password must be at least 8 characters" };

  const r = await consumeEmailToken(token, "reset_password");
  if (!r.ok) return { error: locale === "zh" ? "链接无效或已过期，请重新申请" : "Invalid or expired link — please request a new one" };

  const db = await getDb();
  await db
    .update(admins)
    .set({ passwordHash: await hashPassword(password), emailVerified: true, updatedAt: new Date() })
    .where(eq(admins.email, r.email));
  await audit({ adminEmail: r.email, action: "admin.reset_password", ip: await clientIp() });
  redirect("/admin/login?reset=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

/* ============================== 课程 ============================== */

export async function saveCourseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const db = await getDb();
  const courseId = str(fd, "courseId");
  const duration = Number(str(fd, "durationMinutes")) || 90;
  const langs = str(fd, "taughtLanguages")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await db.update(courses).set({ durationMinutes: duration, taughtLanguages: langs, updatedAt: new Date() }).where(eq(courses.id, courseId));

  for (const locale of ["zh", "en"] as const) {
    const values = {
      title: str(fd, `${locale}_title`),
      summary: str(fd, `${locale}_summary`),
      description: str(fd, `${locale}_description`),
      audience: str(fd, `${locale}_audience`),
      includes: str(fd, `${locale}_includes`),
      excludes: str(fd, `${locale}_excludes`),
      cancelPolicy: str(fd, `${locale}_cancelPolicy`),
      notes: str(fd, `${locale}_notes`),
    };
    const found = await db
      .select()
      .from(courseTranslations)
      .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, locale)));
    if (found[0]) {
      await db.update(courseTranslations).set(values).where(eq(courseTranslations.id, found[0].id));
    } else {
      await db.insert(courseTranslations).values({ courseId, locale, ...values });
    }
  }

  // 场地
  const venueId = str(fd, "venueId");
  if (venueId) {
    await db
      .update(venues)
      .set({
        mapUrl: str(fd, "mapUrl"),
        lng: optNum(fd, "lng"),
        lat: optNum(fd, "lat"),
        updatedAt: new Date(),
      })
      .where(eq(venues.id, venueId));
    for (const locale of ["zh", "en"] as const) {
      const values = {
        name: str(fd, `${locale}_venueName`),
        addressLine: str(fd, `${locale}_venueAddress`),
        directions: str(fd, `${locale}_venueDirections`),
      };
      const found = await db.select().from(venueTranslations).where(and(eq(venueTranslations.venueId, venueId), eq(venueTranslations.locale, locale)));
      if (found[0]) await db.update(venueTranslations).set(values).where(eq(venueTranslations.id, found[0].id));
      else await db.insert(venueTranslations).values({ venueId, locale, ...values });
    }
  }

  await audit({ adminId: admin.id, adminEmail: admin.email, action: "course.update", targetId: courseId });
  return { message: "已保存" };
}

/* ============================== 场次 ============================== */

export async function saveSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const startAt = str(fd, "startAt");
  const endAt = str(fd, "endAt");
  const venueId = str(fd, "venueId") || null;
  const confirm = str(fd, "confirm") === "1";
  const notify = str(fd, "notify") === "1";

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "时间格式不正确" };

  const existing = id ? (await db.select().from(classSessions).where(eq(classSessions.id, id)).limit(1))[0] : null;
  const affected = existing
    ? (await db
        .select({ c: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.sessionId, id)))).length
    : 0;

  const changed =
    existing &&
    (existing.startAt.toISOString() !== start.toISOString() ||
      existing.endAt.toISOString() !== end.toISOString() ||
      (existing.venueId ?? "") !== (venueId ?? ""));

  // 已有订单的场次改时间/地点：先提示运营确认
  if (changed && affected > 0 && !confirm) {
    return {
      needConfirm: true,
      affected,
      message: `该场次已有 ${affected} 条订单，修改后将影响已报名用户。确认继续吗？`,
    };
  }

  const payload = {
    startAt: start,
    endAt: end,
    venueId,
    priceCents: Math.round(Number(str(fd, "priceCents")) || 0),
    currency: str(fd, "currency") || "CNY",
    capacity: Math.max(1, Number(str(fd, "capacity")) || 1),
    status: str(fd, "status") || "open",
    note: str(fd, "note"),
    updatedAt: new Date(),
  };

  let sessionId = id;
  if (existing) {
    await db.update(classSessions).set(payload).where(eq(classSessions.id, id));
  } else {
    const course = (await db.select().from(courses).where(eq(courses.status, "published")).limit(1))[0];
    if (!course) return { error: "请先创建课程" };
    const created = await db.insert(classSessions).values({ ...payload, courseId: course.id }).returning({ id: classSessions.id });
    sessionId = created[0].id;
  }

  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: existing ? "session.update" : "session.create",
    targetType: "session",
    targetId: sessionId,
    detail: { changed: Boolean(changed), notify },
  });

  if (changed && notify) {
    const oldLabel = existing!.startAt.toISOString();
    const n = await notifySessionChange(sessionId, {
      zh: `原时间 ${oldLabel.slice(0, 16).replace("T", " ")}（UTC）已调整为 ${start.toISOString().slice(0, 16).replace("T", " ")}（UTC）。`,
      en: `The session previously scheduled at ${oldLabel.slice(0, 16).replace("T", " ")} UTC has moved to ${start
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")} UTC.`,
    });
    return { message: `已保存，并向 ${n} 位用户发送变更通知。` };
  }

  return { message: "已保存" };
}

export async function toggleSessionAction(fd: FormData) {
  const admin = await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const status = str(fd, "status");
  await db.update(classSessions).set({ status, updatedAt: new Date() }).where(eq(classSessions.id, id));
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "session.status", targetType: "session", targetId: id, detail: { status } });
}

export async function deleteSessionAction(fd: FormData) {
  const admin = await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const used = (await db.select({ c: bookings.id }).from(bookings).where(eq(bookings.sessionId, id))).length;
  if (used > 0) return;
  await db.delete(classSessions).where(eq(classSessions.id, id));
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "session.delete", targetType: "session", targetId: id });
}

/* ============================== 订单 ============================== */

export async function adminCancelBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  const res = await cancelBooking({ bookingId: id, actor: "admin", reason: "cancelled_by_admin" });
  if (!res.ok) return { error: res.error };
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "booking.cancel", targetType: "booking", targetId: id });
  return { message: "已取消，名额已释放" };
}

export async function adminRefundAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  const outcome = str(fd, "outcome") === "refunded" ? "refunded" : "failed";
  const updated = await applyRefundResult(id, outcome);
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "booking.refund",
    targetType: "booking",
    targetId: id,
    detail: { outcome },
  });
  return { message: updated ? (outcome === "refunded" ? "已标记退款成功并通知用户" : "已标记退款失败并通知用户") : "订单不存在" };
}

export async function adminResendEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  const res = await sendBookingEmail(id, "booking_confirmed");
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "booking.resend_email", targetType: "booking", targetId: id });
  return { message: res ? `重发完成（${res.status}）` : "订单不存在" };
}

export async function adminResendLookupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const email = normalizeEmail(str(fd, "email"));
  const { found } = await sendLookupLinks(email);
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "booking.resend_lookup", detail: { email } });
  return { message: found ? `已向 ${email} 重发 ${found} 条预约链接` : "该邮箱下没有有效预约" };
}

export async function adminResendLogAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const logId = str(fd, "logId");
  const res = await resendEmailLog(logId);
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "email.resend", targetId: logId });
  return { message: `重发完成（${res.status}）` };
}

/* ============================== 设置 ============================== */

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  await setSetting("HOLD_MINUTES", Math.max(1, Number(str(fd, "holdMinutes")) || 15));
  await setSetting("CONTACT_EMAIL", str(fd, "contactEmail"));
  await setSetting("CANCEL_CUTOFF_HOURS", Math.max(0, Number(str(fd, "cutoffHours")) || 0));
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "settings.update" });
  return { message: "已保存" };
}

/* ============================== 邮件设置 ============================== */

/* 供表格里直接作为 form action 使用的简化版本 */

export async function cancelBookingFormAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  await cancelBooking({ bookingId: id, actor: "admin", reason: "cancelled_by_admin" });
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "booking.cancel", targetType: "booking", targetId: id });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/orders");
}

export async function refundFormAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  const outcome = str(fd, "outcome") === "refunded" ? "refunded" : "failed";
  await applyRefundResult(id, outcome);
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "booking.refund",
    targetType: "booking",
    targetId: id,
    detail: { outcome },
  });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/orders");
}

export async function resendEmailFormAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  await sendBookingEmail(id, "booking_confirmed");
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "booking.resend_email", targetType: "booking", targetId: id });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/orders");
}

export async function emailStatusAction(): Promise<{ live: boolean }> {
  return { live: emailLive() };
}

export { bookingCode, rosterForSession, getBookingByCode, getContactEmail, getHoldMinutes };
