import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { ensureAdmin } from "@/lib/admin-guard";
import { toShanghaiInput } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 按场次导出报名名单（现场接待用），UTF-8 BOM 保证 Excel 中文不乱码 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureAdmin();
  const { id } = await params;
  const db = await getDb();

  const session = (await db.select().from(classSessions).where(eq(classSessions.id, id)).limit(1))[0];
  if (!session) return new Response("session not found", { status: 404 });

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, id), inArray(bookings.status, ["confirmed", "pending_payment"])));

  const header = ["订单编号", "姓名", "邮箱", "人数", "预约状态", "付款状态", "邮件语言", "下单时间(UTC+8)"];
  const lines = rows.map((b) =>
    [
      b.code,
      b.customerName,
      b.customerEmail,
      String(b.qty),
      b.status,
      b.paymentStatus,
      b.locale,
      toShanghaiInput(b.createdAt).replace("T", " "),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );

  const csv = "\uFEFF" + [header.join(","), ...lines].join("\r\n");
  const start = toShanghaiInput(session.startAt).replace("T", "_").replace(":", "");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="roster_${start}.csv"`,
    },
  });
}
