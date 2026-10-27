"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LangProvider, useLang } from "@/components/lang";
import type { Locale } from "@/i18n/messages";
import { formatDateTimeFull, formatMoney, labelLanguages } from "@/lib/format";

export interface OrderDTO {
  code: string;
  courseTitle: string;
  startAt: string;
  endAt: string;
  qty: number;
  amountCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  refundStatus: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  directions: string;
  taughtLanguages: string[];
  contactEmail: string;
  cancelPolicy: string;
  canCancel: boolean;
  cutoffHours: number;
  token: string;
}

const badgeClass: Record<string, string> = {
  confirmed: "badge badge-green",
  pending_payment: "badge badge-amber",
  cancelled: "badge badge-red",
  expired: "badge badge-slate",
  paid: "badge badge-green",
  unpaid: "badge badge-slate",
  failed: "badge badge-red",
  refunded: "badge badge-green",
  requested: "badge badge-amber",
  processing: "badge badge-amber",
  none: "badge badge-slate",
};

export function OrderDetail({ order, locale }: { order: OrderDTO; locale: Locale }) {
  return (
    <LangProvider initial={locale}>
      <Inner order={order} />
    </LangProvider>
  );
}

function Inner({ order }: { order: OrderDTO }) {
  const { t, locale } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [local, setLocal] = useState(order);

  async function cancel() {
    if (!confirm(t("order.cancelConfirm"))) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: order.token }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(
          data.error === "too_late"
            ? locale === "zh"
              ? `已超过自助取消时限（开课前 ${data.cutoffHours} 小时），请联系我们处理。`
              : `Past the self-service cut-off (${data.cutoffHours}h before start). Please contact us.`
            : data.error,
        );
      } else {
        setLocal({ ...local, status: data.status, refundStatus: data.refundStatus });
        setMsg(t("order.cancelDone"));
        router.refresh();
      }
    } catch {
      setErr("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl bg-canvas pb-12">
      <div className="bg-ink px-5 py-6 text-white">
        <div className="text-[12px] text-slate-300">{t("brand.tagline")}</div>
        <h1 className="mt-1 text-[20px] font-extrabold">{t("order.title")}</h1>
      </div>

      <div className="space-y-4 px-4 py-5">
        {msg ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{msg}</div>
        ) : null}
        {err ? <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{err}</div> : null}

        {/* 状态卡 */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass[local.status] ?? "badge"}>
              {t("order.bookingStatus")}：{t(`status.${local.status}`)}
            </span>
            <span className={badgeClass[local.paymentStatus] ?? "badge"}>
              {t("order.paymentStatus")}：{t(`status.${local.paymentStatus}`)}
            </span>
            <span className={badgeClass[local.refundStatus] ?? "badge"}>
              {t("order.refundStatus")}：{t(`status.${local.refundStatus}`)}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <Row label={t("order.code")} value={local.code} strong />
          <Row label={t("order.course")} value={local.courseTitle} />
          <Row
            label={t("order.datetime")}
            value={formatDateTimeFull(local.startAt, local.endAt, locale)}
          />
          <Row
            label={t("order.qty")}
            value={`${local.qty} ${locale === "zh" ? "人" : local.qty > 1 ? "people" : "person"}`}
          />
          <Row
            label={t("order.amount")}
            value={formatMoney(local.amountCents, local.currency, locale)}
            strong
          />
          <Row
            label={t("order.taughtLanguage")}
            value={labelLanguages(local.taughtLanguages, locale)}
          />
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-[15px] font-bold">{t("order.venue")}</h2>
          <div className="text-[14px] font-semibold">{local.venueName}</div>
          <div className="mt-0.5 text-[13px] text-muted">{local.venueAddress}</div>
          {local.directions ? (
            <div className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              <div className="mb-1 text-[12px] font-bold text-muted">{t("order.directions")}</div>
              {local.directions}
            </div>
          ) : null}
          {local.mapUrl ? (
            <a
              href={local.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[13px] font-semibold text-accent underline"
            >
              {t("order.map")} →
            </a>
          ) : null}
        </div>

        <div className="card p-4">
          <Row label={t("form.name")} value={local.customerName} />
          <Row label={t("form.email")} value={local.customerEmail} />
          <Row label={t("order.contact")} value={local.contactEmail} />
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-[15px] font-bold">{t("course.cancelPolicy")}</h2>
          <p className="prose-cn text-[13px]">{local.cancelPolicy}</p>
        </div>

        {local.canCancel ? (
          <button className="btn btn-ghost w-full !border-red-200 !text-red-700" onClick={cancel} disabled={busy}>
            {busy ? t("common.loading") : t("order.cancel")}
          </button>
        ) : null}

        <div className="pt-2 text-center text-[11px] text-muted">{t("test.banner")}</div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className={`text-right text-[13.5px] ${strong ? "font-bold" : "font-semibold"}`}>{value}</span>
    </div>
  );
}
