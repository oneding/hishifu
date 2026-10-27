"use client";

import { useActionState } from "react";
import { changeMyPasswordAction } from "./manage-actions";
import type { ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export function ChangePasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState(changeMyPasswordAction, initial);

  return (
    <form action={action} className="card grid gap-3 p-4 sm:grid-cols-3">
      <input type="hidden" name="locale" value={t("zh", "en")} />
      <div>
        <label className="label">{t("当前密码", "Current password")}</label>
        <input className="field" type="password" name="current" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label">{t("新密码（≥8 位）", "New password (≥8)")}</label>
        <input className="field" type="password" name="password" minLength={8} autoComplete="new-password" required />
      </div>
      <div className="flex items-end gap-3">
        <button className="btn btn-primary !py-2 !text-[13px]" disabled={pending}>
          {pending ? t("提交中…", "Saving…") : t("修改密码", "Change password")}
        </button>
        {state?.message ? <span className="text-[13px] text-emerald-700">{state.message}</span> : null}
        {state?.error ? <span className="text-[13px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
