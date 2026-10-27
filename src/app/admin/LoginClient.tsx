"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, loginWithCodeAction, sendLoginCodeAction, type ActionState } from "./actions";
import { AuthCard, Err, Field, LocaleHidden, Msg, useT } from "./AuthUI";

const initial: ActionState = {};

export function LoginClient() {
  const t = useT();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [pwState, pwAction, pwPending] = useActionState(loginAction, initial);
  const [sendState, sendAction, sendPending] = useActionState(sendLoginCodeAction, initial);
  const [codeState, codeAction, codePending] = useActionState(loginWithCodeAction, initial);

  return (
    <AuthCard title={t("登录管理后台", "Sign in to the console")}>
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-0.5">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "password" ? "bg-ink text-white" : "text-muted"}`}
        >
          {t("邮箱密码", "Email & password")}
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "code" ? "bg-ink text-white" : "text-muted"}`}
        >
          {t("邮箱验证码", "Email code")}
        </button>
      </div>

      {mode === "password" ? (
        <form action={pwAction} className="space-y-3">
          <LocaleHidden />
          <Field label={t("邮箱", "Email")} name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field
            label={t("密码", "Password")}
            name="password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
          <Err state={pwState} />
          <button className="btn btn-primary w-full" disabled={pwPending}>
            {pwPending ? t("登录中…", "Signing in…") : t("登录", "Sign in")}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <form action={sendAction} className="space-y-3">
            <LocaleHidden />
            <Field label={t("邮箱", "Email")} name="email" type="email" value={email} onChange={setEmail} />
            <Msg state={sendState} />
            <button className="btn btn-ghost w-full" disabled={sendPending}>
              {sendPending ? t("发送中…", "Sending…") : t("发送验证码", "Send code")}
            </button>
          </form>
          <form action={codeAction} className="space-y-3 border-t border-line pt-3">
            <LocaleHidden />
            <input type="hidden" name="email" value={email} />
            <Field label={t("验证码", "Code")} name="code" value={code} onChange={setCode} />
            <Err state={codeState} />
            <button className="btn btn-primary w-full" disabled={codePending}>
              {t("用验证码登录", "Sign in with code")}
            </button>
          </form>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[12px]">
        <Link href="/admin/forgot" className="text-accent underline">
          {t("忘记密码？", "Forgot password?")}
        </Link>
        <Link href="/admin/register" className="text-muted underline">
          {t("注册新账号", "Create an account")}
        </Link>
      </div>
    </AuthCard>
  );
}
