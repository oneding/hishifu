/**
 * 轻量 i18n：中英双语，预留 fr / es / ru / ar 扩展位（本轮不翻译）。
 * 阿拉伯语已预留 dir="rtl"，后续接入即可生效。
 */

export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 已预留但本轮不提供翻译的语言 */
export const RESERVED_LOCALES = ["fr", "es", "ru", "ar"] as const;
export const RTL_LOCALES = ["ar"] as const;

export const DEFAULT_LOCALE: Locale = "zh";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

export function normalizeLocale(v: unknown): Locale {
  if (typeof v !== "string") return DEFAULT_LOCALE;
  const s = v.toLowerCase();
  if (s.startsWith("zh") || s.startsWith("cn")) return "zh";
  if (s.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

export function dirOf(locale: string): "ltr" | "rtl" {
  return (RTL_LOCALES as readonly string[]).includes(locale) ? "rtl" : "ltr";
}

export const LOCALE_LABEL: Record<string, string> = {
  zh: "中文",
  en: "English",
};

export const messages = {
  zh: {
    "brand.name": "形意拳体验",
    "brand.tagline": "上海 · 零基础形意拳体验课",
    "test.banner": "测试预约，不产生真实扣款",
    "test.demoData": "以下为演示数据，仅用于流程验收",

    "nav.course": "课程详情",
    "nav.sessions": "选择场次",
    "nav.lookup": "查询我的预约",
    "nav.admin": "管理后台",
    "nav.language": "页面语言",

    "course.duration": "课程时长",
    "course.minutes": "分钟",
    "course.audience": "适合人群",
    "course.includes": "费用包含",
    "course.excludes": "费用不包含",
    "course.location": "上课地点",
    "course.cancelPolicy": "取消与退款规则",
    "course.taughtLanguage": "实际授课语言",
    "course.pageLanguage": "页面语言",
    "course.pageLanguageHint": "本页面提供中英文浏览，与教练实际授课语言无关。",
    "course.about": "体验介绍",
    "course.chooseSession": "选择场次并预约",
    "course.from": "起",
    "course.perPerson": "每人",
    "course.upcoming": "近期场次",
    "course.noSessions": "暂无可预约场次",

    "sessions.title": "选择场次",
    "sessions.subtitle": "所有时间均为上海当地时间（UTC+8）",
    "sessions.date": "日期",
    "sessions.time": "时间",
    "sessions.price": "价格",
    "sessions.seatsLeft": "剩余名额",
    "sessions.booked": "已预约",
    "sessions.full": "已满",
    "sessions.closed": "已关闭",
    "sessions.capacity": "人数上限",
    "sessions.perPerson": "按人计费",
    "sessions.perGroup": "按组计费",
    "sessions.select": "预约此场次",
    "sessions.utc8": "UTC+8",

    "form.title": "填写报名信息",
    "form.name": "姓名",
    "form.namePlaceholder": "请填写与证件一致的姓名",
    "form.email": "邮箱",
    "form.emailPlaceholder": "用于接收确认邮件，国内外邮箱均可",
    "form.qty": "预约人数",
    "form.locale": "接收邮件语言",
    "form.agree": "我已阅读并同意取消与退款规则",
    "form.submit": "提交并前往付款",
    "form.submitting": "正在创建订单…",
    "form.err.name": "请填写姓名",
    "form.err.email": "请填写邮箱",
    "form.err.emailInvalid": "邮箱格式不正确",
    "form.err.qty": "预约人数至少 1 人",
    "form.err.agree": "请先确认取消与退款规则",
    "form.err.session": "请选择场次",
    "form.err.soldOut": "该场次名额不足，请选择其他场次",
    "form.err.closed": "该场次已停止报名",
    "form.err.generic": "提交失败，请稍后重试",

    "checkout.title": "确认并付款",
    "checkout.summary": "订单摘要",
    "checkout.session": "场次",
    "checkout.qty": "人数",
    "checkout.unit": "单价",
    "checkout.total": "应付总额",
    "checkout.hold": "名额已为您锁定，请在",
    "checkout.holdUnit": "分钟内完成付款",
    "checkout.testHint": "当前为测试支付环境，不会产生真实扣款。",
    "checkout.pay": "前往模拟支付",
    "checkout.simulate": "模拟支付结果",
    "checkout.sim.success": "模拟支付成功",
    "checkout.sim.fail": "模拟支付失败",
    "checkout.sim.abandon": "放弃付款（等待超时）",

    "result.success.title": "预约成功",
    "result.success.desc": "确认邮件已发送至您的邮箱，请查收（如未收到请检查垃圾邮件）。",
    "result.failed.title": "付款未成功",
    "result.failed.desc": "本次支付未完成，未产生预约。锁定的名额已释放，可重新尝试。",
    "result.pending.title": "付款处理中",
    "result.pending.desc": "我们正在等待支付渠道返回结果，请勿重复付款。可稍后刷新查看。",
    "result.retry": "重新支付",
    "result.viewOrder": "查看我的预约",
    "result.backHome": "返回课程页",

    "order.title": "我的预约",
    "order.code": "订单编号",
    "order.course": "课程",
    "order.datetime": "上课时间",
    "order.qty": "人数",
    "order.venue": "地点",
    "order.map": "查看地图",
    "order.directions": "到店指引",
    "order.amount": "金额",
    "order.bookingStatus": "预约状态",
    "order.paymentStatus": "付款状态",
    "order.refundStatus": "退款状态",
    "order.contact": "联系方式",
    "order.cancel": "取消预约",
    "order.cancelConfirm": "确认取消该预约吗？符合条件将按规则发起退款。",
    "order.cancelDone": "已提交取消申请，结果以支付渠道通知为准。",
    "order.taughtLanguage": "实际授课语言",
    "order.notFound": "未找到该预约，请检查链接是否完整。",
    "order.resend": "重新发送预约链接",

    "lookup.title": "查询我的预约",
    "lookup.desc": "输入预约时填写的邮箱，我们会把预约链接重新发送到该邮箱。",
    "lookup.submit": "发送预约链接",
    "lookup.sent": "如果邮箱存在对应预约，链接已发送，请查收邮件。",
    "lookup.err.email": "请填写邮箱",

    "status.pending_payment": "待付款",
    "status.confirmed": "已确认",
    "status.cancelled": "已取消",
    "status.expired": "已失效",
    "status.unpaid": "未付款",
    "status.paid": "已付款",
    "status.failed": "付款失败",
    "status.refunded": "已退款",
    "status.none": "无",
    "status.requested": "已申请",
    "status.processing": "处理中",

    "common.submit": "提交",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "common.back": "返回",
    "common.loading": "加载中…",
    "common.optional": "选填",
    "common.copy": "复制",
    "common.copied": "已复制",
  },

  en: {
    "brand.name": "Xingyi Experience",
    "brand.tagline": "Beginner Xingyiquan Taster Class · Shanghai",
    "test.banner": "Test booking only — no real payment is charged",
    "test.demoData": "Demo data shown for acceptance testing",

    "nav.course": "Class",
    "nav.sessions": "Sessions",
    "nav.lookup": "Find my booking",
    "nav.admin": "Admin",
    "nav.language": "Language",

    "course.duration": "Duration",
    "course.minutes": "min",
    "course.audience": "Who it's for",
    "course.includes": "What's included",
    "course.excludes": "Not included",
    "course.location": "Location",
    "course.cancelPolicy": "Cancellation & refund policy",
    "course.taughtLanguage": "Language of instruction",
    "course.pageLanguage": "Website language",
    "course.pageLanguageHint":
      "This site is available in Chinese and English; that is independent of the language used in class.",
    "course.about": "About this experience",
    "course.chooseSession": "Choose a session and book",
    "course.from": "from",
    "course.perPerson": "per person",
    "course.upcoming": "Upcoming sessions",
    "course.noSessions": "No sessions available",

    "sessions.title": "Choose a session",
    "sessions.subtitle": "All times are Shanghai local time (UTC+8)",
    "sessions.date": "Date",
    "sessions.time": "Time",
    "sessions.price": "Price",
    "sessions.seatsLeft": "Seats left",
    "sessions.booked": "Booked",
    "sessions.full": "Full",
    "sessions.closed": "Closed",
    "sessions.capacity": "Capacity",
    "sessions.perPerson": "Priced per person",
    "sessions.perGroup": "Priced per group",
    "sessions.select": "Book this session",
    "sessions.utc8": "UTC+8",

    "form.title": "Your details",
    "form.name": "Full name",
    "form.namePlaceholder": "As shown on your ID",
    "form.email": "Email",
    "form.emailPlaceholder": "For your confirmation email",
    "form.qty": "Participants",
    "form.locale": "Email language",
    "form.agree": "I have read and accept the cancellation & refund policy",
    "form.submit": "Continue to payment",
    "form.submitting": "Creating your booking…",
    "form.err.name": "Please enter your name",
    "form.err.email": "Please enter your email",
    "form.err.emailInvalid": "Please enter a valid email address",
    "form.err.qty": "At least 1 participant",
    "form.err.agree": "Please accept the cancellation policy",
    "form.err.session": "Please choose a session",
    "form.err.soldOut": "Not enough seats left — please choose another session",
    "form.err.closed": "This session is closed",
    "form.err.generic": "Something went wrong, please try again",

    "checkout.title": "Review & pay",
    "checkout.summary": "Order summary",
    "checkout.session": "Session",
    "checkout.qty": "Participants",
    "checkout.unit": "Unit price",
    "checkout.total": "Total",
    "checkout.hold": "Seats are held for you — please pay within",
    "checkout.holdUnit": "minutes",
    "checkout.testHint": "Test payment environment — no real money is charged.",
    "checkout.pay": "Go to test payment",
    "checkout.simulate": "Simulate payment result",
    "checkout.sim.success": "Simulate success",
    "checkout.sim.fail": "Simulate failure",
    "checkout.sim.abandon": "Abandon (let it expire)",

    "result.success.title": "Booking confirmed",
    "result.success.desc":
      "A confirmation email is on its way. If you don't see it, please check your spam folder.",
    "result.failed.title": "Payment not completed",
    "result.failed.desc":
      "No booking was created and the held seats were released. You can try again.",
    "result.pending.title": "Payment processing",
    "result.pending.desc":
      "We're waiting for the payment provider. Please don't pay twice — refresh in a moment.",
    "result.retry": "Try payment again",
    "result.viewOrder": "View my booking",
    "result.backHome": "Back to class",

    "order.title": "My booking",
    "order.code": "Booking reference",
    "order.course": "Class",
    "order.datetime": "Date & time",
    "order.qty": "Participants",
    "order.venue": "Venue",
    "order.map": "View map",
    "order.directions": "Getting there",
    "order.amount": "Amount",
    "order.bookingStatus": "Booking status",
    "order.paymentStatus": "Payment status",
    "order.refundStatus": "Refund status",
    "order.contact": "Contact",
    "order.cancel": "Cancel booking",
    "order.cancelConfirm": "Cancel this booking? A refund will be raised if it meets the policy.",
    "order.cancelDone": "Cancellation submitted. The outcome follows the payment provider's notice.",
    "order.taughtLanguage": "Language of instruction",
    "order.notFound": "Booking not found. Please check that the link is complete.",
    "order.resend": "Resend my booking link",

    "lookup.title": "Find my booking",
    "lookup.desc":
      "Enter the email you booked with and we'll resend your booking link to that address.",
    "lookup.submit": "Send my link",
    "lookup.sent": "If a booking exists for that email, the link has been sent.",
    "lookup.err.email": "Please enter your email",

    "status.pending_payment": "Awaiting payment",
    "status.confirmed": "Confirmed",
    "status.cancelled": "Cancelled",
    "status.expired": "Expired",
    "status.unpaid": "Unpaid",
    "status.paid": "Paid",
    "status.failed": "Failed",
    "status.refunded": "Refunded",
    "status.none": "None",
    "status.requested": "Requested",
    "status.processing": "Processing",

    "common.submit": "Submit",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.back": "Back",
    "common.loading": "Loading…",
    "common.optional": "optional",
    "common.copy": "Copy",
    "common.copied": "Copied",
  },
} as const;

export type MessageKey = keyof (typeof messages)["zh"];

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>) {
  const dict = (messages[locale] ?? messages.zh) as Record<string, string>;
  let s = dict[key] ?? (messages.zh as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

/** 服务端组件用 */
export function getTranslator(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
