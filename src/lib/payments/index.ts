/**
 * 支付渠道注册表。
 *
 * 渠道是否对客展示 = 密钥配齐（环境变量） AND 后台开关打开（settings 表）。
 * 密钥只在环境变量里配，后台只管「开关」与「状态展示」，避免密钥入库。
 */
import { getSettingString } from "@/lib/settings";
import type { Locale } from "@/i18n/messages";
import type { PaymentProvider, ProviderId } from "./types";
import { stripeProvider } from "./stripe";
import { paypalProvider } from "./paypal";
import { wechatProvider } from "./wechat";
import { simulatePayment } from "./mock";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  wechat: wechatProvider,
  mock: mockProvider(),
};

/** 模拟支付：始终可用（受后台开关控制） */
function mockProvider(): PaymentProvider {
  return {
    id: "mock",
    label: { zh: "测试支付（不产生真实扣款）", en: "Test payment (no real charge)" },
    envKeys: [],
    webhookPath: "/api/payments/mock/webhook",
    configFields: [],
    configured: () => true,
    async createIntent(input) {
      // 模拟渠道沿用原有 /api/payments/mock/submit 流程，不由 intent 接口发起
      return { kind: "error", message: "mock_via_legacy_flow" };
    },
    async parseWebhook() {
      return null;
    },
  };
}

export function providerOf(id: string): PaymentProvider | null {
  return PROVIDERS[id as ProviderId] ?? null;
}

export async function isProviderEnabled(id: ProviderId): Promise<boolean> {
  const key = `PAYMENT_ENABLE_${id.toUpperCase()}`;
  const v = await getSettingString(key, id === "mock" ? "1" : "0");
  return v === "1" || v === "true";
}

export async function setProviderEnabled(id: ProviderId, enabled: boolean): Promise<void> {
  const { setSetting } = await import("@/lib/settings");
  await setSetting(`PAYMENT_ENABLE_${id.toUpperCase()}`, enabled ? "1" : "0");
}

export interface ChannelView {
  id: ProviderId;
  label: string;
  configured: boolean;
  enabled: boolean;
  available: boolean;
  webhookPath: string;
  missing: string[];
  mode: string;
}

function modeOf(id: ProviderId): string {
  if (id === "paypal") return (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase();
  if (id === "stripe") return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live") ? "live" : "test";
  if (id === "wechat") return "live";
  return "test";
}

/** 后台「支付渠道」页与收银台共用 */
export async function listChannels(locale: Locale): Promise<ChannelView[]> {
  const ids: ProviderId[] = ["wechat", "stripe", "paypal", "mock"];
  const out: ChannelView[] = [];
  for (const id of ids) {
    const p = PROVIDERS[id];
    const configured = p.configured();
    const enabled = await isProviderEnabled(id);
    const missing = p.envKeys.filter((k) => !(process.env[k] ?? "").trim());
    out.push({
      id,
      label: locale === "zh" ? p.label.zh : p.label.en,
      configured,
      enabled,
      available: configured && enabled,
      webhookPath: p.webhookPath,
      missing,
      mode: modeOf(id),
    });
  }
  return out;
}

/** 收银台可选的渠道（缺密钥或未开启的不出现） */
export async function availableChannels(locale: Locale): Promise<ChannelView[]> {
  return (await listChannels(locale)).filter((c) => c.available);
}

export { simulatePayment };
export * from "./types";
