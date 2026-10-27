"use client";

import { useT } from "./AuthUI";

export function MailPreview({ log }: { log: { id: string; html: string; toEmail: string; subject: string; status: string; error: string | null } }) {
  const t = useT();
  const links = Array.from(log.html.matchAll(/href="([^"]+)"/g))
    .map((m) => m[1])
    .filter((u) => u.startsWith("http"));

  return (
    <div className="card border-accent/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">{t("邮件详情", "Email detail")}</h2>
        <a className="text-[12px] text-muted underline" href="/admin/emails">
          {t("关闭", "Close")}
        </a>
      </div>
      <div className="mb-3 space-y-1 text-[12px] text-muted">
        <div>
          {t("收件人", "To")}: {log.toEmail} · {t("主题", "Subject")}: {log.subject} · {t("状态", "Status")}: {log.status}
        </div>
        {log.error ? <div className="text-red-600">{log.error}</div> : null}
        {links.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {links.slice(0, 3).map((u, i) => (
              <a key={i} href={u} target="_blank" className="btn btn-ghost !px-2 !py-1 !text-[12px]">
                {t("打开邮件中的链接", "Open link")} {i + 1}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <iframe
        title="email preview"
        className="h-[420px] w-full rounded-lg border border-line bg-white"
        srcDoc={log.html}
        sandbox=""
      />
    </div>
  );
}
