/**
 * Stripe Checkout（无 SDK，直接用 REST + HMAC 验签）
 *
 * 需要的环境变量：
 *   STRIPE_SECRET_KEY=sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * 控制台回调地址：https://<域名>/api/payments/stripe/webhook
 *   监听事件：checkout.session.completed / async_payment_succeeded / async_payment_failed / expired
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { moneyString, timeoutFetch, type CreateIntentInput, type IntentResult, type NormalizedEvent, type PaymentProvider } from "./types";

const API = "https://api.stripe.com";

function secretKey() {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim();
}
function webhookSecret() {
  return (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
}

function stripeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function stripePost(path: string, params: Record<string, string>) {
  const res = await timeoutFetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: stripeForm(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `stripe_http_${res.status}`);
  }
  return json;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: { zh: "信用卡 / Apple Pay（Stripe）", en: "Card / Apple Pay (Stripe)" },
  envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  webhookPath: "/api/payments/stripe/webhook",
  configFields: [
    { key: "STRIPE_SECRET_KEY", label: { zh: "Secret key", en: "Secret key" }, secret: true },
    { key: "STRIPE_WEBHOOK_SECRET", label: { zh: "Webhook 签名密钥", en: "Webhook signing secret" }, secret: true },
  ],

  configured() {
    return Boolean(secretKey() && webhookSecret());
  },

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    if (!stripeProvider.configured()) return { kind: "error", message: "stripe_not_configured" };
    const { booking, locale, baseUrl, description } = input;
    const amount = moneyString(booking.amountCents);
    const success = `${baseUrl}/${locale}/r/${booking.code}`;
    const cancel = `${baseUrl}/${locale}/pay/${booking.code}`;

    const p: Record<string, string> = {
      mode: "payment",
      success_url: `${success}?src=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel,
      "client_reference_id": booking.code,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": booking.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(booking.amountCents),
      "line_items[0][price_data][product_data][name]": description.slice(0, 120),
      "metadata[booking_code]": booking.code,
      "metadata[booking_id]": booking.id,
      "payment_intent_data[metadata][booking_code]": booking.code,
      "customer_email": booking.customerEmail,
    };

    try {
      const session = await stripePost("/v1/checkout/sessions", p);
      if (!session?.url) return { kind: "error", message: "stripe_no_url" };
      return { kind: "redirect", url: session.url, providerRef: String(session.id) };
    } catch (e) {
      return { kind: "error", message: String((e as Error)?.message ?? e) };
    }
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent | null> {
    const secret = webhookSecret();
    if (!secret) return null;
    const raw = await req.text();
    const header = req.headers.get("stripe-signature") ?? "";

    // 形如：t=1699999999,v1=xxxxx,v0=yyyy
    const parts = Object.fromEntries(
      header.split(",").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      }),
    );
    const timestamp = parts.t ?? "";
    const provided = parts.v1 ?? "";
    if (!timestamp || !provided) return null;

    const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return null;
    }

    const type = String(event?.type ?? "");
    const session = event?.data?.object ?? {};
    const bookingCode = String(
      session.client_reference_id ?? session?.metadata?.booking_code ?? "",
    );
    if (!bookingCode) return null;

    let outcome: NormalizedEvent["outcome"] = "pending";
    if (type === "checkout.session.completed") {
      outcome = session.payment_status === "paid" ? "succeeded" : "pending";
    } else if (type === "checkout.session.async_payment_succeeded") {
      outcome = "succeeded";
    } else if (type === "checkout.session.async_payment_failed") {
      outcome = "failed";
    } else if (type === "checkout.session.expired") {
      outcome = "abandoned";
    }
    if (outcome === "pending") return null; // 不处理未知事件

    return {
      eventId: String(event.id ?? `${type}:${session.id}`),
      bookingCode,
      providerRef: String(session.id ?? event.id ?? type),
      outcome,
      amountCents: Number(session.amount_total ?? 0),
      currency: String(session.currency ?? "").toUpperCase(),
      raw: event,
    };
  },
};
