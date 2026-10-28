import { NextResponse, type NextRequest } from "next/server";
import { normalizeLocale } from "@/i18n/messages";
import { siteUrl } from "@/lib/config";

/**
 * 根路径按浏览器语言 / 上次选择进入中文或英文站。
 * /admin、/api、/o/[token]、/lookup 不受影响。
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const cookieLocale = req.cookies.get("xy_locale")?.value;
  const accept = req.headers.get("accept-language") ?? "";
  const locale = cookieLocale ? normalizeLocale(cookieLocale) : normalizeLocale(accept);

  // 不能直接用 req.nextUrl：反代场景下 Next 会用自己内部的 origin，
  // 拼出 https://localhost:3000/zh 这种错地址。显式按请求头还原对外地址。
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const base = host ? `${proto || "https"}://${host}` : siteUrl();

  return NextResponse.redirect(new URL(`/${locale}`, base));
}

export const config = { matcher: ["/"] };
