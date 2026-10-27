/**
 * 微信支付 APIv3 通知：验签（平台证书）→ 解密 resource → 落单。
 * 商户平台回调地址：https://<域名>/api/payments/wechat/webhook
 *
 * 微信要求：5 秒内返回，失败会重试 15 次；因此这里只做「验签 + 解密 + 落单」。
 */
import { NextResponse } from "next/server";
import { applyNormalizedEvent } from "@/lib/payments/apply";
import { wechatProvider } from "@/lib/payments/wechat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let ev;
  try {
    ev = await wechatProvider.parseWebhook(req);
  } catch {
    ev = null;
  }
  if (!ev) {
    return NextResponse.json({ code: "FAIL", message: "签名验证失败" }, { status: 401 });
  }

  const res = await applyNormalizedEvent("wechat", ev);
  if (!res.ok) {
    // 订单不存在 / 金额不符：返回 SUCCESS 让微信停止重试，问题转人工
    if (res.error === "booking_not_found" || res.error === "amount_mismatch") {
      return NextResponse.json({ code: "SUCCESS", message: "已接收（忽略）" });
    }
    return NextResponse.json({ code: "FAIL", message: res.error }, { status: 500 });
  }
  return NextResponse.json({ code: "SUCCESS", message: "成功" });
}
