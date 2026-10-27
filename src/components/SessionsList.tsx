"use client";

import Link from "next/link";
import { useLang } from "./lang";
import { formatDate, formatMoney, formatTimeRange } from "@/lib/format";
import type { SessionDTO } from "@/lib/dto";

export function SessionsList({ sessions }: { sessions: SessionDTO[] }) {
  const { t, locale } = useLang();

  if (!sessions.length) {
    return <div className="card p-6 text-center text-[14px] text-muted">{t("course.noSessions")}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="card hidden overflow-hidden sm:block">
        <table className="table">
          <thead>
            <tr>
              <th>{t("sessions.date")}</th>
              <th>{t("sessions.time")}</th>
              <th>{t("sessions.price")}</th>
              <th>{t("sessions.seatsLeft")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{formatDate(s.startAt, locale)}</td>
                <td>{formatTimeRange(s.startAt, s.endAt)}</td>
                <td className="font-semibold text-accent">
                  {formatMoney(s.priceCents, s.currency, locale)}
                </td>
                <td>
                  {s.left > 0 ? (
                    <span className="badge badge-green">{s.left}</span>
                  ) : (
                    <span className="badge badge-red">{t("sessions.full")}</span>
                  )}
                </td>
                <td className="text-right">
                  {s.bookable ? (
                    <Link href={`/${locale}/book/${s.id}`} className="btn btn-primary !py-2 !text-[13px]">
                      {t("sessions.select")}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {sessions.map((s) => (
          <div key={s.id} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <div className="text-[15px] font-bold">{formatDate(s.startAt, locale)}</div>
              <div className="text-[13px] text-muted">
                {formatTimeRange(s.startAt, s.endAt)} · {formatMoney(s.priceCents, s.currency, locale)}
              </div>
              <div className="mt-2">
                {s.left > 0 ? (
                  <span className="badge badge-green">
                    {t("sessions.seatsLeft")} {s.left}
                  </span>
                ) : (
                  <span className="badge badge-red">{t("sessions.full")}</span>
                )}
              </div>
            </div>
            {s.bookable ? (
              <Link href={`/${locale}/book/${s.id}`} className="btn btn-primary !px-4 !py-2 !text-[13px]">
                {t("sessions.select")}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
