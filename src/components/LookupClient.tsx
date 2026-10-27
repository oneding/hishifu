"use client";

import Link from "next/link";
import { useState } from "react";
import { LangProvider, LangSwitcherInline, useLang } from "@/components/lang";
import { normalizeLocale, type Locale } from "@/i18n/messages";

export function LookupClient({ initialLocale }: { initialLocale: Locale }) {
  return (
    <LangProvider initial={initialLocale}>
      <Inner />
    </LangProvider>
  );
}

function Inner() {
  const { t, locale } = useLang();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setErr(t("form.err.emailInvalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) setErr(t("form.err.generic"));
      else setDone(true);
    } catch {
      setErr(t("form.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl bg-canvas">
      <div className="bg-amber-100 px-4 py-2 text-center text-[12px] font-semibold text-amber-900">
        ⚠️ {t("test.banner")}
      </div>
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <Link href={`/${locale}`} className="text-[15px] font-extrabold">
          {t("brand.name")}
        </Link>
        <LangSwitcherInline />
      </div>

      <div className="px-4 py-8">
        <div className="card p-5">
          <h1 className="text-[19px] font-extrabold">{t("lookup.title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("lookup.desc")}</p>

          {done ? (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
              {t("lookup.sent")}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="lk">
                  {t("form.email")}
                </label>
                <input
                  id="lk"
                  type="email"
                  inputMode="email"
                  className={`field ${err ? "field-error" : ""}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("form.emailPlaceholder")}
                />
                {err ? <p className="mt-1 text-[12px] text-red-600">{err}</p> : null}
              </div>
              <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? t("common.loading") : t("lookup.submit")}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link href={`/${locale}`} className="text-[13px] text-accent underline">
              {t("result.backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export { normalizeLocale };
