import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { bookings, classSessions, payments } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import { markRefundedFromTxAction } from "../manage-actions";

export const dynamic = "force-dynamic";

const TX_ZH: Record<string, string> = {
  succeeded: "成功",
  failed: "失败",
  abandoned: "已放弃",
  paid: "已付款",
  unpaid: "未付款",
  refunded: "已退款",
  requested: "已申请",
  processing: "处理中",
  none: "无",
};
const TX_EN: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  abandoned: "Abandoned",
  paid: "Paid",
  unpaid: "Unpaid",
  refunded: "Refunded",
  requested: "Requested",
  processing: "Processing",
  none: "None",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const admin = await ensureAdmin();
  const sp = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";
  const L = (k: string) => (zh ? TX_ZH[k] ?? k : TX_EN[k] ?? k);

  const db = await getDb();
  const conds = [];
  if (sp.status && sp.status !== "all") conds.push(eq(payments.status, sp.status));
  if (sp.from) conds.push(gte(payments.createdAt, new Date(`${sp.from}T00:00:00+08:00`)));
  if (sp.to) conds.push(lte(payments.createdAt, new Date(`${sp.to}T23:59:59+08:00`)));
  if (sp.q) {
    const like = `%${sp.q}%`;
    conds.push(
      or(
        sql`${payments.providerRef} ilike ${like}`,
        sql`${payments.eventId} ilike ${like}`,
        sql`${bookings.code} ilike ${like}`,
        sql`${bookings.customerEmail} ilike ${like}`,
        sql`${bookings.customerName} ilike ${like}`,
      )!,
    );
  }

  const rows = await db
    .select({ p: payments, b: bookings, s: classSessions })
    .from(payments)
    .leftJoin(bookings, eq(payments.bookingId, bookings.id))
    .leftJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payments.createdAt))
    .limit(500);

  const totals = rows.reduce(
    (acc, r) => {
      if (r.p.status === "succeeded") {
        acc.succeededCount += 1;
        acc.succeededCents += r.p.amountCents;
      }
      if (r.p.status === "failed") acc.failedCount += 1;
      if (r.p.status === "abandoned") acc.abandonedCount += 1;
      if (r.b?.refundStatus === "refunded") acc.refundedCents += r.p.amountCents;
      return acc;
    },
    { succeededCount: 0, succeededCents: 0, failedCount: 0, abandonedCount: 0, refundedCents: 0 },
  );

  const fmt = (d: Date | null) => (d ? toShanghaiInput(new Date(d)).replace("T", " ") : "-");

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "交易查询" : "Transactions"}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {zh
              ? "每一条为一次支付通知（event_id 唯一，重复通知已幂等去重）。"
              : "Each row is one payment notification (event_id is unique; duplicates are idempotent)."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: zh ? "成功笔数" : "Succeeded", value: totals.succeededCount },
            { label: zh ? "成功金额" : "Succeeded amount", value: `¥${(totals.succeededCents / 100).toFixed(2)}` },
            { label: zh ? "失败 / 放弃" : "Failed / Abandoned", value: `${totals.failedCount} / ${totals.abandonedCount}` },
            { label: zh ? "已退款金额" : "Refunded amount", value: `¥${(totals.refundedCents / 100).toFixed(2)}` },
          ].map((c) => (
            <div key={c.label} className="card p-4">
              <div className="text-[12px] text-muted">{c.label}</div>
              <div className="mt-1 text-[22px] font-extrabold">{c.value}</div>
            </div>
          ))}
        </div>

        <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
          <div>
            <label className="label">{zh ? "关键词（流水号/订单号/邮箱/姓名）" : "Keyword"}</label>
            <input className="field !py-2 !text-[13px]" name="q" defaultValue={sp.q ?? ""} placeholder="ref / code / email" />
          </div>
          <div>
            <label className="label">{zh ? "状态" : "Status"}</label>
            <select className="field !py-2 !text-[13px]" name="status" defaultValue={sp.status ?? "all"}>
              <option value="all">{zh ? "全部" : "All"}</option>
              <option value="succeeded">{L("succeeded")}</option>
              <option value="failed">{L("failed")}</option>
              <option value="abandoned">{L("abandoned")}</option>
            </select>
          </div>
          <div>
            <label className="label">{zh ? "起始日期" : "From"}</label>
            <input className="field !py-2 !text-[13px]" type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <label className="label">{zh ? "结束日期" : "To"}</label>
            <input className="field !py-2 !text-[13px]" type="date" name="to" defaultValue={sp.to ?? ""} />
          </div>
          <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "查询" : "Filter"}</button>
          <Link href="/admin/transactions" className="btn btn-ghost !py-2 !text-[13px]">
            {zh ? "重置" : "Reset"}
          </Link>
        </form>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold">{zh ? "支付流水" : "Payment records"}</h2>
            <span className="text-[12px] text-muted">{zh ? `共 ${rows.length} 条` : `${rows.length} rows`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "时间（UTC+8）" : "Time (UTC+8)"}</th>
                  <th>{zh ? "订单号" : "Order"}</th>
                  <th>{zh ? "客户" : "Customer"}</th>
                  <th>{zh ? "场次" : "Session"}</th>
                  <th>{zh ? "渠道" : "Provider"}</th>
                  <th>{zh ? "流水号" : "Reference"}</th>
                  <th>{zh ? "金额" : "Amount"}</th>
                  <th>{zh ? "支付" : "Payment"}</th>
                  <th>{zh ? "退款" : "Refund"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-[13px] text-muted">
                      {zh ? "暂无交易" : "No transactions"}
                    </td>
                  </tr>
                ) : (
                  rows.map(({ p, b, s }) => (
                    <tr key={p.id}>
                      <td className="text-[12px]">{fmt(p.createdAt)}</td>
                      <td className="font-semibold">{b?.code ?? "-"}</td>
                      <td className="text-[12px]">
                        <div>{b?.customerName ?? "-"}</div>
                        <div className="text-muted">{b?.customerEmail ?? "-"}</div>
                      </td>
                      <td className="text-[12px]">{s ? fmt(s.startAt) : "-"}</td>
                      <td className="text-[12px]">{p.provider}</td>
                      <td className="font-mono text-[11px] text-muted">{p.providerRef}</td>
                      <td className="font-semibold">
                        ¥{(p.amountCents / 100).toFixed(2)} {p.currency}
                      </td>
                      <td>
                        <span className={p.status === "succeeded" ? "badge badge-green" : p.status === "failed" ? "badge badge-red" : "badge badge-slate"}>
                          {L(p.status)}
                        </span>
                      </td>
                      <td>
                        {b ? (
                          <span className={b.refundStatus === "refunded" ? "badge badge-green" : b.refundStatus === "requested" ? "badge badge-amber" : "badge badge-slate"}>
                            {L(b.refundStatus)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {b ? (
                            <Link className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/orders?q=${encodeURIComponent(b.code)}`}>
                              {zh ? "订单" : "Order"}
                            </Link>
                          ) : null}
                          {b && p.status === "succeeded" && b.refundStatus !== "refunded" ? (
                            <form action={markRefundedFromTxAction}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <button className="btn btn-ghost !px-2 !py-1 !text-[12px] !text-red-700">
                                {zh ? "标记已退" : "Mark refunded"}
                              </button>
                            </form>
                          ) : null}
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
