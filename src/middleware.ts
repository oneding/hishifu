import { NextResponse, type NextRequest } from "next/server";
import { normalizeLocale } from "@/i18n/messages";

/**
 * 根路径按浏览器语言 / 上次选择进入中文或英文站。
 * /admin、/api、/o/[token]、/lookup 不受影响。
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const cookieLocale = req.cookies.get("xy_locale")?.value;
  const accept = req.headers.get("accept-language") ?? "";
  const locale = cookieLocale ? normalizeLocale(cookieLocale) : normalizeLocale(accept);

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/"] };
