import { cookies } from "next/headers";
import { LangProvider } from "@/components/lang";
import { normalizeLocale } from "@/i18n/messages";
import { ForgotClient } from "../RegisterClient";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  return (
    <LangProvider initial={locale}>
      <ForgotClient />
    </LangProvider>
  );
}
