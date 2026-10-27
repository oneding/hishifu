"use client";

import { useActionState, useState } from "react";
import { saveSessionAction, toggleSessionAction, type ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export interface SessionRowDTO {
  id: string;
  startAt: string;
  endAt: string;
  startInput: string;
  endInput: string;
  priceCents: number;
  currency: string;
  capacity: number;
  seatsConfirmed: number;
  seatsHeld: number;
  left: number;
  status: string;
  note: string;
  venueId: string;
}

export function SessionsAdmin({
  sessions,
  venueId,
}: {
  sessions: SessionRowDTO[];
  venueId: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState<SessionRowDTO | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold">{t("场次与名额", "Sessions & capacity")}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {t("所有时间按上海当地时间（UTC+8）填写与展示", "All times are entered and shown in Shanghai time (UTC+8)")}
          </p>
        </div>
        <button className="btn btn-primary !py-2 !text-[13px]" onClick={() => setEditing(blank(venueId))}>
          + {t("新增场次", "Add session")}
        </button>
      </div>

      {editing ? (
        <SessionForm key={editing.id || "new"} session={editing} onClose={() => setEditing(null)} />
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t("开始（UTC+8）", "Start (UTC+8)")}</th>
                <th>{t("价格", "Price")}</th>
                <th>{t("已确认", "Confirmed")}</th>
                <th>{t("锁定", "Held")}</th>
                <th>{t("剩余", "Left")}</th>
                <th>{t("状态", "Status")}</th>
                <th>{t("操作", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">
                    {s.startInput.replace("T", " ")}
                    <div className="text-[11px] font-normal text-muted">→ {s.endInput.replace("T", " ")}</div>
                  </td>
                  <td>
                    {(s.priceCents / 100).toFixed(0)} {s.currency}
                  </td>
                  <td>{s.seatsConfirmed}</td>
                  <td>{s.seatsHeld}</td>
                  <td>
                    <span className={s.left === 0 ? "badge badge-red" : "badge badge-green"}>{s.left}</span>
                  </td>
                  <td>
                    <span className={s.status === "open" ? "badge badge-green" : "badge badge-slate"}>{s.status}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button className="btn btn-ghost !px-2 !py-1 !text-[12px]" onClick={() => setEditing(s)}>
                        {t("编辑", "Edit")}
                      </button>
                      <form action={toggleSessionAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="status" value={s.status === "open" ? "closed" : "open"} />
                        <button className="btn btn-ghost !px-2 !py-1 !text-[12px]">
                          {s.status === "open" ? t("关闭", "Close") : t("开放", "Open")}
                        </button>
                      </form>
                      <a className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/sessions/${s.id}/roster.csv`}>
                        {t("名单", "Roster")}
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function blank(venueId: string): SessionRowDTO {
  const now = new Date(Date.now() + 7 * 86400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T10:00`;
  return {
    id: "",
    startAt: "",
    endAt: "",
    startInput: start,
    endInput: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T11:30`,
    priceCents: 19900,
    currency: "CNY",
    capacity: 12,
    seatsConfirmed: 0,
    seatsHeld: 0,
    left: 12,
    status: "open",
    note: "",
    venueId,
  };
}

function SessionForm({ session, onClose }: { session: SessionRowDTO; onClose: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveSessionAction, initial);
  const [notify, setNotify] = useState(true);

  return (
    <div className="card border-accent/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">
          {session.id ? `${t("编辑场次", "Edit session")} · ${session.startInput}` : t("新增场次", "Add session")}
        </h2>
        <button className="text-[12px] text-muted underline" onClick={onClose} type="button">
          {t("关闭", "Close")}
        </button>
      </div>

      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={session.id} />
        <input type="hidden" name="venueId" value={session.venueId} />
        {state?.needConfirm ? <input type="hidden" name="confirm" value="1" /> : null}

        <div>
          <label className="label">{t("开始时间（UTC+8）", "Start (UTC+8)")}</label>
          <input className="field" type="datetime-local" name="startAt" defaultValue={session.startInput} required />
        </div>
        <div>
          <label className="label">{t("结束时间（UTC+8）", "End (UTC+8)")}</label>
          <input className="field" type="datetime-local" name="endAt" defaultValue={session.endInput} required />
        </div>
        <div>
          <label className="label">{t("价格（分）", "Price (cents)")}</label>
          <input className="field" type="number" name="priceCents" defaultValue={session.priceCents} min={0} />
        </div>
        <div>
          <label className="label">{t("币种", "Currency")}</label>
          <input className="field" name="currency" defaultValue={session.currency} maxLength={3} />
        </div>
        <div>
          <label className="label">{t("人数上限", "Capacity")}</label>
          <input className="field" type="number" name="capacity" defaultValue={session.capacity} min={1} />
        </div>
        <div>
          <label className="label">{t("状态", "Status")}</label>
          <select className="field" name="status" defaultValue={session.status}>
            <option value="open">{t("开放报名", "Open")}</option>
            <option value="closed">{t("停止报名", "Closed")}</option>
            <option value="cancelled">{t("已取消场次", "Cancelled")}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t("备注（内部）", "Internal note")}</label>
          <input className="field" name="note" defaultValue={session.note} />
        </div>

        {state?.needConfirm ? (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 sm:col-span-2">
            <div className="text-[13px] font-semibold text-amber-900">
              ⚠️ {state.message}
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              {t("同时向受影响用户发送变更通知邮件", "Also email affected participants about the change")}
            </label>
            {notify ? <input type="hidden" name="notify" value="1" /> : null}
          </div>
        ) : null}

        {state?.message && !state.needConfirm ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 sm:col-span-2">
            {state.message}
          </div>
        ) : null}
        {state?.error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">{state.error}</div>
        ) : null}

        <div className="sm:col-span-2">
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? t("保存中…", "Saving…") : state?.needConfirm ? t("确认修改", "Confirm change") : t("保存", "Save")}
          </button>
        </div>
      </form>
    </div>
  );
}
