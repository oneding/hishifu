"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangProvider, LangSwitcherInline, useLang } from "@/components/lang";
import type { Locale } from "@/i18n/messages";

const NAV = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/sessions", key: "sessions" },
  { href: "/admin/orders", key: "orders" },
  { href: "/admin/emails", key: "emails" },
  { href: "/admin/course", key: "course" },
  { href: "/admin/settings", key: "settings" },
];

const LABEL: Record<string, { zh: string; en: string }> = {
  dashboard: { zh: "概览", en: "Overview" },
  sessions: { zh: "场次与名额", en: "Sessions" },
  orders: { zh: "订单", en: "Orders" },
  emails: { zh: "邮件", en: "Emails" },
  course: { zh: "课程", en: "Class" },
  settings: { zh: "设置", en: "Settings" },
  logout: { zh: "退出登录", en: "Sign out" },
  admin: { zh: "管理后台", en: "Admin console" },
};

export function AdminShell({
  initialLocale,
  email,
  children,
}: {
  initialLocale: Locale;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <LangProvider initial={initialLocale}>
      <div className="min-h-screen bg-canvas">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-ink px-2.5 py-1 text-[12px] font-bold text-white">
                {initialLocale === "zh" ? "后台" : "ADMIN"}
              </span>
              <span className="hidden text-[13px] text-muted sm:block">{email}</span>
            </div>
            <div className="flex items-center gap-2">
              <LangSwitcherInline />
              <form action="/api/admin/logout" method="post">
                <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-slate-100">
                  {LABEL.logout[initialLocale]}
                </button>
              </form>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} zh={LABEL[n.key].zh} en={LABEL[n.key].en} />
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      </div>
    </LangProvider>
  );
}

function NavLink({ href, zh, en }: { href: string; zh: string; en: string }) {
  const pathname = usePathname();
  const { locale } = useLang();
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
        active ? "bg-ink text-white" : "text-muted hover:bg-slate-100"
      }`}
    >
      {locale === "zh" ? zh : en}
    </Link>
  );
}
