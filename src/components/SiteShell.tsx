"use client";

import Link from "next/link";
import { LangProvider, LangSwitcherInline, useLang } from "./lang";
import { buildAtLabel, versionFull } from "@/lib/version";
import type { Locale } from "@/i18n/messages";

export function SiteShell({
  initialLocale,
  children,
  showNav = true,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
  showNav?: boolean;
}) {
  return (
    <LangProvider initial={initialLocale}>
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-canvas">
        <TestBanner />
        {showNav ? <TopNav /> : null}
        <main className="flex-1 pb-16">{children}</main>
        <Footer />
      </div>
    </LangProvider>
  );
}

function TestBanner() {
  const { t } = useLang();
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-[12px] font-semibold text-amber-900">
      ⚠️ {t("test.banner")}
    </div>
  );
}

function TopNav() {
  const { t, locale } = useLang();
  const link = (p: string) => `/${locale}${p}`;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href={link("")} className="flex flex-col leading-tight">
          <span className="text-[15px] font-extrabold tracking-wide text-ink">
            {t("brand.name")}
          </span>
          <span className="text-[11px] text-muted">{t("brand.tagline")}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitcherInline />
          <Link
            href="/lookup"
            className="hidden rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft sm:block"
          >
            {t("nav.lookup")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { t, locale } = useLang();
  return (
    <footer className="border-t border-line bg-white px-4 py-6 text-center text-[11px] leading-relaxed text-muted">
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href={`/${locale}/sessions`} className="hover:text-ink">
          {t("nav.sessions")}
        </Link>
        <Link href="/lookup" className="hover:text-ink">
          {t("nav.lookup")}
        </Link>
        <Link href="/admin" className="hover:text-ink">
          {t("nav.admin")}
        </Link>
      </div>
      <div>{t("test.demoData")}</div>
      <div className="mt-1 select-all font-mono text-[10px] text-muted/80">
        {versionFull()}
        {buildAtLabel() ? ` · ${buildAtLabel()}` : ""}
      </div>
    </footer>
  );
}
