/**
 * 支付渠道抽象层。
 *
 * 约定（与模拟支付保持一致，接真实渠道也不变）：
 *  1. 订单「已付款」只能由**服务端通知**产生 —— 用户跳回成功页不算数
 *  2. 通知必须验签，验签失败直接拒绝
 *  3. eventId 全局唯一，重复通知幂等
 *  4. 金额与币种必须与订单一致，不一致拒绝
 */
import type { Locale } from "@/i18n/messages";

export type ProviderId = "mock" | "stripe" | "paypal" | "wechat";

export interface BookingPayInfo {
  id: string;
  code: string;
  amountCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
}

export interface CreateIntentInput {
  booking: BookingPayInfo;
  locale: Locale;
  /** 站点对外地址，用于拼回调/跳转地址 */
  baseUrl: string;
  /** 商品描述（已按语言处理好） */
  description: string;
}

export type IntentResult =
  | { kind: "redirect"; url: string; providerRef: string }
  | { kind: "qrcode"; codeUrl: string; providerRef: string; expiresAt?: string }
  | { kind: "error"; message: string };

/** 归一化后的支付结果事件 */
export interface NormalizedEvent {
  eventId: string;
  /** 我方订单号（out_trade_no / client_reference_id / reference_id） */
  bookingCode: string;
  providerRef: string;
  outcome: "succeeded" | "failed" | "abandoned" | "pending";
  amountCents: number;
  currency: string;
  raw?: unknown;
}

export interface ProviderConfigField {
  key: string;
  label: { zh: string; en: string };
  /** 密钥类字段在后台不回显明文 */
  secret?: boolean;
  hint?: { zh: string; en: string };
}

export interface PaymentProvider {
  id: ProviderId;
  label: { zh: string; en: string };
  /** 需要的环境变量 */
  envKeys: string[];
  configFields: ProviderConfigField[];
  /** 密钥是否配齐（缺任何一个就不可用） */
  configured(): boolean;
  /** 后台回调地址（给用户填到渠道控制台） */
  webhookPath: string;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  /** 校验并解析通知；验签失败返回 null */
  parseWebhook(req: Request): Promise<NormalizedEvent | null>;
}

/** 金额：分 → 渠道要求的小数字符串 */
export function moneyString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function timeoutFetch(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}
