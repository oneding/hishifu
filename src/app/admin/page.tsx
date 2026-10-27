import { and, eq, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { bookings, classSessions, customers, emailLogs, payments } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { emailLive } from "@/lib/config";
import { releaseExpiredHolds } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await ensureAdmin();
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  void releaseExpiredHolds().catch(() => {});

  const db = await getDb();

  const sessions = await db.select().from(classSessions).orderBy(classSessions.startAt);
  const [{ confirmed } = { confirmed: 0 }] = await db
    .select({ confirmed: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.status, "confirmed"));
  const [{ pending } = { pending: 0 }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.status, "pending_payment"));
  const [{ refundPending } = { refundPending: 0 }] = await db
    .select({ refundPending: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.refundStatus, "requested")));
  const [{ mailFailed } = { mailFailed: 0 }] = await db
    .select({ mailFailed: sql<number>`count(*)::int` })
    .from(emailLogs)
    .where(ne(emailLogs.status, "sent"));

  const [{ customerCount } = { customerCount: 0 }] = await db
    .select({ customerCount: sql<number>`count(*)::int` })
    .from(customers);
  const [{ gmv } = { gmv: 0 }] = await db
    .select({ gmv: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'succeeded'), 0)::int` })
    .from(payments);
  const [{ txCount } = { txCount: 0 }] = await db
    .select({ txCount: sql<number>`count(*)::int` })
    .from(payments);

  const zh = locale === "zh";

  const cards = [
    { label: zh ? "已确认预约" : "Confirmed", value: confirmed, href: "/admin/orders?status=confirmed" },
    { label: zh ? "待付款" : "Awaiting payment", value: pending, href: "/admin/orders?status=pending_payment" },
    { label: zh ? "待处理退款" : "Refunds pending", value: refundPending, href: "/admin/orders?refund=requested" },
    { label: zh ? "邮件异常" : "Email issues", value: mailFailed, href: "/admin/emails" },
    { label: zh ? "客户数" : "Customers", value: customerCount, href: "/admin/users" },
    { label: zh ? "交易笔数" : "Transactions", value: txCount, href: "/admin/transactions" },
    { label: zh ? "成交金额" : "GMV", value: `${(gmv / 100).toFixed(0)}`, href: "/admin/transactions?status=succeeded" },
  ];

  const quick = [
    { href: "/admin/products", zh: "产品管理", en: "Products" },
    { href: "/admin/users", zh: "用户管理", en: "Users" },
    { href: "/admin/transactions", zh: "交易查询", en: "Transactions" },
    { href: "/admin/sessions", zh: "场次与名额", en: "Sessions" },
  ];

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "概览" : "Overview"}</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {zh ? "当前使用" : "Data source"}:{" "}
            {process.env.DATABASE_URL ? (zh ? "外部 Postgres" : "External Postgres") : zh ? "内置 PGlite（本地文件）" : "Embedded PGlite (local file)"} ·{" "}
            {zh ? "邮件" : "Email"}:{" "}
            {emailLive() ? (zh ? "Resend 已启用" : "Resend enabled") : zh ? "未配置 Key（仅记录日志）" : "No API key (logged only)"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className="card p-4 transition hover:border-accent/40">
              <div className="text-[12px] text-muted">{c.label}</div>
              <div className="mt-1 text-[26px] font-extrabold">{c.value}</div>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="btn btn-ghost !py-2 !text-[13px]">
              {zh ? q.zh : q.en} →
            </Link>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold">{zh ? "场次名额" : "Session capacity"}</h2>
            <Link href="/admin/sessions" className="text-[12px] text-accent underline">
              {zh ? "管理" : "Manage"}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "开始时间（UTC+8）" : "Start (UTC+8)"}</th>
                  <th>{zh ? "已确认" : "Confirmed"}</th>
                  <th>{zh ? "锁定中" : "Held"}</th>
                  <th>{zh ? "剩余" : "Left"}</th>
                  <th>{zh ? "上限" : "Capacity"}</th>
                  <th>{zh ? "状态" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const left = Math.max(0, s.capacity - s.seatsConfirmed - s.seatsHeld);
                  return (
                    <tr key={s.id}>
                      <td className="font-semibold">
                        {new Intl.DateTimeFormat("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(s.startAt)}
                      </td>
                      <td>{s.seatsConfirmed}</td>
                      <td>{s.seatsHeld}</td>
                      <td>
                        <span className={left === 0 ? "badge badge-red" : "badge badge-green"}>{left}</span>
                      </td>
                      <td>{s.capacity}</td>
                      <td>
                        <span className={s.status === "open" ? "badge badge-green" : "badge badge-slate"}>{s.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
