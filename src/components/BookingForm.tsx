"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { formatDate, formatMoney, formatTimeRange } from "@/lib/format";
import type { CourseDTO, SessionDTO } from "@/lib/dto";

export function BookingForm({
  session,
  course,
  holdMinutes,
}: {
  session: SessionDTO;
  course: CourseDTO;
  holdMinutes: number;
}) {
  const { t, locale, setLocale } = useLang();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState(1);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // 幂等键：同一份表单内容只生成一次，双击/刷新不会重复建单
  const idemRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const maxQty = Math.max(1, Math.min(session.left, 10));
  const total = session.priceCents * qty;

  const cancelPolicy = useMemo(() => {
    const pick = (field: string) => {
      const exact = course.translations.find((r) => r.locale === locale);
      const zh = course.translations.find((r) => r.locale === "zh");
      const en = course.translations.find((r) => r.locale === "en");
      return String(exact?.[field] || zh?.[field] || en?.[field] || "");
    };
    return pick("cancelPolicy");
  }, [course.translations, locale]);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("form.err.name");
    if (!email.trim()) e.email = t("form.err.email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = t("form.err.emailInvalid");
    if (qty < 1) e.qty = t("form.err.qty");
    if (!agree) e.agree = t("form.err.agree");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          name,
          email,
          qty,
          locale,
          idempotencyKey: idemRef.current,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(t(`form.err.${data.error}`) || data.message || t("form.err.generic"));
        setSubmitting(false);
        return;
      }
      if (data.token) {
        try {
          sessionStorage.setItem(`xy_tok_${data.code}`, data.token);
        } catch {
          /* ignore */
        }
      }
      router.push(`/${locale}/checkout/${data.code}`);
    } catch {
      setFormError(t("form.err.generic"));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      {/* 场次摘要 */}
      <div className="card p-4">
        <div className="text-[15px] font-bold">{formatDate(session.startAt, locale)}</div>
        <div className="mt-0.5 text-[13px] text-muted">
          {formatTimeRange(session.startAt, session.endAt)} · {t("sessions.utc8")}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-[13px] text-muted">
            {t("sessions.price")}（{t("sessions.perPerson")}）
          </span>
          <span className="text-[16px] font-bold text-accent">
            {formatMoney(session.priceCents, session.currency, locale)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[13px] text-muted">{t("sessions.seatsLeft")}</span>
          <span className="badge badge-green">{session.left}</span>
        </div>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-4">
        <h2 className="text-[15px] font-bold">{t("form.title")}</h2>

        <div>
          <label className="label" htmlFor="f-name">
            {t("form.name")}
          </label>
          <input
            id="f-name"
            className={`field ${errors.name ? "field-error" : ""}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("form.namePlaceholder")}
            autoComplete="name"
          />
          {errors.name ? <p className="mt-1 text-[12px] text-red-600">{errors.name}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="f-email">
            {t("form.email")}
          </label>
          <input
            id="f-email"
            type="email"
            inputMode="email"
            className={`field ${errors.email ? "field-error" : ""}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("form.emailPlaceholder")}
            autoComplete="email"
          />
          {errors.email ? <p className="mt-1 text-[12px] text-red-600">{errors.email}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="f-qty">
            {t("form.qty")}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost h-11 w-11 !px-0 text-lg"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="-"
            >
              −
            </button>
            <input
              id="f-qty"
              type="number"
              min={1}
              max={maxQty}
              className="field flex-1 text-center"
              value={qty}
              onChange={(e) =>
                setQty(Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)))
              }
            />
            <button
              type="button"
              className="btn btn-ghost h-11 w-11 !px-0 text-lg"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              aria-label="+"
            >
              +
            </button>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {t("sessions.seatsLeft")} {session.left}
          </p>
        </div>

        <div>
          <span className="label">{t("form.locale")}</span>
          <div className="flex gap-2">
            {(["zh", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`btn ${locale === l ? "btn-primary" : "btn-ghost"} !py-2 !text-[13px]`}
              >
                {l === "zh" ? "中文" : "English"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-canvas p-3">
          <div className="mb-1 text-[12px] font-bold">{t("course.cancelPolicy")}</div>
          <p className="prose-cn text-[12.5px] text-ink-soft">{cancelPolicy}</p>
        </div>

        <label className="flex items-start gap-2 text-[13px] leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[color:var(--color-accent)]"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span>{t("form.agree")}</span>
        </label>
        {errors.agree ? <p className="-mt-2 text-[12px] text-red-600">{errors.agree}</p> : null}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-[13px] text-muted">{t("checkout.total")}</span>
          <span className="text-[20px] font-extrabold text-accent">
            {formatMoney(total, session.currency, locale)}
          </span>
        </div>

        {formError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{formError}</div>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>

        <p className="text-center text-[11px] text-muted">
          {t("checkout.hold")} {holdMinutes} {t("checkout.holdUnit")}
        </p>
      </form>
    </div>
  );
}
