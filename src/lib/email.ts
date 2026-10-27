import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLogs } from "@/db/schema";
import type { Locale } from "@/i18n/messages";
import { emailFrom, emailLive, emailReplyTo, resendApiKey } from "./config";
import type { MailTemplate } from "./mail-templates";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  locale: Locale;
  template: MailTemplate;
  bookingId?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  logId: string;
  /** sent = 已交 Resend；logged = 降级未真发；failed = 发送失败 */
  status: "sent" | "logged" | "failed";
  error?: string;
}

/**
 * 统一发信入口。
 * - 有 RESEND_API_KEY：调用 Resend，成功写 sent，失败写 failed（订单状态不受影响）
 * - 无 Key：写 logged，邮件全文保留在后台「邮件管理」，可查看与重发
 * 任何情况下都会先落库一条记录，保证后台可审计。
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const db = await getDb();

  const [row] = await db
    .insert(emailLogs)
    .values({
      toEmail: input.to,
      subject: input.subject,
      locale: input.locale,
      template: input.template,
      bookingId: input.bookingId ?? null,
      status: emailLive() ? "queued" : "logged",
      html: input.html,
      attempts: emailLive() ? 1 : 0,
      sentAt: emailLive() ? undefined : new Date(),
    })
    .returning({ id: emailLogs.id });

  const logId = row.id;

  if (!emailLive()) {
    return { ok: true, logId, status: "logged" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey());
    const res = await resend.emails.send({
      from: emailFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(emailReplyTo() ? { replyTo: emailReplyTo() } : {}),
    });

    if (res?.error) {
      await db
        .update(emailLogs)
        .set({ status: "failed", error: String(res.error?.message ?? res.error), attempts: 1 })
        .where(eq(emailLogs.id, logId));
      return { ok: false, logId, status: "failed", error: String(res.error?.message ?? res.error) };
    }

    await db
      .update(emailLogs)
      .set({ status: "sent", providerMessageId: (res?.data as any)?.id ?? null, sentAt: new Date() })
      .where(eq(emailLogs.id, logId));
    return { ok: true, logId, status: "sent" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(emailLogs)
      .set({ status: "failed", error: msg, attempts: 1 })
      .where(eq(emailLogs.id, logId));
    return { ok: false, logId, status: "failed", error: msg };
  }
}

/** 后台重发：按日志记录原样再发一次（失败/未真发的都能重发） */
export async function resendEmailLog(logId: string): Promise<SendEmailResult> {
  const db = await getDb();
  const [log] = await db.select().from(emailLogs).where(eq(emailLogs.id, logId)).limit(1);
  if (!log) throw new Error("邮件记录不存在");

  const result = await sendEmail({
    to: log.toEmail,
    subject: log.subject,
    html: log.html,
    locale: (log.locale as Locale) || "zh",
    template: (log.template as MailTemplate) || "booking_confirmed",
    bookingId: log.bookingId,
  });

  await db
    .update(emailLogs)
    .set({ attempts: (log.attempts ?? 0) + 1 })
    .where(eq(emailLogs.id, logId));

  return result;
}

export async function listEmailLogs(limit = 100) {
  const db = await getDb();
  return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
}

export async function emailsForBooking(bookingId: string) {
  const db = await getDb();
  return db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.bookingId, bookingId))
    .orderBy(desc(emailLogs.createdAt));
}
