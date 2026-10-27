/**
 * 模拟支付渠道（测试用）：复刻真实渠道「提交 → 异步签名通知」的时序。
 */
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { paymentWebhookSecret } from "@/lib/config";
import { hmacSign, randomToken, verifyHmac } from "@/lib/security";
import { timeoutFetch, type NormalizedEvent } from "./types";

export function canonical(body: Record<string, unknown>): string {
  const keys = Object.keys(body).sort();
  return JSON.stringify(
    keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {}),
  );
}

/**
 * 触发一条带 HMAC 签名的异步通知。
 *
 * 回调地址的选择很关键，两种情况都会让订单永远停在待付款：
 *  - 用配置的站点域名：域名没解析 / 配错时打不出去
 *  - 用请求的 origin：经 Nginx 访问时是 http://域名，会被 80→443 的 301 打断（POST 变 GET）
 * 所以自部署时直接回调本机监听端口（不经过 Nginx）；Serverless 没有本机端口概念，才用请求 origin。
 */
export function callbackBase(reqOrigin: string): string {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  return serverless ? reqOrigin : `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

export interface SimulateInput {
  code: string;
  outcome: "succeeded" | "failed" | "abandoned";
  delayMs?: number;
  reqOrigin: string;
}

export async function simulatePayment(
  input: SimulateInput,
): Promise<{ ok: true; eventId: string; delay: number } | { ok: false; error: string }> {
  const db = await getDb();
  const booking = (
    await db.select().from(bookings).where(eq(bookings.code, input.code)).limit(1)
  )[0];
  if (!booking) return { ok: false, error: "booking_not_found" };
  if (booking.status !== "pending_payment") return { ok: false, error: "not_pending" };

  const payload = {
    eventId: `evt_${randomToken(16)}`,
    bookingCode: booking.code,
    providerRef: `MOCK-${randomToken(8).toUpperCase()}`,
    outcome: input.outcome,
    amountCents: booking.amountCents,
    currency: booking.currency,
    ts: Date.now(),
  };
  const signature = hmacSign(
    canonical(payload as unknown as Record<string, unknown>),
    paymentWebhookSecret(),
  );

  const delay = input.delayMs ?? (input.outcome === "abandoned" ? 1500 : 900);
  const base = callbackBase(input.reqOrigin);
  setTimeout(async () => {
    try {
      await timeoutFetch(`${base}/api/payments/mock/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-mock-signature": signature },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("[mock-pay] webhook failed", e);
    }
  }, delay);

  return { ok: true, eventId: payload.eventId, delay };
}

/** 供 mock webhook 路由复用的验签 */
export function verifyMockSignature(raw: string, signature: string): boolean {
  return verifyHmac(canonical(JSON.parse(raw)), paymentWebhookSecret(), signature);
}

export type { NormalizedEvent };
