"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/components/lang";
import { formatMoney } from "@/lib/format";

export function PayClient({
  code,
  amountCents,
  currency,
}: {
  code: string;
  amountCents: number;
  currency: string;
}) {
  const { t, locale } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function submit(outcome: "succeeded" | "failed" | "abandoned") {
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
        <h1 className="text-[20px] font-extrabold">
          {locale === "zh" ? "模拟收银台" : "Test checkout"}
        </h1>
        <p className="mt-1 text-[12px] text-muted">{t("checkout.testHint")}</p>
      </div>

      <div className="card p-5 text-center">
        <div className="text-[13px] text-muted">{t("order.code")}</div>
        <div className="my-1 text-[18px] font-bold tracking-wide">{code}</div>
        <div className="mt-3 text-[28px] font-extrabold text-accent">
          {formatMoney(amountCents, currency, locale)}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-[13px] font-bold">{t("checkout.simulate")}</div>
        <div className="space-y-2">
          <button
            className="btn btn-primary w-full"
            disabled={busy !== null}
            onClick={() => submit("succeeded")}
          >
            {busy === "succeeded"
              ? t("common.loading")
              : `${t("checkout.sim.success")} · ${formatMoney(amountCents, currency, locale)}`}
          </button>
          <button
            className="btn btn-ghost w-full"
            disabled={busy !== null}
            onClick={() => submit("failed")}
          >
            {busy === "failed" ? t("common.loading") : t("checkout.sim.fail")}
          </button>
          <button
            className="btn btn-ghost w-full !text-muted"
            disabled={busy !== null}
            onClick={() => submit("abandoned")}
          >
            {busy === "abandoned" ? t("common.loading") : t("checkout.sim.abandon")}
          </button>
        </div>
        {err ? <p className="mt-3 text-[12px] text-red-600">{err}</p> : null}
      </div>

      <p className="text-center text-[11px] leading-relaxed text-muted">
        {locale === "zh"
          ? "提交后由服务端签名回调更新订单状态，不以本页面结果为准。"
          : "The order is updated by a signed server-side notification, not by this page."}
      </p>
    </div>
  );
}
