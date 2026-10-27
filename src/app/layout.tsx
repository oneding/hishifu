import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { dirOf, normalizeLocale } from "@/i18n/messages";

export const metadata: Metadata = {
  title: "形意拳体验 · 上海",
  description: "上海零基础形意拳体验课预约（测试版）",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
