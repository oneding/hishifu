import { cookies } from "next/headers";
import { LangProvider } from "@/components/lang";
import { normalizeLocale } from "@/i18n/messages";
import { LoginClient } from "../LoginClient";
import { redirectIfLoggedIn } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectIfLoggedIn();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  return (
    <LangProvider initial={locale}>
      <LoginClient />
    </LangProvider>
  );
}
