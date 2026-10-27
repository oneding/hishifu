import { cookies } from "next/headers";
import { LangProvider } from "@/components/lang";
import { normalizeLocale } from "@/i18n/messages";
import { ResetClient } from "../RegisterClient";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  return (
    <LangProvider initial={locale}>
      <ResetClient token={token ?? ""} />
    </LangProvider>
  );
}
