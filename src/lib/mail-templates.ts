import type { Locale } from "@/i18n/messages";
import { formatDateTimeFull, formatMoney, labelLanguages } from "./format";
import { siteUrl } from "./config";

export type MailTemplate =
  | "booking_confirmed"
  | "booking_cancelled"
  | "refund_update"
  | "session_changed"
  | "lookup_link"
  | "admin_verify_email"
  | "admin_reset_password"
  | "admin_login_code";

export interface BookingMailData {
  code: string;
  courseTitle: string;
  startAt: Date | string;
  endAt: Date | string;
  qty: number;
  amountCents: number;
  currency: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  directions: string;
  taughtLanguages: string[];
  contactEmail: string;
  cancelPolicy: string;
  orderUrl: string;
}

const accent = "#b91c1c";
const ink = "#0f172a";
const muted = "#64748b";
const line = "#e2e8f0";
const bg = "#f8fafc";

function layout(opts: {
  locale: Locale;
  title: string;
  preheader: string;
  body: string;
  footerNote: string;
}): string {
  const dir = opts.locale === "en" ? "ltr" : "ltr";
  return `<!doctype html><html lang="${opts.locale}" dir="${dir}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif;color:${ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${line};border-radius:14px;overflow:hidden;">
<tr><td style="background:${ink};padding:20px 24px;">
  <div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.3px;">${opts.locale === "zh" ? "形意拳体验 · 上海" : "Xingyi Experience · Shanghai"}</div>
  <div style="color:#94a3b8;font-size:12px;margin-top:4px;">${opts.locale === "zh" ? "零基础形意拳体验课" : "Beginner Xingyiquan Taster Class"}</div>
</td></tr>
<tr><td style="padding:24px;">
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;">${esc(opts.title)}</h1>
  ${opts.body}
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid ${line};color:${muted};font-size:12px;line-height:1.7;">
  ${opts.footerNote}
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(s: string): string {
  return esc(s)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => `<div>${l}</div>`)
    .join("");
}

function kv(label: string, value: string): string {
  return `<tr><td style="padding:7px 0;color:${muted};font-size:13px;vertical-align:top;width:120px;">${esc(
    label,
  )}</td><td style="padding:7px 0;font-size:14px;font-weight:600;">${value}</td></tr>`;
}

function button(locale: Locale, href: string, text: string): string {
  return `<div style="margin:22px 0;">
  <a href="${esc(href)}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">${esc(
    text,
  )}</a></div>
  <div style="color:${muted};font-size:12px;word-break:break-all;">${esc(href)}</div>`;
}

function bookingTable(locale: Locale, d: BookingMailData): string {
  const L = locale === "zh";
  const rows = [
    kv(L ? "订单编号" : "Booking reference", esc(d.code)),
    kv(L ? "课程" : "Class", esc(d.courseTitle)),
    kv(
      L ? "上课时间" : "Date & time",
      esc(formatDateTimeFull(d.startAt, d.endAt, locale)),
    ),
    kv(L ? "人数" : "Participants", `${d.qty} ${L ? "人" : d.qty > 1 ? "people" : "person"}`),
    kv(L ? "金额" : "Amount", esc(formatMoney(d.amountCents, d.currency, locale))),
    kv(L ? "场地" : "Venue", `${esc(d.venueName)}<div style="font-weight:400;color:${muted};font-size:13px;">${esc(
      d.venueAddress,
    )}</div>`),
    d.mapUrl
      ? kv(
          L ? "地图" : "Map",
          `<a href="${esc(d.mapUrl)}" style="color:${accent};text-decoration:none;">${
            L ? "点击打开地图导航" : "Open in maps"
          }</a>`,
        )
      : "",
    d.directions
      ? kv(L ? "到店指引" : "Getting there", `<div style="font-weight:400;font-size:13px;">${nl2br(
          d.directions,
        )}</div>`)
      : "",
    kv(L ? "实际授课语言" : "Language of instruction", esc(labelLanguages(d.taughtLanguages, locale))),
    kv(L ? "联系方式" : "Contact", `<a href="mailto:${esc(d.contactEmail)}" style="color:${accent};text-decoration:none;">${esc(
      d.contactEmail,
    )}</a>`),
  ]
    .filter(Boolean)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${line};border-radius:10px;padding:4px 14px;">${rows}</table>`;
}

function policyBlock(locale: Locale, policy: string): string {
  if (!policy) return "";
  return `<div style="margin-top:20px;padding:14px 16px;background:${bg};border-radius:10px;">
  <div style="font-size:13px;font-weight:700;margin-bottom:6px;">${
    locale === "zh" ? "取消与退款规则" : "Cancellation & refund policy"
  }</div>
  <div style="font-size:13px;line-height:1.8;color:#334155;">${nl2br(policy)}</div></div>`;
}

/* ============================ 具体模板 ============================ */

