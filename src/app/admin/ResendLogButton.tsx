"use client";

import { useActionState } from "react";
import { adminResendLogAction, type ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export function ResendLogButton({ logId }: { logId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(adminResendLogAction, initial);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="logId" value={logId} />
      <button className="btn btn-ghost !px-2 !py-1 !text-[12px]" disabled={pending}>
        {pending ? "…" : t("重发", "Resend")}
      </button>
      {state?.message ? <span className="ml-1 text-[11px] text-emerald-700">{state.message}</span> : null}
    </form>
  );
}
