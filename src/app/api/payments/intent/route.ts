/**
 * 创建支付意图（收银台选择渠道后调用）。
 *
 * POST /api/payments/intent  { code, provider, locale }
 * → { ok:true, kind:"redirect", url }    跳渠道收银台
 * → { ok:true, kind:"qrcode", codeUrl }  展示二维码
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBookingByCode } from "@/lib/booking";
import { siteUrl } from "@/lib/config";
import { isLocale, translate, type Locale } from "@/i18n/messages";
import { isProviderEnabled, providerOf } from "@/lib/payments";
import type { ProviderId } from "@/lib/payments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(3),
  provider: z.enum(["stripe", "paypal", "wechat"]),
  locale: z.string().default("zh"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }
  const { code, provider } = parsed.data;
  const locale: Locale = isLocale(parsed.data.locale) ? parsed.data.locale : "zh";

  const providerImpl = providerOf(provider as ProviderId);
  if (!providerImpl) return NextResponse.json({ ok: false, error: "unknown_provider" }, { status: 400 });

  if (!(await isProviderEnabled(provider as ProviderId))) {
    return NextResponse.json({ ok: false, error: "provider_disabled" }, { status: 409 });
  }
  if (!providerImpl.configured()) {
    return NextResponse.json({ ok: false, error: "provider_not_configured" }, { status: 503 });
  }

  const booking = await getBookingByCode(code);
  if (!booking) return NextResponse.json({ ok: false, error: "booking_not_found" }, { status: 404 });
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ ok: false, error: "not_pending", status: booking.status }, { status: 409 });
  }

  const description = `${translate(locale, "brand.tagline")} · ${booking.code}`;

  const res = await providerImpl.createIntent({
    booking: {
      id: booking.id,
      code: booking.code,
      amountCents: booking.amountCents,
      currency: booking.currency,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
    },
    locale,
    baseUrl: siteUrl(),
    description,
  });

  if (res.kind === "error") {
    return NextResponse.json({ ok: false, error: res.message }, { status: 502 });
  }
  if (res.kind === "qrcode") {
    // 二维码在服务端渲染成 SVG，前端直接嵌入
    try {
      const { qrSvg } = await import("@/lib/payments/qr");
      const svg = await qrSvg(res.codeUrl);
      return NextResponse.json({ ok: true, kind: "qrcode", svg, providerRef: res.providerRef });
    } catch {
      return NextResponse.json({ ok: true, kind: "qrcode", codeUrl: res.codeUrl, providerRef: res.providerRef });
    }
  }
  return NextResponse.json({ ok: true, ...res });
}
