"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "@/components/lang";

type Status = "pending_payment" | "confirmed" | "cancelled" | "expired";

export function ResultClient({ code, initial }: { code: string; initial: Status }) {
  const { t, locale } = useLang();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(`xy_tok_${code}`) ?? "");
    } catch {
      /* ignore */
    }
  }, [code]);

  useEffect(() => {
    if (status !== "pending_payment") return;
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      if (tries > 30) {
        clearInterval(id);
        return;
      }
      try {
        const res = await fetch(`/api/bookings/${code}/status`, { cache: "no-store" });
        const data = await res.json();
        if (data.ok) {
          setStatus(data.status);
          setPaymentStatus(data.paymentStatus);
          if (data.status !== "pending_payment") clearInterval(id);
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [status, code]);

  const success = status === "confirmed";
  const pending = status === "pending_payment";

  return (
    <div className="px-4 py-10">
      <div className="card p-6 text-center">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
            success ? "bg-emerald-100 text-emerald-700" : pending ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
          }`}
        >
          {success ? "✓" : pending ? "⋯" : "!"}
        </div>

        <h1 className="text-[20px] font-extrabold">
          {success ? t("result.success.title") : pending ? t("result.pending.title") : t("result.failed.title")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
          {success ? t("result.success.desc") : pending ? t("result.pending.desc") : t("result.failed.desc")}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-[12px] text-muted">
          <span>{t("order.code")}</span>
          <b className="tracking-wide text-ink">{code}</b>
        </div>

        <div className="mt-6 space-y-2">
          {success && token ? (
            <Link href={`/o/${token}`} className="btn btn-primary w-full">
              {t("result.viewOrder")}
            </Link>
          ) : null}

          {!success && !pending ? (
            <button
              className="btn btn-primary w-full"
              onClick={() => router.push(`/${locale}`)}
            >
              {t("result.retry")}
            </button>
          ) : null}

          {pending ? (
            <button className="btn btn-ghost w-full" onClick={() => location.reload()}>
              {t("common.loading")}
            </button>
          ) : null}

          <Link href={`/${locale}`} className="btn btn-ghost w-full">
            {t("result.backHome")}
          </Link>

          {!token ? (
            <Link href="/lookup" className="btn btn-ghost w-full !text-muted">
              {t("order.resend")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
