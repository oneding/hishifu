import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { dirOf, normalizeLocale } from "@/i18n/messages";

export const metadata: Metadata = {
  title: "形意拳体验 · 上海",
  description: "上海零基础形意拳体验课预约（测试版）",
};

// Next 15 起 viewport 要单独导出，放在 metadata 里会告警
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
