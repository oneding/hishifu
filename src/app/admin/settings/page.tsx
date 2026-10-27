import { cookies } from "next/headers";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import { allSettings } from "@/lib/settings";
import { SettingsForm } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await ensureAdmin();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";

  const db = await getDb();
  const s = await allSettings();
  const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50);

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-4">
        <h1 className="text-[20px] font-extrabold">{zh ? "设置" : "Settings"}</h1>

        <SettingsForm
          data={{
            holdMinutes: Number(s.HOLD_MINUTES ?? 15),
            contactEmail: String(s.CONTACT_EMAIL ?? ""),
            cutoffHours: Number(s.CANCEL_CUTOFF_HOURS ?? 24),
          }}
        />

        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-[15px] font-bold">
            {zh ? "操作审计" : "Audit log"}
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "时间（UTC+8）" : "Time (UTC+8)"}</th>
                  <th>{zh ? "操作人" : "Actor"}</th>
                  <th>{zh ? "动作" : "Action"}</th>
                  <th>{zh ? "对象" : "Target"}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="text-[12px]">{toShanghaiInput(l.createdAt).replace("T", " ")}</td>
                    <td className="text-[12px]">{l.adminEmail}</td>
                    <td className="text-[12px] font-semibold">{l.action}</td>
                    <td className="text-[12px] text-muted">
                      {l.targetType} {l.targetId ? `· ${l.targetId.slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
