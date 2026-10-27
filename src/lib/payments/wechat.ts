/**
 * 微信支付 APIv3 · Native 扫码支付（无 SDK，用 node:crypto 做 RSA-SHA256 与 AES-256-GCM）
 *
 * 需要的环境变量：
 *   WECHAT_APPID=wx...                公众号 / 移动应用 appid
 *   WECHAT_MCHID=1234567890           商户号
 *   WECHAT_SERIAL_NO=...              商户 API 证书序列号
 *   WECHAT_API_V3_KEY=...             APIv3 密钥（32 位，用于解密通知）
 *   WECHAT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...   商户私钥 PEM（也可填 WECHAT_PRIVATE_KEY_PATH 指向文件）
 *   WECHAT_PLATFORM_CERT=-----BEGIN CERTIFICATE-----... 平台证书 PEM，用于通知验签
 *     （或 WECHAT_PLATFORM_PUBLIC_KEY=... 平台公钥；两者也可填 *_PATH 指向文件）
 *
 * 商户平台回调地址：https://<域名>/api/payments/wechat/webhook
 *
 * ⚠️ 限制：金额仅支持 CNY；需要已备案域名与大陆主体商户号。
 */
import {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { timeoutFetch, type CreateIntentInput, type IntentResult, type NormalizedEvent, type PaymentProvider } from "./types";

const API = "https://api.mch.weixin.qq.com";

const env = (k: string) => (process.env[k] ?? "").trim();

function appid() {
  return env("WECHAT_APPID");
}
function mchid() {
  return env("WECHAT_MCHID");
}
function serialNo() {
  return env("WECHAT_SERIAL_NO");
}
function apiV3Key() {
  return env("WECHAT_API_V3_KEY");
}

/** PEM 内容：优先当作 PEM 文本（支持 \n 转义），否则当作文件路径读取 */
function pemFrom(value: string, pathKey?: string): string {
  const raw = value || (pathKey ? env(pathKey) : "");
  if (!raw) return "";
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    return readFileSync(raw, "utf8");
  } catch {
    return "";
  }
}

function privateKeyPem(): string {
  return pemFrom(env("WECHAT_PRIVATE_KEY"), "WECHAT_PRIVATE_KEY_PATH");
}

function platformKeyPem(): string {
  return (
    pemFrom(env("WECHAT_PLATFORM_CERT"), "WECHAT_PLATFORM_CERT_PATH") ||
    pemFrom(env("WECHAT_PLATFORM_PUBLIC_KEY"), "WECHAT_PLATFORM_PUBLIC_KEY_PATH")
  );
}

function rsaSign(message: string): string {
  return createSign("RSA-SHA256").update(message).sign(privateKeyPem(), "base64");
}

function authHeader(method: string, urlPath: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(message);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid()}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo()}"`;
}

