"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { formatMoney } from "@/lib/format";

export interface PayChannel {
  id: string;
  label: string;
}

export function PayClient({
  code,
  amountCents,
  currency,
  channels,
}: {
  code: string;
  amountCents: number;
  currency: string;
  channels: PayChannel[];
}) {
  const { t, locale } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [qrProvider, setQrProvider] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const real = channels.filter((c) => c.id !== "mock");
  const hasMock = channels.some((c) => c.id === "mock");

  const stopPoll = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    stopPoll();
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(code)}/status`, { cache: "no-store" });
        const data = await res.json();
        if (data?.ok && (data.paymentStatus === "paid" || data.status === "confirmed")) {
          stopPoll();
          setPaid(true);
          router.push(`/${locale}/r/${code}`);
        }
      } catch {
        /* 网络抖动：下一轮继续 */
      }
    }, 3000);
  }, [code, locale, router, stopPoll]);

  useEffect(() => stopPoll, [stopPoll]);

  async function start(provider: string) {
    setBusy(provider);
    setErr("");
    setQr(null);
    try {
      const res = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, provider, locale }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error === "provider_not_configured" ? t("pay.err.channel") : t("pay.err.create"));
        setBusy(null);
        return;
      }
      if (data.kind === "redirect" && data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.kind === "qrcode" && data.svg) {
        setQrProvider(provider);
        setQr(data.svg);
        setBusy(null);
        startPoll();
        return;
      }
      setErr(t("pay.err.create"));
      setBusy(null);
    } catch {
      setErr(t("pay.err.create"));
      setBusy(null);
    }
  }

  async function submitMock(outcome: "succeeded" | "failed" | "abandoned") {
    setBusy(outcome);
    setErr("");
    try {
      const token = typeof window !== "undefined" ? sessionStorage.getItem(`xy_tok_${code}`) : null;
      const res = await fetch("/api/payments/mock/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, outcome, token }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error ?? "error");
        setBusy(null);
        return;
      }
      router.push(`/${locale}/r/${code}`);
    } catch {
      setErr("network");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="text-[20px] font-extrabold">{t("pay.title")}</h1>
        <p className="mt-1 text-[12px] text-muted">
          {real.length ? t("pay.hint.real") : t("checkout.testHint")}
        </p>
      </div>

      <div className="card p-5 text-center">
        <div className="text-[13px] text-muted">{t("order.code")}</div>
        <div className="my-1 text-[18px] font-bold tracking-wide">{code}</div>
        <div className="mt-3 text-[28px] font-extrabold text-accent">
          {formatMoney(amountCents, currency, locale)}
        </div>
      </div>

      {qr ? (
        <div className="card p-5 text-center">
          <div className="text-[14px] font-bold">{t("pay.qr.title")}</div>
          <div className="mx-auto my-3 w-[240px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-[12px] text-muted">{t("pay.qr.hint")}</p>
          <p className="mt-2 text-[12px] font-semibold text-accent">
            {paid ? t("pay.qr.success") : t("pay.qr.waiting")}
          </p>
          <button
            className="btn btn-ghost mt-3 !py-2 !text-[13px]"
            onClick={() => {
              setQr(null);
              if (qrProvider) start(qrProvider);
            }}
          >
            {t("pay.qr.renew")}
          </button>
        </div>
      ) : (
        <>
          {real.length ? (
            <div className="card p-4">
              <div className="mb-3 text-[13px] font-bold">{t("pay.choose")}</div>
              <div className="space-y-2">
                {real.map((c) => (
                  <button
                    key={c.id}
                    className="btn btn-primary w-full"
                    disabled={busy !== null}
                    onClick={() => start(c.id)}
                  >
                    {busy === c.id ? t("common.loading") : `${c.label} · ${formatMoney(amountCents, currency, locale)}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {hasMock ? (
            <div className="card p-4">
              <div className="mb-3 text-[13px] font-bold">{t("checkout.simulate")}</div>
              <div className="space-y-2">
                <button
                  className="btn btn-primary w-full"
                  disabled={busy !== null}
                  onClick={() => submitMock("succeeded")}
                >
                  {busy === "succeeded" ? t("common.loading") : `${t("checkout.sim.success")} · ${formatMoney(amountCents, currency, locale)}`}
                </button>
                <button className="btn btn-ghost w-full" disabled={busy !== null} onClick={() => submitMock("failed")}>
                  {busy === "failed" ? t("common.loading") : t("checkout.sim.fail")}
                </button>
                <button className="btn btn-ghost w-full !text-muted" disabled={busy !== null} onClick={() => submitMock("abandoned")}>
                  {busy === "abandoned" ? t("common.loading") : t("checkout.sim.abandon")}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {err ? <p className="text-center text-[12px] text-red-600">{err}</p> : null}

      <p className="text-center text-[11px] leading-relaxed text-muted">
        {locale === "zh"
          ? "订单状态由渠道的服务端通知确认，不以本页面结果为准。"
          : "Order status is set by the provider's server-side notification, not by this page."}
      </p>
    </div>
  );
}
