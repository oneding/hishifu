"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import {
  admins,
  bookings,
  classSessions,
  courseTranslations,
  courses,
  customers,
} from "@/db/schema";
import { audit, requireAdmin } from "@/lib/auth";
import { hashPassword, isValidEmail, normalizeEmail, verifyPassword } from "@/lib/security";
import type { ActionState } from "./actions";
import type { Locale } from "@/i18n/messages";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

async function clientIp() {
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
}

/** 当前登录管理员修改自己的密码 */
export async function changeMyPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const zh = str(fd, "locale") !== "en";
  if (next.length < 8) return { error: zh ? "新密码至少 8 位" : "New password must be at least 8 characters" };

  const db = await getDb();
  const row = await db.select().from(admins).where(eq(admins.id, admin.id)).limit(1);
  if (!row[0] || !(await verifyPassword(current, row[0].passwordHash))) {
    return { error: zh ? "当前密码不正确" : "Current password is incorrect" };
  }
  await db
    .update(admins)
    .set({ passwordHash: await hashPassword(next), updatedAt: new Date() })
    .where(eq(admins.id, admin.id));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "admin.change_password",
    targetType: "admin",
    targetId: admin.id,
    ip: await clientIp(),
  });
  return { message: zh ? "密码已更新" : "Password updated" };
}

/* ============================== 客户（用户） ============================== */

/** 按邮箱创建/更新客户档案（不存在则建档） */
async function upsertCustomerByEmail(
  email: string,
  patch: Partial<{ name: string; phone: string; note: string; isBlocked: boolean; locale: Locale }>,
) {
  const key = normalizeEmail(email);
  const db = await getDb();
  const found = await db.select().from(customers).where(eq(customers.email, key)).limit(1);
  if (found[0]) {
    await db
      .update(customers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customers.id, found[0].id));
    return found[0].id;
  }
  const created = await db
    .insert(customers)
    .values({
      email: key,
      name: patch.name ?? "",
      phone: patch.phone ?? "",
      note: patch.note ?? "",
      isBlocked: patch.isBlocked ?? false,
      locale: patch.locale ?? "zh",
    })
    .returning({ id: customers.id });
  return created[0].id;
}

export async function setCustomerBlockedAction(fd: FormData) {
  const admin = await requireAdmin();
  const email = str(fd, "email");
  const blocked = str(fd, "blocked") === "1";
  if (!email) return;
  const id = await upsertCustomerByEmail(email, { isBlocked: blocked });
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: blocked ? "customer.block" : "customer.unblock",
    targetType: "customer",
    targetId: id,
    detail: { email },
    ip: await clientIp(),
  });
  revalidatePath("/admin/users");
}

export async function saveCustomerAction(fd: FormData) {
  const admin = await requireAdmin();
  const email = str(fd, "email");
  if (!email) return;
  const id = await upsertCustomerByEmail(email, {
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    note: str(fd, "note"),
  });
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "customer.update",
    targetType: "customer",
    targetId: id,
    detail: { email },
    ip: await clientIp(),
  });
  revalidatePath("/admin/users");
}

/* ============================== 管理员账号 ============================== */

export async function setAdminActiveAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const active = str(fd, "active") === "1";
  if (!id || id === admin.id) return; // 不允许停用自己
  const db = await getDb();
  await db.update(admins).set({ isActive: active, updatedAt: new Date() }).where(eq(admins.id, id));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: active ? "admin.activate" : "admin.deactivate",
    targetType: "admin",
    targetId: id,
    ip: await clientIp(),
  });
  revalidatePath("/admin/users");
}

export async function setAdminRoleAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const role = str(fd, "role") === "owner" ? "owner" : "admin";
  if (!id) return;
  const db = await getDb();
  await db.update(admins).set({ role, updatedAt: new Date() }).where(eq(admins.id, id));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "admin.role",
    targetType: "admin",
    targetId: id,
    detail: { role },
    ip: await clientIp(),
  });
  revalidatePath("/admin/users");
}

