"use client";

import { useActionState } from "react";
import { adminResendLookupAction, type ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export function ResendLookupForm() {
  const t = useT();
  const [state, action, pending] = useActionState(adminResendLookupAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <label className="label">{t("凭邮箱重发预约链接", "Resend booking link by email")}</label>
        <input
          className="field !py-2 !text-[13px]"
          name="email"
          type="email"
          placeholder="customer@example.com"
          required
        />
      </div>
      <button className="btn btn-ghost !py-2 !text-[13px]" disabled={pending}>
        {t("发送", "Send")}
      </button>
      {state?.message ? (
        <div className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{state.message}</div>
      ) : null}
      {state?.error ? (
        <div className="w-full rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{state.error}</div>
      ) : null}
    </form>
  );
}
