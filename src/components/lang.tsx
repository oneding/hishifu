"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  dirOf,
  messages,
  translate,
  type Locale,
} from "@/i18n/messages";

type LangCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({
  initial,
  children,
  syncCookie = true,
}: {
  initial: Locale;
  children: React.ReactNode;
  syncCookie?: boolean;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    // 与服务端渲染的 <html lang> 对齐，并让阿拉伯语等 RTL 语言生效
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      if (syncCookie) {
        document.cookie = `xy_locale=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    },
    [syncCookie],
  );

  const value = useMemo<LangCtx>(
    () => ({ locale, setLocale, t: (k, v) => translate(locale, k, v) }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}

/** 双语字段：按当前语言取值，缺失时回退另一种语言 */
export function usePickLocale() {
  const { locale } = useLang();
  return useCallback(
    function pick(item: { locale: string; [k: string]: any }[] | undefined, field: string): string {
      if (!item?.length) return "";
      const exact = item.find((r) => r.locale === locale);
      if (exact && exact[field]) return String(exact[field] ?? "");
      const zh = item.find((r) => r.locale === "zh");
      const en = item.find((r) => r.locale === "en");
      const any = item[0];
      return String((zh?.[field] || en?.[field] || any?.[field]) ?? "");
    },
    [locale],
  );
}

export function LangSwitcherInline({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLang();
  return (
    <div className={`inline-flex rounded-lg border border-line bg-white p-0.5 ${className}`}>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
            locale === l ? "bg-ink text-white" : "text-muted hover:bg-slate-100"
          }`}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export { messages };
