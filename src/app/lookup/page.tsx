import { cookies } from "next/headers";
import { LookupClient } from "@/components/LookupClient";
import { normalizeLocale } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function LookupPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  return <LookupClient initialLocale={locale} />;
}