export async function createAdminAction(fd: FormData) {
  const admin = await requireAdmin();
  const email = normalizeEmail(str(fd, "email"));
  const password = String(fd.get("password") ?? "");
  const name = str(fd, "name");
  if (!isValidEmail(email) || password.length < 8) return;

  const db = await getDb();
  const exists = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  if (exists[0]) return;

  await db.insert(admins).values({
    email,
    name: name || email.split("@")[0],
    passwordHash: await hashPassword(password),
    role: "admin",
    emailVerified: true, // 后台直接建号，免邮件激活
    isActive: true,
  });
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "admin.create",
    targetType: "admin",
    detail: { email },
    ip: await clientIp(),
  });
  revalidatePath("/admin/users");
}

/* ============================== 产品 ============================== */

export async function saveProductAction(fd: FormData) {
  const admin = await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const slug = str(fd, "slug") || `class-${Date.now().toString(36)}`;
  const base = {
    slug,
    status: str(fd, "status") || "draft",
    basePriceCents: Math.max(0, Math.round(Number(str(fd, "basePriceCents")) || 0)),
    durationMinutes: Math.max(1, Math.round(Number(str(fd, "durationMinutes")) || 90)),
    taughtLanguages: str(fd, "taughtLanguages")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    imageUrl: str(fd, "imageUrl") || null,
    updatedAt: new Date(),
  };

  let courseId = id;
  if (id) {
    await db.update(courses).set(base).where(eq(courses.id, id));
  } else {
    const created = await db.insert(courses).values(base).returning({ id: courses.id });
    courseId = created[0].id;
  }

  for (const locale of ["zh", "en"] as const) {
    const values = {
      title: str(fd, `${locale}_title`),
      summary: str(fd, `${locale}_summary`),
      description: str(fd, `${locale}_description`),
    };
    const found = await db
      .select()
      .from(courseTranslations)
      .where(and(eq(courseTranslations.courseId, courseId), eq(courseTranslations.locale, locale)))
      .limit(1);
    if (found[0]) {
      const patch: Record<string, string> = { title: values.title };
      if (values.summary) patch.summary = values.summary;
      if (values.description) patch.description = values.description;
      await db.update(courseTranslations).set(patch).where(eq(courseTranslations.id, found[0].id));
    } else {
      await db.insert(courseTranslations).values({ courseId, locale, ...values });
    }
  }

  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: id ? "product.update" : "product.create",
    targetType: "course",
    targetId: courseId,
    ip: await clientIp(),
  });
  revalidatePath("/admin/products");
}

export async function setProductStatusAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !["draft", "published", "archived"].includes(status)) return;
  const db = await getDb();
  await db.update(courses).set({ status, updatedAt: new Date() }).where(eq(courses.id, id));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "product.status",
    targetType: "course",
    targetId: id,
    detail: { status },
    ip: await clientIp(),
  });
  revalidatePath("/admin/products");
}

export async function deleteProductAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const db = await getDb();
  const used = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(classSessions)
    .where(eq(classSessions.courseId, id));
  if ((used[0]?.c ?? 0) > 0) return; // 有场次的产品不允许删除，先下架
  await db.delete(courseTranslations).where(eq(courseTranslations.courseId, id));
  await db.delete(courses).where(eq(courses.id, id));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "product.delete",
    targetType: "course",
    targetId: id,
    ip: await clientIp(),
  });
  revalidatePath("/admin/products");
}

/** 交易页：把某笔成功支付标记为已退款（写入订单退款状态，仅记录用） */
export async function markRefundedFromTxAction(fd: FormData) {
  const admin = await requireAdmin();
  const bookingId = str(fd, "bookingId");
  if (!bookingId) return;
  const db = await getDb();
  await db
    .update(bookings)
    .set({ refundStatus: "refunded", refundedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  await audit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: "transaction.mark_refunded",
    targetType: "booking",
    targetId: bookingId,
    ip: await clientIp(),
  });
  revalidatePath("/admin/transactions");
}
