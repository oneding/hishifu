/**
 * 纯配置：不含任何数据库/服务端依赖，客户端组件也可安全引入。
 * 需要读库的运营配置见 ./settings.ts
 */
export const TIMEZONE = "Asia/Shanghai";
export const TZ_LABEL = "UTC+8";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function authSecret(): string {
  return process.env.AUTH_SECRET || "dev-only-secret-please-change";
}

export function paymentWebhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET || "dev-payment-secret";
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Xingyi Experience <onboarding@resend.dev>";
}

export function emailReplyTo(): string | undefined {
  return process.env.EMAIL_REPLY_TO || undefined;
}

export function resendApiKey(): string {
  return (process.env.RESEND_API_KEY || "").trim();
}

/** 是否真实发信；无 Key 时降级为后台可查的邮件日志 */
export function emailLive(): boolean {
  return Boolean(resendApiKey());
}