async function wxPost<T = any>(urlPath: string, body: Record<string, unknown>): Promise<T> {
  const payload = JSON.stringify(body);
  const res = await timeoutFetch(`${API}${urlPath}`, {
    method: "POST",
    headers: {
      authorization: authHeader("POST", urlPath, payload),
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "xingyi-booking/1.0",
    },
    body: payload,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.message ?? json?.code ?? `wechat_http_${res.status}`);
  return json as T;
}

/** 解密通知里的 resource（AEAD_AES_256_GCM） */
function decryptResource(resource: {
  algorithm: string;
  ciphertext: string;
  nonce: string;
  associated_data: string;
}): Record<string, any> {
  const key = Buffer.from(apiV3Key(), "utf8");
  const buf = Buffer.from(resource.ciphertext, "base64");
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}

export const wechatProvider: PaymentProvider = {
  id: "wechat",
  label: { zh: "微信支付（扫码）", en: "WeChat Pay (QR)" },
  envKeys: [
    "WECHAT_APPID",
    "WECHAT_MCHID",
    "WECHAT_SERIAL_NO",
    "WECHAT_API_V3_KEY",
    "WECHAT_PRIVATE_KEY",
    "WECHAT_PLATFORM_CERT",
  ],
  webhookPath: "/api/payments/wechat/webhook",
  configFields: [
    { key: "WECHAT_APPID", label: { zh: "appid", en: "App ID" } },
    { key: "WECHAT_MCHID", label: { zh: "商户号", en: "Merchant ID" } },
    { key: "WECHAT_SERIAL_NO", label: { zh: "API 证书序列号", en: "Certificate serial no." } },
    { key: "WECHAT_API_V3_KEY", label: { zh: "APIv3 密钥", en: "APIv3 key" }, secret: true },
    { key: "WECHAT_PRIVATE_KEY", label: { zh: "商户私钥 PEM", en: "Merchant private key (PEM)" }, secret: true },
    { key: "WECHAT_PLATFORM_CERT", label: { zh: "微信支付平台证书 PEM", en: "Platform certificate (PEM)" }, secret: true },
  ],

  configured() {
    return Boolean(
      appid() && mchid() && serialNo() && apiV3Key().length === 32 && privateKeyPem(),
    );
  },

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    if (!wechatProvider.configured()) return { kind: "error", message: "wechat_not_configured" };
    if (input.booking.currency !== "CNY") return { kind: "error", message: "wechat_cny_only" };
    const { booking, description, baseUrl } = input;
    const notifyUrl = `${baseUrl}${wechatProvider.webhookPath}`;
    try {
      const res = await wxPost<{ code_url?: string }>("/v3/pay/transactions/native", {
        appid: appid(),
        mchid: mchid(),
        description: description.slice(0, 60) || `订单 ${booking.code}`,
        out_trade_no: booking.code,
        time_expire: new Date(Date.now() + 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, "+08:00"),
        attach: booking.code,
        notify_url: notifyUrl,
        support_fapiao: false,
        amount: { total: booking.amountCents, currency: "CNY" },
      });
      if (!res?.code_url) return { kind: "error", message: "wechat_no_code_url" };
      return { kind: "qrcode", codeUrl: String(res.code_url), providerRef: booking.code };
    } catch (e) {
      return { kind: "error", message: String((e as Error)?.message ?? e) };
    }
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent | null> {
    const raw = await req.text();
    const timestamp = req.headers.get("wechatpay-timestamp") ?? "";
    const nonce = req.headers.get("wechatpay-nonce") ?? "";
    const signature = req.headers.get("wechatpay-signature") ?? "";
    if (!timestamp || !nonce || !signature) return null;

    const cert = platformKeyPem();
    const ok = cert
      ? createVerify("RSA-SHA256")
          .update(`${timestamp}\n${nonce}\n${raw}\n`)
          .verify(cert, signature, "base64")
      : false;
    if (!ok) return null;

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }

    const trade: Record<string, any> = body?.resource ? decryptResource(body.resource) : body;
    const outTradeNo = String(trade?.out_trade_no ?? "");
    if (!outTradeNo) return null;

    const state = String(trade?.trade_state ?? body?.event_type ?? "");
    let outcome: NormalizedEvent["outcome"] = "pending";
    if (state === "SUCCESS" || body?.event_type === "TRANSACTION.SUCCESS") outcome = "succeeded";
    else if (state === "CLOSED" || state === "REVOKED" || body?.event_type === "TRANSACTION.CLOSED") outcome = "abandoned";
    else if (state === "PAYERROR" || state === "NOTPAY") outcome = "failed";
    if (outcome === "pending") return null; // USERPAYING 等待用户付款，不落库

    const amount = trade?.amount ?? {};
    return {
      eventId: String(body?.id ?? `${outTradeNo}:${trade?.transaction_id ?? state}`),
      bookingCode: outTradeNo,
      providerRef: String(trade?.transaction_id ?? outTradeNo),
      outcome,
      amountCents: Number(amount?.total ?? amount?.payer_total ?? 0),
      currency: String(amount?.currency ?? "CNY").toUpperCase(),
      raw: { body, trade },
    };
  },
};

/** 主动查单（前端轮询兜底，不依赖通知） */
export async function queryWechatOrder(
  outTradeNo: string,
): Promise<{ tradeState: string; transactionId: string; amountCents: number } | null> {
  if (!wechatProvider.configured()) return null;
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(mchid())}`;
  try {
    const res = await timeoutFetch(`${API}${urlPath}`, {
      method: "GET",
      headers: {
        authorization: authHeader("GET", urlPath, ""),
        accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { trade_state?: string; transaction_id?: string; amount?: { total?: number } };
    return {
      tradeState: String(json.trade_state ?? ""),
      transactionId: String(json.transaction_id ?? ""),
      amountCents: Number(json.amount?.total ?? 0),
    };
  } catch {
    return null;
  }
}
