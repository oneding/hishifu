"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "@/components/lang";
import { formatDate, formatMoney, formatTimeRange } from "@/lib/format";

export interface CheckoutDTO {
  code: string;
  qty: number;
  amountCents: number;
  currency: string;
  holdExpiresAt: string | null;
  customerName: string;
  customerEmail: string;
  startAt: string;
  endAt: string;
  priceCents: number;
  sessionId: string;
  status: string;
}

export function CheckoutClient({ booking }: { booking: CheckoutDTO }) {
  const { t, locale } = useLang();
  const router = useRouter();
  const [left, setLeft] = useState(() => msLeft(booking.holdExpiresAt));

  useEffect(() => {
    const id = setInterval(() => setLeft(msLeft(booking.holdExpiresAt)), 1000);
    return () => clearInterval(id);
  }, [booking.holdExpiresAt]);

  const expired = left <= 0;

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="text-[20px] font-extrabold">{t("checkout.title")}</h1>
        <p className="mt-1 text-[12px] text-muted">{t("checkout.testHint")}</p>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-[13px] font-bold">{t("checkout.summary")}</div>

        <Row label={t("order.code")} value={booking.code} />
        <Row
          label={t("checkout.session")}
          value={`${formatDate(booking.startAt, locale)} ${formatTimeRange(booking.startAt, booking.endAt)}`}
        />
        <Row label={t("form.name")} value={booking.customerName} />
        <Row label={t("form.email")} value={booking.customerEmail} />
        <Row label={t("checkout.qty")} value={`${booking.qty}`} />
        <Row
          label={t("checkout.unit")}
          value={formatMoney(booking.priceCents, booking.currency, locale)}
        />

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-[13px] text-muted">{t("checkout.total")}</span>
          <span className="text-[22px] font-extrabold text-accent">
            {formatMoney(booking.amountCents, booking.currency, locale)}
          </span>
        </div>
      </div>

      {booking.holdExpiresAt ? (
        <div className="rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-ink-soft">
          {t("checkout.hold")} <b>{Math.ceil(left / 60000)}</b> {t("checkout.holdUnit")}
          {expired ? (
            <div className="mt-1 font-semibold text-red-700">
              {locale === "zh" ? "锁位已超时释放，请重新预约。" : "The hold expired. Please book again."}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="btn btn-primary w-full"
        disabled={expired || booking.status !== "pending_payment"}
        onClick={() => router.push(`/${locale}/pay/${booking.code}`)}
      >
        {t("checkout.pay")}
      </button>

      <button className="btn btn-ghost w-full" onClick={() => router.push(`/${locale}`)}>
        {t("result.backHome")}
      </button>
    </div>
  );
}

function msLeft(v: string | null) {
  if (!v) return 0;
  return Math.max(0, new Date(v).getTime() - Date.now());
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-right text-[13px] font-semibold">{value}</span>
    </div>
  );
}
