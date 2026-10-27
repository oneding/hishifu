"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { forgotPasswordAction, registerAction, resetPasswordAction, type ActionState } from "./actions";
import { AuthCard, Err, Field, LocaleHidden, Msg, useT } from "./AuthUI";

const initial: ActionState = {};

export function RegisterClient() {
  const t = useT();
  const [state, action, pending] = useActionState(registerAction, initial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthCard title={t("注册管理账号", "Create an admin account")}>
      <form action={action} className="space-y-3">
        <LocaleHidden />
        <Field label={t("姓名", "Name")} name="name" value={name} onChange={setName} />
        <Field label={t("邮箱", "Email")} name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label={t("密码（至少 8 位）", "Password (min. 8 characters)")}
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Msg state={state} />
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? t("提交中…", "Submitting…") : t("注册并发送验证邮件", "Register & send verification email")}
        </button>
      </form>
      <div className="mt-4 text-center text-[12px]">
        <Link href="/admin/login" className="text-muted underline">
          {t("已有账号？去登录", "Already have an account? Sign in")}
        </Link>
      </div>
    </AuthCard>
  );
}

export function ForgotClient() {
  const t = useT();
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  const [email, setEmail] = useState("");

  return (
    <AuthCard title={t("找回密码", "Reset your password")}>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        {t("输入注册邮箱，我们会发送重置链接（30 分钟内有效）。", "Enter your registered email and we'll send a reset link (valid 30 minutes).")}
      </p>
      <form action={action} className="space-y-3">
        <LocaleHidden />
        <Field label={t("邮箱", "Email")} name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Msg state={state} />
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? t("发送中…", "Sending…") : t("发送重置链接", "Send reset link")}
        </button>
      </form>
      <div className="mt-4 text-center text-[12px]">
        <Link href="/admin/login" className="text-muted underline">
          {t("返回登录", "Back to sign in")}
        </Link>
      </div>
    </AuthCard>
  );
}

export function ResetClient({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  const [password, setPassword] = useState("");

  if (!token) {
    return (
      <AuthCard title={t("链接无效", "Invalid link")}>
        <p className="text-[13px] text-muted">{t("重置链接缺失，请重新申请。", "The reset link is missing — please request a new one.")}</p>
        <div className="mt-4 text-center">
          <Link href="/admin/forgot" className="text-[13px] text-accent underline">
            {t("重新申请", "Request again")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("设置新密码", "Set a new password")}>
      <form action={action} className="space-y-3">
        <LocaleHidden />
        <input type="hidden" name="token" value={token} />
        <Field
          label={t("新密码（至少 8 位）", "New password (min. 8 characters)")}
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Err state={state} />
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? t("提交中…", "Submitting…") : t("确认重置", "Reset password")}
        </button>
      </form>
    </AuthCard>
  );
}