export function bookingConfirmedMail(locale: Locale, d: BookingMailData) {
  const L = locale === "zh";
  const subject = L
    ? `【预约成功】${d.courseTitle} · ${d.code}`
    : `Booking confirmed · ${d.courseTitle} · ${d.code}`;
  const body = `
    <p style="font-size:14px;line-height:1.8;">${
      L
        ? "感谢预约！您的名额已确认，请按以下信息准时到场。"
        : "Thank you for booking! Your place is confirmed — please see the details below."
    }</p>
    ${bookingTable(locale, d)}
    ${button(locale, d.orderUrl, L ? "查看我的预约" : "View my booking")}
    <p style="font-size:12px;color:${muted};line-height:1.8;">${
      L
        ? "本链接为一次性安全链接，请勿转发他人；关闭网页后仍可从邮件直接打开，无需登录。"
        : "This is a private, unguessable link — please don't forward it. You can reopen it from this email at any time, no login needed."
    }</p>
    ${policyBlock(locale, d.cancelPolicy)}
  `;
  const html = layout({
    locale,
    title: L ? "预约已确认" : "Your booking is confirmed",
    preheader: `${d.courseTitle} · ${formatDateTimeFull(d.startAt, d.endAt, locale)}`,
    body,
    footerNote: L
      ? "本邮件由系统自动发送，请勿直接回复。如有疑问请联系上方联系方式。"
      : "This is an automated message — please don't reply directly. Use the contact address above for questions.",
  });
  return { subject, html };
}

export function bookingCancelledMail(locale: Locale, d: BookingMailData) {
  const L = locale === "zh";
  const subject = L
    ? `【预约已取消】${d.courseTitle} · ${d.code}`
    : `Booking cancelled · ${d.courseTitle} · ${d.code}`;
  const body = `
    <p style="font-size:14px;line-height:1.8;">${
      L
        ? "您的预约已取消，名额已释放。若符合条件，退款将按规则原路退回。"
        : "Your booking has been cancelled and the seats released. Where eligible, the refund follows the policy."
    }</p>
    ${bookingTable(locale, d)}
    ${button(locale, d.orderUrl, L ? "查看详情" : "View details")}
    ${policyBlock(locale, d.cancelPolicy)}
  `;
  return {
    subject,
    html: layout({
      locale,
      title: L ? "预约已取消" : "Your booking was cancelled",
      preheader: d.code,
      body,
      footerNote: L ? "如非本人操作，请联系我们。" : "If this wasn't you, please contact us.",
    }),
  };
}

export function refundUpdateMail(locale: Locale, d: BookingMailData, stage: "requested" | "refunded" | "failed") {
  const L = locale === "zh";
  const map = {
    requested: L ? "退款申请已提交" : "Refund requested",
    refunded: L ? "退款已完成" : "Refund completed",
    failed: L ? "退款未成功" : "Refund failed",
  } as const;
  const desc = {
    requested: L
      ? "我们已收到退款申请，正在处理中。申请退款不等于退款成功，最终结果以支付渠道通知为准。"
      : "We've received your refund request and are processing it. A request is not a completed refund — the final result follows the payment provider.",
    refunded: L
      ? "退款已完成，款项将原路退回，到账时间取决于支付渠道。"
      : "The refund is complete and on its way back to your original payment method.",
    failed: L
      ? "本次退款未成功，请联系我们，我们会人工跟进处理。"
      : "This refund did not go through — please contact us and we'll follow up manually.",
  } as const;
  const body = `<p style="font-size:14px;line-height:1.8;">${desc[stage]}</p>${bookingTable(
    locale,
    d,
  )}${button(locale, d.orderUrl, L ? "查看详情" : "View details")}${policyBlock(locale, d.cancelPolicy)}`;
  return {
    subject: `${map[stage]} · ${d.code}`,
    html: layout({
      locale,
      title: map[stage],
      preheader: d.code,
      body,
      footerNote: L ? "本邮件由系统自动发送。" : "Automated message.",
    }),
  };
}

export function sessionChangedMail(
  locale: Locale,
  d: BookingMailData,
  changeNote: { zh: string; en: string },
) {
  const L = locale === "zh";
  const body = `
    <p style="font-size:14px;line-height:1.8;background:#fff7ed;border-left:3px solid #f59e0b;padding:10px 12px;margin:0 0 18px;">
      ${esc(L ? changeNote.zh : changeNote.en)}
    </p>
    <p style="font-size:14px;line-height:1.8;">${
      L
        ? "您预约的场次信息有更新，以下为最新安排，名额与订单保持有效。"
        : "Your session details have changed. Your booking and seats remain valid — here is the updated information."
    }</p>
    ${bookingTable(locale, d)}
    ${button(locale, d.orderUrl, L ? "查看最新信息" : "View updated details")}
  `;
  return {
    subject: L ? `【场次变更】${d.courseTitle} · ${d.code}` : `Session updated · ${d.courseTitle} · ${d.code}`,
    html: layout({
      locale,
      title: L ? "场次信息已更新" : "Your session was updated",
      preheader: d.code,
      body,
      footerNote: L ? "如时间不合适，可在订单页取消预约。" : "If the new time doesn't work, you can cancel from your booking page.",
    }),
  };
}

