/**
 * PayPal Orders v2（无 SDK）
 *
 * 需要的环境变量：
 *   PAYPAL_CLIENT_ID=...
 *   PAYPAL_CLIENT_SECRET=...
 *   PAYPAL_WEBHOOK_ID=...        （Webhook ID，验签用）
 *   PAYPAL_MODE=live | sandbox   （默认 sandbox）
 *
 * 控制台回调地址：https://<域名>/api/payments/paypal/webhook
 *   监听事件：PAYMENT.CAPTURE.COMPLETED / PAYMENT.CAPTURE.DENIED / CHECKOUT.ORDER.APPROVED
 */
import { moneyString, timeoutFetch, type CreateIntentInput, type IntentResult, type NormalizedEvent, type PaymentProvider } from "./types";

function clientId() {
  return (process.env.PAYPAL_CLIENT_ID ?? "").trim();
}
function clientSecret() {
  return (process.env.PAYPAL_CLIENT_SECRET ?? "").trim();
}
function webhookId() {
  return (process.env.PAYPAL_WEBHOOK_ID ?? "").trim();
}
function live() {
  return (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase() === "live";
}
function api() {
  return live() ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await timeoutFetch(`${api()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error(`paypal_token_${res.status}`);
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000,
  };
  return cachedToken.value;
}

async function paypalPost<T = any>(path: string, body: unknown, token?: string): Promise<T> {
  const tk = token ?? (await accessToken());
  const res = await timeoutFetch(`${api()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tk}`,
      "content-type": "application/json",
      "prefer": "return=representation",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.message ?? json?.name ?? `paypal_http_${res.status}`);
  return json as T;
}

export const paypalProvider: PaymentProvider = {
  id: "paypal",
  label: { zh: "PayPal", en: "PayPal" },
  envKeys: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"],
  webhookPath: "/api/payments/paypal/webhook",
  configFields: [
    { key: "PAYPAL_CLIENT_ID", label: { zh: "Client ID", en: "Client ID" } },
    { key: "PAYPAL_CLIENT_SECRET", label: { zh: "Client secret", en: "Client secret" }, secret: true },
    { key: "PAYPAL_WEBHOOK_ID", label: { zh: "Webhook ID", en: "Webhook ID" } },
    {
      key: "PAYPAL_MODE",
      label: { zh: "模式（sandbox / live）", en: "Mode (sandbox / live)" },
      hint: { zh: "填 live 才真实收款", en: "Set to live to charge real money" },
    },
  ],

  configured() {
    return Boolean(clientId() && clientSecret());
  },

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    if (!paypalProvider.configured()) return { kind: "error", message: "paypal_not_configured" };
    const { booking, locale, baseUrl, description } = input;
    const order = await paypalPost<{ id?: string; links?: { rel?: string; href?: string }[] }>(
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: booking.code,
            description: description.slice(0, 127),
            custom_id: booking.code,
            amount: {
              currency_code: booking.currency,
              value: moneyString(booking.amountCents),
            },
          },
        ],
        application_context: {
          brand_name: "Xingyi Experience",
          user_action: "PAY_NOW",
          return_url: `${baseUrl}/${locale}/pay/${booking.code}/paypal`,
          cancel_url: `${baseUrl}/${locale}/pay/${booking.code}`,
        },
      },
    );
    const approve = order?.links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
    if (!order?.id || !approve?.href) return { kind: "error", message: "paypal_no_approve_link" };
    return { kind: "redirect", url: approve.href, providerRef: order.id };
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent | null> {
    const raw = await req.text();
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return null;
    }
    const type = String(event?.event_type ?? event?.type ?? "");
    if (!type.startsWith("PAYMENT.CAPTURE")) return null;

    // 向 PayPal 复核签名（唯一可靠的校验方式）
    if (webhookId()) {
      const verified = await paypalPost<{ verification_status?: string }>(
        "/v1/notifications/verify-webhook-signature",
        {
          auth_algo: req.headers.get("paypal-auth-algo"),
          cert_url: req.headers.get("paypal-cert-url"),
          transmission_id: req.headers.get("paypal-transmission-id"),
          transmission_sig: req.headers.get("paypal-transmission-sig"),
          transmission_time: req.headers.get("paypal-transmission-time"),
          webhook_id: webhookId(),
          webhook_event: event,
        },
      ).catch(() => ({ verification_status: "FAILURE" }));
      if (verified?.verification_status !== "SUCCESS") return null;
    }

    const resource = event?.resource ?? {};
    const bookingCode = String(
      resource?.custom_id ??
        resource?.reference_id ??
        resource?.supplementary_data?.related_ids?.order_id ??
        "",
    );
    if (!bookingCode) return null;

    const outcome: NormalizedEvent["outcome"] =
      type === "PAYMENT.CAPTURE.COMPLETED" ? "succeeded" : type === "PAYMENT.CAPTURE.DENIED" ? "failed" : "pending";
    if (outcome === "pending") return null;

    const amount = resource?.amount ?? resource?.seller_receivable_breakdown?.gross_amount ?? {};
    return {
      eventId: String(event?.id ?? `${type}:${resource?.id ?? ""}`),
      bookingCode,
      providerRef: String(resource?.id ?? event?.id ?? type),
      outcome,
      amountCents: Math.round(Number(amount?.value ?? 0) * 100),
      currency: String(amount?.currency_code ?? "").toUpperCase(),
      raw: event,
    };
  },
};

/** 用户从 PayPal 跳回后：捕获订单（真实扣款发生在这里） */
export async function capturePayPalOrder(orderId: string): Promise<
  | { ok: true; captureId: string; amountCents: number; currency: string; bookingCode: string; status: string }
  | { ok: false; error: string }
> {
  try {
    const res = await paypalPost<{
      id?: string;
      status?: string;
      purchase_units?: { reference_id?: string; custom_id?: string; payments?: { captures?: any[] } }[];
    }>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {});
    const unit = res?.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const status = String(capture?.status ?? res?.status ?? "");
    if (!capture?.id || status !== "COMPLETED") {
      return { ok: false, error: status === "PENDING" ? "paypal_pending" : "paypal_not_completed" };
    }
    return {
      ok: true,
      captureId: String(capture.id),
      amountCents: Math.round(Number(capture?.amount?.value ?? 0) * 100),
      currency: String(capture?.amount?.currency_code ?? "").toUpperCase(),
      bookingCode: String(unit?.custom_id ?? unit?.reference_id ?? ""),
      status,
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
