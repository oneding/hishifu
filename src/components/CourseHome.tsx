"use client";

import Link from "next/link";
import { useLang, usePickLocale } from "@/components/lang";
import { formatDate, formatMoney, formatTimeRange, labelLanguages } from "@/lib/format";
import type { CourseDTO, SessionDTO } from "@/lib/dto";

export function CourseHome({ course, sessions }: { course: CourseDTO; sessions: SessionDTO[] }) {
  const { t, locale } = useLang();
  const pick = usePickLocale();
  const tr = course.translations;
  const venue = course.venues?.[0];

  const title = pick(tr, "title");
  const summary = pick(tr, "summary");
  const description = pick(tr, "description");
  const audience = pick(tr, "audience");
  const includes = pick(tr, "includes");
  const excludes = pick(tr, "excludes");
  const cancelPolicy = pick(tr, "cancelPolicy");
  const venueName = pick(venue?.translations ?? [], "name");
  const venueAddress = pick(venue?.translations ?? [], "addressLine");
  const directions = pick(venue?.translations ?? [], "directions");

  const minPrice = sessions.length ? Math.min(...sessions.map((s) => s.priceCents)) : 0;
  const currency = sessions[0]?.currency ?? "CNY";

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink px-5 pb-8 pt-10 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/30 blur-2xl"
        />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide">
            <span>{t("brand.tagline")}</span>
          </div>
          <h1 className="text-[26px] font-extrabold leading-snug sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-slate-300">{summary}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <span className="font-semibold">
              {t("course.from")} {formatMoney(minPrice, currency, locale)}{" "}
              <span className="font-normal text-slate-300">/ {t("course.perPerson")}</span>
            </span>
            <span className="text-slate-300">
              {t("course.duration")} {course.durationMinutes} {t("course.minutes")}
            </span>
            <span className="text-slate-300">
              {t("course.taughtLanguage")}：{labelLanguages(course.taughtLanguages, locale)}
            </span>
          </div>
        </div>
      </section>

      <div className="space-y-4 px-4 py-5">
        {/* 页面语言 vs 授课语言 */}
        <div className="rounded-xl border border-line bg-accent-soft px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
          <b>{t("course.pageLanguage")}</b>：{locale === "zh" ? "中文 / English" : "English / 中文"} ·{" "}
          {t("course.pageLanguageHint")}
        </div>

        <Section title={t("course.about")}>
          <p className="prose-cn text-[14px]">{description}</p>
        </Section>

        <Section title={t("course.audience")}>
          <p className="prose-cn text-[14px]">{audience}</p>
        </Section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title={t("course.includes")}>
            <p className="prose-cn text-[14px]">{includes}</p>
          </Section>
          <Section title={t("course.excludes")}>
            <p className="prose-cn text-[14px]">{excludes}</p>
          </Section>
        </div>

        <Section title={t("course.location")}>
          <div className="text-[14px] font-semibold">{venueName}</div>
          <div className="mt-1 text-[13px] text-muted">{venueAddress}</div>
          {directions ? (
            <div className="mt-2 text-[13px] leading-relaxed text-ink-soft">{directions}</div>
          ) : null}
          {venue?.mapUrl ? (
            <a
              href={venue.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[13px] font-semibold text-accent underline"
            >
              {t("order.map")} →
            </a>
          ) : null}
        </Section>

        <Section title={t("course.cancelPolicy")}>
          <p className="prose-cn text-[14px]">{cancelPolicy}</p>
        </Section>

        {/* 场次 */}
        <section id="sessions" className="pt-2">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">{t("course.upcoming")}</h2>
            <span className="text-[11px] text-muted">{t("sessions.utc8")}</span>
          </div>
          <p className="mb-3 text-[12px] text-muted">{t("sessions.subtitle")}</p>

          {sessions.length === 0 ? (
            <div className="card p-6 text-center text-[14px] text-muted">{t("course.noSessions")}</div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <SessionCard key={s.id} s={s} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionCard({ s }: { s: SessionDTO }) {
  const { t, locale } = useLang();
  const full = s.left <= 0;
  const closed = s.status !== "open";
  const disabled = full || closed;

  return (
    <div className="card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="text-[15px] font-bold">{formatDate(s.startAt, locale)}</div>
        <div className="mt-0.5 text-[13px] text-muted">
          {formatTimeRange(s.startAt, s.endAt)} · {t("sessions.utc8")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-accent">
            {formatMoney(s.priceCents, s.currency, locale)}
          </span>
          <span className="text-[11px] text-muted">/ {t("sessions.perPerson")}</span>
          {full ? (
            <span className="badge badge-red">{t("sessions.full")}</span>
          ) : closed ? (
            <span className="badge badge-slate">{t("sessions.closed")}</span>
          ) : (
            <span className="badge badge-green">
              {t("sessions.seatsLeft")} {s.left}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {disabled ? (
          <span className="btn btn-ghost cursor-not-allowed opacity-50">{t("sessions.select")}</span>
        ) : (
          <Link href={`/${locale}/book/${s.id}`} className="btn btn-primary">
            {t("sessions.select")}
          </Link>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}