export function lookupLinkMail(locale: Locale, items: { code: string; courseTitle: string; url: string; startAt: Date | string; endAt: Date | string }[]) {
  const L = locale === "zh";
  const list = items
    .map(
      (i) => `<div style="padding:12px 0;border-bottom:1px solid ${line};">
      <div style="font-size:14px;font-weight:700;">${esc(i.courseTitle)}</div>
      <div style="font-size:13px;color:${muted};margin:3px 0 8px;">${esc(i.code)} · ${esc(
        formatDateTimeFull(i.startAt, i.endAt, locale),
      )}</div>
      <a href="${esc(i.url)}" style="color:${accent};font-size:13px;text-decoration:none;">${
        L ? "查看预约详情" : "View booking details"
      } →</a></div>`,
    )
    .join("");
  const body = `<p style="font-size:14px;line-height:1.8;">${
    L
      ? "以下是该邮箱名下的预约记录，点击即可查看（无需登录）。"
      : "Here are the bookings linked to this email. Open them directly — no login required."
  }</p>${list}`;
  return {
    subject: L ? "您的预约链接" : "Your booking links",
    html: layout({
      locale,
      title: L ? "您的预约链接" : "Your booking links",
      preheader: L ? "点击链接查看预约详情" : "Open your bookings",
      body,
      footerNote: L
        ? "链接为一次性安全链接，请勿转发。如非本人请求请忽略此邮件。"
        : "These are private links — please don't forward them. Ignore this email if you didn't request it.",
    }),
  };
}

/* ------------------------- 管理员邮件 ------------------------- */

export function adminVerifyMail(locale: Locale, url: string, name: string) {
  const L = locale === "zh";
  const body = `<p style="font-size:14px;line-height:1.8;">${
    L ? `你好${name ? ` ${esc(name)}` : ""}，请点击下面的按钮验证邮箱并激活管理后台账号：` : `Hi${name ? ` ${esc(name)}` : ""}, please verify your email to activate your admin account:`
  }</p>
  ${button(locale, url, L ? "验证邮箱并激活" : "Verify email")}
  <p style="font-size:12px;color:${muted};line-height:1.8;">${
    L ? "链接 24 小时内有效。若非本人操作请忽略此邮件。" : "The link expires in 24 hours. Ignore this email if it wasn't you."
  }</p>`;
  return {
    subject: L ? "验证你的管理后台邮箱" : "Verify your admin email",
    html: layout({ locale, title: L ? "邮箱验证" : "Email verification", preheader: url, body, footerNote: "Xingyi Booking Admin" }),
  };
}

export function adminResetMail(locale: Locale, url: string, code: string) {
  const L = locale === "zh";
  const body = `<p style="font-size:14px;line-height:1.8;">${
    L ? "我们收到了重置密码的请求，点击按钮设置新密码：" : "We received a request to reset your password:"
  }</p>
  ${button(locale, url, L ? "设置新密码" : "Set a new password")}
  <p style="font-size:13px;color:${muted};">${
    L ? `备用验证码：<b style="letter-spacing:2px;">${esc(code)}</b>（30 分钟内有效）` : `Backup code: <b style="letter-spacing:2px;">${esc(code)}</b> (valid 30 minutes)`
  }</p>
  <p style="font-size:12px;color:${muted};line-height:1.8;">${
    L ? "若非本人操作，请忽略此邮件，密码不会改变。" : "If you didn't request this, ignore it — your password stays unchanged."
  }</p>`;
  return {
    subject: L ? "重置你的后台密码" : "Reset your admin password",
    html: layout({ locale, title: L ? "重置密码" : "Reset password", preheader: url, body, footerNote: "Xingyi Booking Admin" }),
  };
}

export function adminLoginCodeMail(locale: Locale, code: string) {
  const L = locale === "zh";
  const body = `<p style="font-size:14px;line-height:1.8;">${
    L ? "使用下面的验证码登录管理后台：" : "Use this code to sign in to the admin console:"
  }</p>
  <div style="font-size:30px;font-weight:800;letter-spacing:8px;text-align:center;padding:18px;background:${bg};border-radius:10px;margin:16px 0;">${esc(
    code,
  )}</div>
  <p style="font-size:12px;color:${muted};line-height:1.8;">${
    L ? "10 分钟内有效。若非本人操作请忽略。" : "Valid for 10 minutes. Ignore if it wasn't you."
  }</p>`;
  return {
    subject: L ? "你的后台登录验证码" : "Your admin sign-in code",
    html: layout({ locale, title: L ? "登录验证码" : "Sign-in code", preheader: code, body, footerNote: "Xingyi Booking Admin" }),
  };
}

export function baseUrl() {
  return siteUrl();
}
