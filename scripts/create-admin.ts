/**
 * 创建/更新后台管理员账号（幂等）。
 *
 * 用法（需先配好 DATABASE_URL）：
 *   ADMIN_EMAIL=a@b.com ADMIN_PASSWORD=xxxx ADMIN_NAME=姓名 ADMIN_ROLE=owner npm run admin:create
 *
 * - 已存在该邮箱时：重置密码 / 更新姓名角色 / 强制激活（is_active=true, email_verified=true）
 * - 不存在时：新建；若库里还没有任何管理员，自动提升为 owner
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { admins } from "../src/db/schema";
import { hashPassword, isValidEmail, normalizeEmail } from "../src/lib/security";

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || "");
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME || "";
  const role = (process.env.ADMIN_ROLE || "admin") === "owner" ? "owner" : "admin";

  if (!isValidEmail(email)) throw new Error("ADMIN_EMAIL 不是合法邮箱");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD 至少 8 位");

  const db = await getDb();
  const hash = await hashPassword(password);
  const found = await db.select().from(admins).where(eq(admins.email, email)).limit(1);

  if (found[0]) {
    await db
      .update(admins)
      .set({
        passwordHash: hash,
        name: name || found[0].name || email.split("@")[0],
        role,
        isActive: true,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(admins.id, found[0].id));
    console.log(`[admin] updated  → ${email} (role=${role})`);
    return;
  }

  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(admins);
  await db.insert(admins).values({
    email,
    name: name || email.split("@")[0],
    passwordHash: hash,
    role: total === 0 ? "owner" : role,
    isActive: true,
    emailVerified: true,
  });
  console.log(`[admin] created  → ${email} (role=${total === 0 ? "owner" : role})`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("[admin] failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
