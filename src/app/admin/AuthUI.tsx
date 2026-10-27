"use client";

import Link from "next/link";
import { useLang } from "@/components/lang";
import type { ActionState } from "./actions";

/** 后台双语速记：t(中文, English) */
export function useT() {
  const { locale } = useLang();
  return (zh: string, en: string) => (locale === "zh" ? zh : en);
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 text-center">
        <div className="inline-flex rounded-lg bg-ink px-3 py-1 text-[12px] font-bold text-white">
          {t("形意拳预约 · 后台", "Xingyi Booking · Admin")}
        </div>
        <h1 className="mt-3 text-[20px] font-extrabold">{title}</h1>
      </div>
      <div className="card p-5">{children}</div>
      <div className="mt-4 text-center">
        <Link href="/zh" className="text-[12px] text-muted underline">
          {t("返回预约前台", "Back to booking site")}
        </Link>
      </div>
    </div>
  );
}

export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        className="field"
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

export function Err({ state }: { state: ActionState }) {
  if (!state?.error) return null;
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{state.error}</div>;
}

export function Msg({ state }: { state: ActionState }) {
  if (!state?.message && !state?.error) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-[13px] ${
        state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.error ?? state.message}
    </div>
  );
}

export function LocaleHidden() {
  const { locale } = useLang();
  return <input type="hidden" name="locale" value={locale} />;
}
