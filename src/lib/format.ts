import type { Locale } from "@/i18n/messages";
import { translate } from "@/i18n/messages";
import { TIMEZONE, TZ_LABEL } from "./config";

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/** 上海当地时间：2026年10月31日（周六） / Sat, 31 Oct 2026 */
export function formatDate(v: Date | string, locale: Locale): string {
  const d = toDate(v);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  const wdIdx = new Date(Date.UTC(Number(y), Number(m) - 1, Number(day))).getUTCDay();
  if (locale === "zh") return `${y}年${Number(m)}月${Number(day)}日（${WEEKDAY_ZH[wdIdx]}）`;
  const wdMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monMap = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${wdMap[wdIdx]}, ${Number(day)} ${monMap[Number(m) - 1]} ${y}`;
}

/** 19:00 – 20:30 */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${f.format(toDate(start))} – ${f.format(toDate(end))}`;
}

/** 完整：2026年10月31日（周六）19:00 – 20:30（UTC+8） */
export function formatDateTimeFull(start: Date | string, end: Date | string, locale: Locale): string {
  const tz = locale === "zh" ? `（${TZ_LABEL}）` : ` (${TZ_LABEL})`;
  return `${formatDate(start, locale)} ${formatTimeRange(start, end)}${tz}`;
}

export function formatTimeOnly(v: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(toDate(v));
}

/** ¥199 / CNY 199 */
export function formatMoney(cents: number, currency: string, locale: Locale = "zh"): string {
  const amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  if (locale === "en") return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}

export function remainingMs(target: Date | string): number {
  return toDate(target).getTime() - Date.now();
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

/** 场次是否已开课 */
export function hasStarted(v: Date | string): boolean {
  return toDate(v).getTime() <= Date.now();
}

/* -------- datetime-local 输入（始终以 UTC+8 呈现与解析） -------- */
export function toShanghaiInput(v: Date | string): string {
  const d = toDate(v);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** 把「上海本地时间」输入串解析为 Date（UTC+8） */
export function fromShanghaiInput(v: string): Date {
  return new Date(`${v}:00+08:00`);
}

/* ---------------------- 语言标签（授课语言） ---------------------- */
const LANG_LABEL: Record<string, { zh: string; en: string }> = {
  zh: { zh: "中文（普通话）", en: "Mandarin Chinese" },
  en: { zh: "英文", en: "English" },
  fr: { zh: "法文", en: "French" },
  es: { zh: "西班牙文", en: "Spanish" },
  ru: { zh: "俄文", en: "Russian" },
  ar: { zh: "阿拉伯文", en: "Arabic" },
};

/** 语言代码 → 当前界面/邮件语言的展示名 */
export function labelLanguages(codes: string[] | null | undefined, locale: Locale): string {
  if (!codes?.length) return "—";
  return codes
    .map((c) => LANG_LABEL[c]?.[locale === "zh" ? "zh" : "en"] ?? c)
    .join(locale === "zh" ? "、" : ", ");
}

export function statusLabel(locale: Locale, key: string): string {
  return translate(locale, `status.${key}`);
}
