import { asc, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { bookings, classSessions, courseTranslations, courses } from "@/db/schema";
import { AdminShell } from "@/components/AdminShell";
import { ensureAdmin } from "@/lib/admin-guard";
import { normalizeLocale } from "@/i18n/messages";
import { labelLanguages } from "@/lib/format";
import { deleteProductAction, saveProductAction, setProductStatusAction } from "../manage-actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; new?: string }>;
}) {
  const admin = await ensureAdmin();
  const sp = await searchParams;
  const jar = await cookies();
  const locale = normalizeLocale(jar.get("xy_locale")?.value);
  const zh = locale === "zh";

  const db = await getDb();
  const list = await db.select().from(courses).orderBy(asc(courses.createdAt));
  const trs = await db
    .select()
    .from(courseTranslations)
    .where(inArray(courseTranslations.locale, ["zh", "en"]));

  const sessAgg = await db
    .select({
      courseId: classSessions.courseId,
      count: sql<number>`count(*)::int`,
      seats: sql<number>`coalesce(sum(${classSessions.seatsConfirmed}), 0)::int`,
      minPrice: sql<number>`coalesce(min(${classSessions.priceCents}), 0)::int`,
    })
    .from(classSessions)
    .groupBy(classSessions.courseId);

  const soldAgg = await db
    .select({
      courseId: bookings.courseId,
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${bookings.amountCents}) filter (where ${bookings.paymentStatus} = 'paid'), 0)::int`,
    })
    .from(bookings)
    .groupBy(bookings.courseId);

  const sessMap = new Map(sessAgg.map((s) => [s.courseId, s]));
  const soldMap = new Map(soldAgg.map((s) => [s.courseId, s]));

  const titleOf = (courseId: string, l: string) =>
    trs.find((t) => t.courseId === courseId && t.locale === l)?.title ?? "";

  const editing = sp.id
    ? list.find((c) => c.id === sp.id) ?? null
    : sp.new === "1"
      ? null
      : list[0] ?? null;
  const showForm = Boolean(sp.new === "1" || sp.id);

  const etr = editing
    ? {
        zh: {
          title: titleOf(editing.id, "zh"),
          summary: trs.find((t) => t.courseId === editing.id && t.locale === "zh")?.summary ?? "",
          description: trs.find((t) => t.courseId === editing.id && t.locale === "zh")?.description ?? "",
        },
        en: {
          title: titleOf(editing.id, "en"),
          summary: trs.find((t) => t.courseId === editing.id && t.locale === "en")?.summary ?? "",
          description: trs.find((t) => t.courseId === editing.id && t.locale === "en")?.description ?? "",
        },
      }
    : null;

  return (
    <AdminShell initialLocale={locale} email={admin.email}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-extrabold">{zh ? "产品管理" : "Products"}</h1>
            <p className="mt-1 text-[12px] text-muted">
              {zh
                ? "产品即对外售卖的体验课；下架后前台不可见，有场次的产品不能删除。"
                : "A product is a sellable class. Archived ones are hidden; products with sessions cannot be deleted."}
            </p>
          </div>
          <Link href="/admin/products?new=1" className="btn btn-primary !py-2 !text-[13px]">
            {zh ? "新建产品" : "New product"}
          </Link>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{zh ? "产品" : "Product"}</th>
                  <th>{zh ? "标识" : "Slug"}</th>
                  <th>{zh ? "标价" : "List price"}</th>
                  <th>{zh ? "时长" : "Duration"}</th>
                  <th>{zh ? "授课语言" : "Languages"}</th>
                  <th>{zh ? "场次" : "Sessions"}</th>
                  <th>{zh ? "已确认" : "Booked"}</th>
                  <th>{zh ? "成交额" : "Revenue"}</th>
                  <th>{zh ? "状态" : "Status"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-[13px] text-muted">
                      {zh ? "暂无产品" : "No products"}
                    </td>
                  </tr>
                ) : (
                  list.map((c) => {
                    const s = sessMap.get(c.id);
                    const b = soldMap.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td className="text-[12px]">
                          <div className="font-semibold">{titleOf(c.id, "zh") || "-"}</div>
                          <div className="text-muted">{titleOf(c.id, "en")}</div>
                        </td>
                        <td className="font-mono text-[11px] text-muted">{c.slug}</td>
                        <td className="font-semibold">
                          {((c.basePriceCents || s?.minPrice || 0) / 100).toFixed(0)} CNY
                        </td>
                        <td>{c.durationMinutes} min</td>
                        <td className="text-[12px]">{labelLanguages(c.taughtLanguages as string[] | null, locale)}</td>
                        <td>{s?.count ?? 0}</td>
                        <td>{s?.seats ?? 0}</td>
                        <td className="font-semibold">{((b?.revenue ?? 0) / 100).toFixed(0)}</td>
                        <td>
                          <span
                            className={
                              c.status === "published"
                                ? "badge badge-green"
                                : c.status === "draft"
                                  ? "badge badge-amber"
                                  : "badge badge-slate"
                            }
                          >
                            {c.status === "published" ? (zh ? "已上架" : "Published") : c.status === "draft" ? (zh ? "草稿" : "Draft") : zh ? "已下架" : "Archived"}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Link className="btn btn-ghost !px-2 !py-1 !text-[12px]" href={`/admin/products?id=${c.id}`}>
                              {zh ? "编辑" : "Edit"}
                            </Link>
                            <form action={setProductStatusAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="status" value={c.status === "published" ? "archived" : "published"} />
                              <button className="btn btn-ghost !px-2 !py-1 !text-[12px]">
                                {c.status === "published" ? (zh ? "下架" : "Archive") : zh ? "上架" : "Publish"}
                              </button>
                            </form>
                            {!s?.count ? (
                              <form action={deleteProductAction}>
                                <input type="hidden" name="id" value={c.id} />
                                <button className="btn btn-ghost !px-2 !py-1 !text-[12px] !text-red-700">
                                  {zh ? "删除" : "Delete"}
                                </button>
                              </form>
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

        {showForm ? (
          <form action={saveProductAction} className="card space-y-4 p-4">
            <div className="text-[15px] font-bold">
              {editing ? (zh ? "编辑产品" : "Edit product") : zh ? "新建产品" : "New product"}
            </div>
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{zh ? "标识 slug" : "Slug"}</label>
                <input className="field !py-2 !text-[13px]" name="slug" defaultValue={editing?.slug ?? ""} placeholder="xinyi-intro" required />
              </div>
              <div>
                <label className="label">{zh ? "标价（元）" : "List price (CNY)"}</label>
                <input
                  className="field !py-2 !text-[13px]"
                  name="basePriceCents"
                  type="number"
                  min={0}
                  defaultValue={((editing?.basePriceCents ?? 0) / 100).toFixed(0)}
                />
              </div>
              <div>
                <label className="label">{zh ? "时长（分钟）" : "Duration (min)"}</label>
                <input className="field !py-2 !text-[13px]" name="durationMinutes" type="number" min={1} defaultValue={editing?.durationMinutes ?? 90} />
              </div>
              <div>
                <label className="label">{zh ? "授课语言（逗号分隔）" : "Languages (comma)"}</label>
                <input className="field !py-2 !text-[13px]" name="taughtLanguages" defaultValue={(editing?.taughtLanguages as string[] | null)?.join(",") ?? "zh,en"} />
              </div>
              <div>
                <label className="label">{zh ? "状态" : "Status"}</label>
                <select className="field !py-2 !text-[13px]" name="status" defaultValue={editing?.status ?? "draft"}>
                  <option value="draft">{zh ? "草稿" : "Draft"}</option>
                  <option value="published">{zh ? "已上架" : "Published"}</option>
                  <option value="archived">{zh ? "已下架" : "Archived"}</option>
                </select>
              </div>
              <div>
                <label className="label">{zh ? "封面图 URL" : "Cover image URL"}</label>
                <input className="field !py-2 !text-[13px]" name="imageUrl" defaultValue={editing?.imageUrl ?? ""} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-line p-3">
                <div className="text-[13px] font-bold">中文</div>
                <div>
                  <label className="label">{zh ? "标题" : "Title"}</label>
                  <input className="field !py-2 !text-[13px]" name="zh_title" defaultValue={etr?.zh.title ?? ""} required />
                </div>
                <div>
                  <label className="label">{zh ? "简介" : "Summary"}</label>
                  <textarea className="field !py-2 !text-[13px]" name="zh_summary" rows={2} defaultValue={etr?.zh.summary ?? ""} />
                </div>
                <div>
                  <label className="label">{zh ? "详情" : "Description"}</label>
                  <textarea className="field !py-2 !text-[13px]" name="zh_description" rows={4} defaultValue={etr?.zh.description ?? ""} />
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-line p-3">
                <div className="text-[13px] font-bold">English</div>
                <div>
                  <label className="label">Title</label>
                  <input className="field !py-2 !text-[13px]" name="en_title" defaultValue={etr?.en.title ?? ""} />
                </div>
                <div>
                  <label className="label">Summary</label>
                  <textarea className="field !py-2 !text-[13px]" name="en_summary" rows={2} defaultValue={etr?.en.summary ?? ""} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="field !py-2 !text-[13px]" name="en_description" rows={4} defaultValue={etr?.en.description ?? ""} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary !py-2 !text-[13px]">{zh ? "保存" : "Save"}</button>
              <Link href="/admin/products" className="btn btn-ghost !py-2 !text-[13px]">
                {zh ? "收起" : "Close"}
              </Link>
              {editing ? (
                <Link href={`/admin/course`} className="text-[12px] text-accent underline">
                  {zh ? "编辑详情页文案与场地 →" : "Edit page copy & venue →"}
                </Link>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </AdminShell>
  );
}
