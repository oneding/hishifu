import { desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { emailLogs } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import { emailLive } from "@/lib/config";
import { adminResendLogAction } from "../actions";
import { ResendLogButton } from "../ResendLogButton";
import { MailPreview } from "../MailPreview";

export const dynamic = "force-dynamic";

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; preview?: string }>;
}) {
  const admin = await ensureAdmin();
  const sp = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";

  const db = await getDb();
  const rows = await db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(200);
  const filtered = sp.status && sp.status !== "all" ? rows.filter((r) => r.status === sp.status) : rows;
  const preview = sp.preview ? rows.find((r) => r.id === sp.preview) : null;

  const statusBadge = (s: string) =>
    s === "sent" ? "badge badge-green" : s === "failed" ? "badge badge-red" : s === "logged" ? "badge badge-amber" : "badge badge-slate";

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-4">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "邮件管理" : "Email log"}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {emailLive()
              ? zh
                ? "Resend 已启用，失败可在此重发。"
                : "Resend is enabled; failed messages can be resent here."
              : zh
                ? "未配置 RESEND_API_KEY：邮件仅记录不实发（状态 logged），可在下方查看内容与链接，配置 Key 后一键重发。"
                : "No RESEND_API_KEY: messages are logged only (status logged). Add the key and resend from here."}
          </p>
        </div>

        <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
          <div>
            <label className="label">{zh ? "状态" : "Status"}</label>
            <select className="field !py-2 !text-[13px]" name="status" defaultValue={sp.status ?? "all"}>
              <option value="all">{zh ? "全部" : "All"}</option>
              <option value="sent">sent</option>
              <option value="failed">failed</option>
              <option value="logged">logged</option>
            </select>
          </div>
          <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "筛选" : "Filter"}</button>
        </form>

        {preview ? <MailPreview log={preview} /> : null}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "时间（UTC+8）" : "Time (UTC+8)"}</th>
                  <th>{zh ? "收件人" : "To"}</th>
                  <th>{zh ? "主题" : "Subject"}</th>
                  <th>{zh ? "类型" : "Template"}</th>
                  <th>{zh ? "状态" : "Status"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-[13px] text-muted">
                      {zh ? "暂无记录" : "No records"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="text-[12px]">{toShanghaiInput(r.createdAt).replace("T", " ")}</td>
                      <td className="text-[12px]">{r.toEmail}</td>
                      <td className="text-[12px]">{r.subject}</td>
                      <td className="text-[12px] text-muted">{r.template}</td>
                      <td>
                        <span className={statusBadge(r.status)}>{r.status}</span>
                        {r.error ? <div className="mt-1 max-w-[240px] text-[11px] text-red-600">{r.error}</div> : null}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <a className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/emails?preview=${r.id}`}>
                            {zh ? "查看" : "View"}
                          </a>
                          <ResendLogButton logId={r.id} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
