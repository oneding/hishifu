import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import { tokenForBooking } from "@/lib/booking";
import {
  adminResendLookupAction,
  cancelBookingFormAction,
  refundFormAction,
  resendEmailFormAction,
} from "../actions";
import { ResendLookupForm } from "../ResendLookupForm";

export const dynamic = "force-dynamic";

const STATUS_ZH: Record<string, string> = {
  pending_payment: "待付款",
  confirmed: "已确认",
  cancelled: "已取消",
  expired: "已失效",
  unpaid: "未付款",
  paid: "已付款",
  failed: "付款失败",
  refunded: "已退款",
  requested: "已申请",
  processing: "处理中",
  none: "无",
};
const STATUS_EN: Record<string, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
  unpaid: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  requested: "Requested",
  processing: "Processing",
  none: "None",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sessionId?: string; q?: string; date?: string }>;
}) {
  const admin = await ensureAdmin();
  const sp = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";
  const L = (k: string) => (zh ? STATUS_ZH[k] ?? k : STATUS_EN[k] ?? k);

  const db = await getDb();
  const conds = [];
  if (sp.status && sp.status !== "all") conds.push(eq(bookings.status, sp.status));
  if (sp.sessionId) conds.push(eq(bookings.sessionId, sp.sessionId));
  if (sp.q) {
    const like = `%${sp.q}%`;
    conds.push(
      or(
        sql`${bookings.code} ilike ${like}`,
        sql`${bookings.customerEmail} ilike ${like}`,
        sql`${bookings.customerName} ilike ${like}`,
      )!,
    );
  }
  if (sp.date) {
    const from = new Date(`${sp.date}T00:00:00+08:00`);
    const to = new Date(`${sp.date}T23:59:59+08:00`);
    conds.push(gte(bookings.createdAt, from), lte(bookings.createdAt, to));
  }

  const rows = await db
    .select({ b: bookings, s: classSessions })
    .from(bookings)
    .leftJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(300);

  const sessions = await db.select().from(classSessions).orderBy(classSessions.startAt);

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-4">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "订单管理" : "Orders"}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {zh ? "预约状态与退款状态分别记录；申请退款不等于退款成功。" : "Booking and refund states are tracked separately."}
          </p>
        </div>

        {/* 筛选 */}
        <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
          <div>
            <label className="label">{zh ? "关键词（编号/邮箱/姓名）" : "Keyword"}</label>
            <input className="field !py-2 !text-[13px]" name="q" defaultValue={sp.q ?? ""} placeholder="XYQ- / email / name" />
          </div>
          <div>
            <label className="label">{zh ? "状态" : "Status"}</label>
            <select className="field !py-2 !text-[13px]" name="status" defaultValue={sp.status ?? "all"}>
              <option value="all">{zh ? "全部" : "All"}</option>
              <option value="pending_payment">{L("pending_payment")}</option>
              <option value="confirmed">{L("confirmed")}</option>
              <option value="cancelled">{L("cancelled")}</option>
              <option value="expired">{L("expired")}</option>
            </select>
          </div>
          <div>
            <label className="label">{zh ? "场次" : "Session"}</label>
            <select className="field !py-2 !text-[13px]" name="sessionId" defaultValue={sp.sessionId ?? ""}>
              <option value="">{zh ? "全部" : "All"}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {toShanghaiInput(s.startAt).replace("T", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{zh ? "下单日期" : "Booked on"}</label>
            <input className="field !py-2 !text-[13px]" type="date" name="date" defaultValue={sp.date ?? ""} />
          </div>
          <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "查询" : "Filter"}</button>
          <Link href="/admin/orders" className="btn btn-ghost !py-2 !text-[13px]">
            {zh ? "重置" : "Reset"}
          </Link>
        </form>

        <div className="card p-4">
          <ResendLookupForm />
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "编号" : "Ref"}</th>
                  <th>{zh ? "场次（UTC+8）" : "Session (UTC+8)"}</th>
                  <th>{zh ? "姓名 / 邮箱" : "Name / Email"}</th>
                  <th>{zh ? "人数" : "Qty"}</th>
                  <th>{zh ? "金额" : "Amount"}</th>
                  <th>{zh ? "预约" : "Booking"}</th>
                  <th>{zh ? "付款" : "Payment"}</th>
                  <th>{zh ? "退款" : "Refund"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-[13px] text-muted">
                      {zh ? "暂无订单" : "No orders"}
                    </td>
                  </tr>
                ) : (
                  rows.map(({ b, s }) => {
                    const token = tokenForBooking(b);
                    return (
                      <tr key={b.id}>
                        <td className="font-semibold">{b.code}</td>
                        <td className="text-[12px]">{s ? toShanghaiInput(s.startAt).replace("T", " ") : "-"}</td>
                        <td className="text-[12px]">
                          <div className="font-semibold">{b.customerName}</div>
                          <div className="text-muted">{b.customerEmail}</div>
                        </td>
                        <td>{b.qty}</td>
                        <td className="font-semibold">
                          {(b.amountCents / 100).toFixed(0)} {b.currency}
                        </td>
                        <td>
                          <span className={b.status === "confirmed" ? "badge badge-green" : b.status === "pending_payment" ? "badge badge-amber" : "badge badge-slate"}>
                            {L(b.status)}
                          </span>
                        </td>
                        <td>
                          <span className={b.paymentStatus === "paid" ? "badge badge-green" : b.paymentStatus === "failed" ? "badge badge-red" : "badge badge-slate"}>
                            {L(b.paymentStatus)}
                          </span>
                        </td>
                        <td>
                          <span className={b.refundStatus === "refunded" ? "badge badge-green" : b.refundStatus === "requested" ? "badge badge-amber" : b.refundStatus === "failed" ? "badge badge-red" : "badge badge-slate"}>
                            {L(b.refundStatus)}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {token ? (
                              <a className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/o/${token}`} target="_blank">
                                {zh ? "详情" : "View"}
                              </a>
                            ) : null}

                            {b.status !== "cancelled" && b.status !== "expired" ? (
                              <form action={cancelBookingFormAction}>
                                <input type="hidden" name="bookingId" value={b.id} />
                                <button className="btn btn-ghost !px-2 !py-1 !text-[12px] !text-red-700">
                                  {zh ? "取消" : "Cancel"}
                                </button>
                              </form>
                            ) : null}

                            <form action={resendEmailFormAction}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <button className="btn btn-ghost !px-2 !py-1 !text-[12px]">
                                {zh ? "重发邮件" : "Resend"}
                              </button>
                            </form>

                            {b.refundStatus === "requested" ? (
                              <>
                                <form action={refundFormAction}>
                                  <input type="hidden" name="bookingId" value={b.id} />
                                  <input type="hidden" name="outcome" value="refunded" />
                                  <button className="btn btn-ghost !px-2 !py-1 !text-[12px] !text-emerald-700">
                                    {zh ? "标记已退" : "Mark refunded"}
                                  </button>
                                </form>
                                <form action={refundFormAction}>
                                  <input type="hidden" name="bookingId" value={b.id} />
                                  <input type="hidden" name="outcome" value="failed" />
                                  <button className="btn btn-ghost !px-2 !py-1 !text-[12px] !text-red-700">
                                    {zh ? "退款失败" : "Mark failed"}
                                  </button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
