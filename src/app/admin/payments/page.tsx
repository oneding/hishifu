import { cookies } from "next/headers";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { listChannels } from "@/lib/payments";
import { siteUrl } from "@/lib/config";
import { togglePaymentChannelAction } from "../manage-actions";

export const dynamic = "force-dynamic";

export default async function PaymentsAdminPage() {
  const admin = await ensureAdmin();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";
  const channels = await listChannels(locale);
  const base = siteUrl();

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "支付渠道" : "Payment channels"}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {zh
              ? "密钥只配置在服务器环境变量中（不入库），此处控制渠道是否对客开放并查看配置状态。"
              : "Keys stay in server env vars (never in the DB); this page toggles what customers see."}
          </p>
        </div>

        <div className="space-y-3">
          {channels.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-bold">{c.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={c.configured ? "badge badge-green" : "badge badge-amber"}>
                      {c.configured ? (zh ? "已配置" : "Configured") : zh ? "缺少密钥" : "Missing keys"}
                    </span>
                    <span className={c.enabled ? "badge badge-green" : "badge badge-slate"}>
                      {c.enabled ? (zh ? "已启用" : "Enabled") : zh ? "已停用" : "Disabled"}
                    </span>
                    <span className="badge badge-slate">{c.mode}</span>
                    <span className="text-muted">{c.id}</span>
                  </div>
                </div>
                <form action={togglePaymentChannelAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="enabled" value={c.enabled ? "0" : "1"} />
                  <button
                    className="btn btn-ghost !py-2 !text-[13px]"
                    disabled={!c.configured && !c.enabled}
                    title={!c.configured ? (zh ? "密钥未配置，无法启用" : "Cannot enable without keys") : ""}
                  >
                    {c.enabled ? (zh ? "停用" : "Disable") : zh ? "启用" : "Enable"}
                  </button>
                </form>
              </div>

              <dl className="mt-3 space-y-1 text-[12px]">
                <div className="flex flex-wrap gap-2">
                  <dt className="text-muted">{zh ? "回调地址" : "Webhook URL"}：</dt>
                  <dd className="break-all font-mono text-[11px]">
                    {base}
                    {c.webhookPath}
                  </dd>
                </div>
                {c.missing.length ? (
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-muted">{zh ? "未配置的环境变量" : "Missing env vars"}：</dt>
                    <dd className="break-all font-mono text-[11px] text-red-700">{c.missing.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>

        <div className="card p-4 text-[12px] leading-relaxed text-muted">
          <p className="font-bold text-ink-soft">{zh ? "配置步骤" : "How to configure"}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{zh ? "在服务器 /srv/xingyi/.env 中填入渠道密钥，重启服务（systemctl restart xingyi）。" : "Add the keys to /srv/xingyi/.env on the server, then restart the service."}</li>
            <li>{zh ? "把上面的回调地址填到对应渠道的控制台，并订阅文档里列出的事件。" : "Paste the webhook URL above into each provider console and subscribe to the documented events."}</li>
            <li>{zh ? "回到本页点击「启用」，收银台才会出现该支付方式。" : "Come back and click Enable — only then does the method appear at checkout."}</li>
          </ol>
          <p className="mt-2">{zh ? "详细说明见 docs/PAYMENTS.md。" : "See docs/PAYMENTS.md for details."}</p>
        </div>
      </div>
    </AdminShell>
  );
}
