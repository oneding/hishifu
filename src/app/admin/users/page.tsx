import { desc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { admins, bookings, customers } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { toShanghaiInput } from "@/lib/format";
import {
  createAdminAction,
  saveCustomerAction,
  setAdminActiveAction,
  setAdminRoleAction,
  setCustomerBlockedAction,
} from "../manage-actions";

export const dynamic = "force-dynamic";

type Row = {
  email: string;
  name: string;
  phone: string;
  note: string;
  isBlocked: boolean;
  profileId: string | null;
  orderCount: number;
  paidCount: number;
  paidCents: number;
  lastBookingAt: Date | null;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; edit?: string }>;
}) {
  const admin = await ensureAdmin();
  const sp = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";

  const db = await getDb();

  // 1) 订单侧聚合（历史订单里出现过但未建档的邮箱也能看到）
  const agg = await db
    .select({
      email: bookings.customerEmail,
      name: sql<string>`max(${bookings.customerName})`,
      orderCount: sql<number>`count(*)::int`,
      paidCount: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'paid')::int`,
      paidCents: sql<number>`coalesce(sum(${bookings.amountCents}) filter (where ${bookings.paymentStatus} = 'paid'), 0)::int`,
      lastBookingAt: sql<Date | null>`max(${bookings.createdAt})`,
    })
    .from(bookings)
    .groupBy(bookings.customerEmail);

  // 2) 客户档案
  const profiles = await db.select().from(customers);

  const map = new Map<string, Row>();
  for (const a of agg) {
    map.set(a.email, {
      email: a.email,
      name: a.name ?? "",
      phone: "",
      note: "",
      isBlocked: false,
      profileId: null,
      orderCount: a.orderCount,
      paidCount: a.paidCount,
      paidCents: a.paidCents,
      lastBookingAt: a.lastBookingAt,
    });
  }
  for (const p of profiles) {
    const cur = map.get(p.email);
    if (cur) {
      cur.profileId = p.id;
      cur.phone = p.phone;
      cur.note = p.note;
      cur.isBlocked = p.isBlocked;
      if (!cur.name) cur.name = p.name;
    } else {
      map.set(p.email, {
        email: p.email,
        name: p.name,
        phone: p.phone,
        note: p.note,
        isBlocked: p.isBlocked,
        profileId: p.id,
        orderCount: 0,
        paidCount: 0,
        paidCents: 0,
        lastBookingAt: null,
      });
    }
  }

  let rows = [...map.values()];
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.phone.includes(q));
  }
  if (sp.state === "blocked") rows = rows.filter((r) => r.isBlocked);
  if (sp.state === "active") rows = rows.filter((r) => !r.isBlocked);
  rows.sort((a, b) => (b.lastBookingAt?.getTime() ?? 0) - (a.lastBookingAt?.getTime() ?? 0));

  const adminRows = await db.select().from(admins).orderBy(desc(admins.createdAt));

  const editing = sp.edit ? rows.find((r) => r.email === sp.edit) ?? null : null;

  const totalCustomers = map.size;
  const blockedCount = [...map.values()].filter((r) => r.isBlocked).length;
  const paidCustomers = [...map.values()].filter((r) => r.paidCount > 0).length;
  const gmv = [...map.values()].reduce((s, r) => s + r.paidCents, 0);

  const fmt = (d: Date | null) =>
    d ? toShanghaiInput(new Date(d)).replace("T", " ") : "-";

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-5">
        <div>
          <h1 className="text-[20px] font-extrabold">{zh ? "用户管理" : "Users"}</h1>
          <p className="mt-1 text-[12px] text-muted">
            {zh
              ? "客户以下单邮箱为唯一标识；列入黑名单后该邮箱无法再下单。管理员账号可单独启用/停用。"
              : "Customers are keyed by email; blocked emails cannot book. Admin accounts are managed separately."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: zh ? "客户总数" : "Customers", value: totalCustomers },
            { label: zh ? "已付款客户" : "Paying customers", value: paidCustomers },
            { label: zh ? "黑名单" : "Blocked", value: blockedCount },
            {
              label: zh ? "累计成交额" : "Gross revenue",
              value: `${(gmv / 100).toFixed(0)} ${zh ? "元" : "CNY"}`,
            },
          ].map((c) => (
            <div key={c.label} className="card p-4">
              <div className="text-[12px] text-muted">{c.label}</div>
              <div className="mt-1 text-[22px] font-extrabold">{c.value}</div>
            </div>
          ))}
        </div>

        {/* 筛选 */}
        <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
          <div>
            <label className="label">{zh ? "关键词（邮箱/姓名/电话）" : "Keyword"}</label>
            <input className="field !py-2 !text-[13px]" name="q" defaultValue={sp.q ?? ""} placeholder="email / name / phone" />
          </div>
          <div>
            <label className="label">{zh ? "状态" : "State"}</label>
            <select className="field !py-2 !text-[13px]" name="state" defaultValue={sp.state ?? "all"}>
              <option value="all">{zh ? "全部" : "All"}</option>
              <option value="active">{zh ? "正常" : "Active"}</option>
              <option value="blocked">{zh ? "黑名单" : "Blocked"}</option>
            </select>
          </div>
          <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "查询" : "Filter"}</button>
          <Link href="/admin/users" className="btn btn-ghost !py-2 !text-[13px]">
            {zh ? "重置" : "Reset"}
          </Link>
        </form>

        {editing ? (
          <form action={saveCustomerAction} className="card space-y-3 p-4">
            <div className="text-[14px] font-bold">
              {zh ? "编辑客户" : "Edit customer"} · {editing.email}
            </div>
            <input type="hidden" name="email" value={editing.email} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{zh ? "姓名" : "Name"}</label>
                <input className="field !py-2 !text-[13px]" name="name" defaultValue={editing.name} />
              </div>
              <div>
                <label className="label">{zh ? "电话" : "Phone"}</label>
                <input className="field !py-2 !text-[13px]" name="phone" defaultValue={editing.phone} />
              </div>
              <div>
                <label className="label">{zh ? "备注" : "Note"}</label>
                <input className="field !py-2 !text-[13px]" name="note" defaultValue={editing.note} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "保存" : "Save"}</button>
              <Link href="/admin/users" className="btn btn-ghost !py-2 !text-[13px]">
                {zh ? "取消" : "Cancel"}
              </Link>
            </div>
          </form>
        ) : null}

        {/* 客户列表 */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold">{zh ? "客户" : "Customers"}</h2>
            <span className="text-[12px] text-muted">
              {zh ? `共 ${rows.length} 条` : `${rows.length} rows`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "邮箱" : "Email"}</th>
                  <th>{zh ? "姓名 / 电话" : "Name / Phone"}</th>
                  <th>{zh ? "订单" : "Orders"}</th>
                  <th>{zh ? "已付" : "Paid"}</th>
                  <th>{zh ? "累计消费" : "Spend"}</th>
                  <th>{zh ? "最近下单（UTC+8）" : "Last booking (UTC+8)"}</th>
                  <th>{zh ? "状态" : "State"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-[13px] text-muted">
                      {zh ? "暂无客户" : "No customers"}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.email}>
                      <td className="text-[12px]">
                        <div className="font-semibold">{r.email}</div>
                        {r.note ? <div className="text-muted">{r.note}</div> : null}
                      </td>
                      <td className="text-[12px]">
                        <div>{r.name || "-"}</div>
                        <div className="text-muted">{r.phone || "-"}</div>
                      </td>
                      <td>{r.orderCount}</td>
                      <td>{r.paidCount}</td>
                      <td className="font-semibold">{(r.paidCents / 100).toFixed(0)}</td>
                      <td className="text-[12px]">{fmt(r.lastBookingAt)}</td>
                      <td>
                        <span className={r.isBlocked ? "badge badge-red" : "badge badge-green"}>
                          {r.isBlocked ? (zh ? "黑名单" : "Blocked") : zh ? "正常" : "Active"}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Link className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/users?edit=${encodeURIComponent(r.email)}`}>
                            {zh ? "编辑" : "Edit"}
                          </Link>
                          <Link className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/orders?q=${encodeURIComponent(r.email)}`}>
                            {zh ? "订单" : "Orders"}
                          </Link>
                          <form action={setCustomerBlockedAction}>
                            <input type="hidden" name="email" value={r.email} />
                            <input type="hidden" name="blocked" value={r.isBlocked ? "0" : "1"} />
                            <button className={`btn btn-ghost !px-2 !py-1 !text-[12px] ${r.isBlocked ? "!text-emerald-700" : "!text-red-700"}`}>
                              {r.isBlocked ? (zh ? "解除黑名单" : "Unblock") : zh ? "拉黑" : "Block"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 管理员账号 */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold">{zh ? "管理员账号" : "Admin accounts"}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "邮箱" : "Email"}</th>
                  <th>{zh ? "姓名" : "Name"}</th>
                  <th>{zh ? "角色" : "Role"}</th>
                  <th>{zh ? "最后登录（UTC+8）" : "Last login (UTC+8)"}</th>
                  <th>{zh ? "邮箱验证" : "Verified"}</th>
                  <th>{zh ? "状态" : "State"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {adminRows.map((a) => (
                  <tr key={a.id}>
                    <td className="text-[12px] font-semibold">
                      {a.email}
                      {a.id === admin.id ? <span className="ml-1 text-[11px] text-accent">{zh ? "（当前）" : "(you)"}</span> : null}
                    </td>
                    <td className="text-[12px]">{a.name || "-"}</td>
                    <td>
                      <span className={a.role === "owner" ? "badge badge-amber" : "badge badge-slate"}>{a.role}</span>
                    </td>
                    <td className="text-[12px]">{fmt(a.lastLoginAt)}</td>
                    <td>
                      <span className={a.emailVerified ? "badge badge-green" : "badge badge-slate"}>
                        {a.emailVerified ? (zh ? "已验证" : "Yes") : zh ? "未验证" : "No"}
                      </span>
                    </td>
                    <td>
                      <span className={a.isActive ? "badge badge-green" : "badge badge-red"}>
                        {a.isActive ? (zh ? "启用" : "Active") : zh ? "停用" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {a.id === admin.id ? (
                          <span className="text-[12px] text-muted">{zh ? "—" : "—"}</span>
                        ) : (
                          <>
                            <form action={setAdminActiveAction}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="active" value={a.isActive ? "0" : "1"} />
                              <button className={`btn btn-ghost !px-2 !py-1 !text-[12px] ${a.isActive ? "!text-red-700" : "!text-emerald-700"}`}>
                                {a.isActive ? (zh ? "停用" : "Disable") : zh ? "启用" : "Enable"}
                              </button>
                            </form>
                            <form action={setAdminRoleAction}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="role" value={a.role === "owner" ? "admin" : "owner"} />
                              <button className="btn btn-ghost !px-2 !py-1 !text-[12px]">
                                {a.role === "owner" ? (zh ? "降为 admin" : "Demote") : zh ? "升为 owner" : "Promote"}
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form action={createAdminAction} className="card space-y-3 p-4">
          <div className="text-[14px] font-bold">{zh ? "新增管理员" : "Add admin"}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">{zh ? "邮箱" : "Email"}</label>
              <input className="field !py-2 !text-[13px]" name="email" type="email" required placeholder="name@example.com" />
            </div>
            <div>
              <label className="label">{zh ? "姓名" : "Name"}</label>
              <input className="field !py-2 !text-[13px]" name="name" />
            </div>
            <div>
              <label className="label">{zh ? "初始密码（≥8 位）" : "Password (≥8)"}</label>
              <input className="field !py-2 !text-[13px]" name="password" type="password" minLength={8} required />
            </div>
          </div>
          <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "创建" : "Create"}</button>
          <p className="text-[12px] text-muted">
            {zh ? "后台直接建号无需邮件激活，创建后即可登录，请通过安全渠道告知初始密码。" : "Created accounts are pre-verified and can sign in immediately — share the password securely."}
          </p>
        </form>
      </div>
    </AdminShell>
  );
}
