import Link from "next/link";
import { LangProvider } from "@/components/lang";
import { verifyTokenAction } from "../actions";
import { normalizeLocale } from "@/i18n/messages";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const result = token ? await verifyTokenAction(token) : { ok: false, message: "链接缺失" };

  return (
    <LangProvider initial={locale}>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="card p-6 text-center">
          <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${result.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {result.ok ? "✓" : "!"}
          </div>
          <h1 className="text-[18px] font-extrabold">
            {result.ok ? (locale === "zh" ? "邮箱验证成功" : "Email verified") : locale === "zh" ? "验证失败" : "Verification failed"}
          </h1>
          <p className="mt-2 text-[13px] text-muted">{result.message}</p>
          <div className="mt-5">
            <Link href="/admin/login" className="btn btn-primary w-full">
              {locale === "zh" ? "前往登录" : "Go to sign in"}
            </Link>
          </div>
        </div>
      </div>
    </LangProvider>
  );
}
