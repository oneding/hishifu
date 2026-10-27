"use client";

import { useActionState } from "react";
import { saveSettingsAction, type ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export function SettingsForm({
  data,
}: {
  data: { holdMinutes: number; contactEmail: string; cutoffHours: number };
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveSettingsAction, initial);

  return (
    <form action={action} className="card grid gap-3 p-4 sm:grid-cols-3">
      <div>
        <label className="label">{t("锁位超时（分钟）", "Hold timeout (minutes)")}</label>
        <input className="field" type="number" name="holdMinutes" defaultValue={data.holdMinutes} min={1} />
        <p className="mt-1 text-[11px] text-muted">{t("下单后临时锁定名额的时长", "How long seats are held after an order is created")}</p>
      </div>
      <div>
        <label className="label">{t("自助取消时限（小时）", "Self-service cancel cut-off (hours)")}</label>
        <input className="field" type="number" name="cutoffHours" defaultValue={data.cutoffHours} min={0} />
        <p className="mt-1 text-[11px] text-muted">{t("开课前多少小时可自助取消", "Hours before start during which users can cancel themselves")}</p>
      </div>
      <div>
        <label className="label">{t("联系邮箱", "Contact email")}</label>
        <input className="field" type="email" name="contactEmail" defaultValue={data.contactEmail} />
        <p className="mt-1 text-[11px] text-muted">{t("展示在前台与邮件中", "Shown on the site and in emails")}</p>
      </div>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="btn btn-primary !py-2 !text-[13px]" disabled={pending}>
          {pending ? t("保存中…", "Saving…") : t("保存设置", "Save settings")}
        </button>
        {state?.message ? (
          <span className="text-[13px] text-emerald-700">{state.message}</span>
        ) : null}
        {state?.error ? <span className="text-[13px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
