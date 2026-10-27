import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { admins } from "@/db/schema";
import { audit, createSession } from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 后台登录（JSON 版）。
 * 页面表单走 Server Action；此接口供脚本化验收 / 自动化巡检使用。
 * 返回 httpOnly cookie，后续请求带上即可访问 /admin/*。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "missing_credentials" }, { status: 400 });
  }

  const db = await getDb();
  const admin = (await db.select().from(admins).where(eq(admins.email, email)).limit(1))[0];
  if (!admin || !admin.isActive || !(await verifyPassword(password, admin.passwordHash))) {
    await audit({ adminEmail: email, action: "admin.login_failed" });
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  await createSession(admin.id);
  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
  await audit({ adminId: admin.id, adminEmail: admin.email, action: "admin.login" });

  return NextResponse.json({ ok: true, email: admin.email, role: admin.role });
}
