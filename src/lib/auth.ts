import { and, eq, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { adminSessions, admins, auditLogs, emailTokens } from "@/db/schema";
import { randomToken, randomCode, sha256Hex } from "./security";

export const ADMIN_COOKIE = "xy_admin";
const SESSION_DAYS = 7;

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
};

/* ----------------------------- 会话 ----------------------------- */

/**
 * 是否给会话 cookie 加 Secure。
 * 按**实际访问协议**判断（Nginx 会回写 X-Forwarded-Proto），而不是只看 NODE_ENV：
 * 否则在生产模式下用内网 http 访问时，Secure cookie 会被客户端直接丢弃，导致后台一直登不进去。
 */
async function isHttpsRequest(): Promise<boolean> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
    if (proto) return proto === "https";
  } catch {
    /* 非请求上下文（脚本、定时任务）时忽略 */
  }
  return process.env.NODE_ENV === "production";
}

export async function createSession(adminId: string, ip?: string, ua?: string): Promise<string> {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(adminSessions).values({
    adminId,
    tokenHash: sha256Hex(token),
    expiresAt,
    ip: ip ?? null,
    userAgent: ua ?? null,
  });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttpsRequest(),
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function currentAdmin(): Promise<AdminUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(ADMIN_COOKIE)?.value;
    if (!token) return null;
    const db = await getDb();
    const rows = await db
      .select({
        id: admins.id,
        email: admins.email,
        name: admins.name,
        role: admins.role,
        emailVerified: admins.emailVerified,
        isActive: admins.isActive,
        expiresAt: adminSessions.expiresAt,
      })
      .from(adminSessions)
      .innerJoin(admins, eq(admins.id, adminSessions.adminId))
      .where(
        and(
          eq(adminSessions.tokenHash, sha256Hex(token)),
          isNull(adminSessions.revokedAt),
        ),
      )
      .limit(1);

    const r = rows[0];
    if (!r || !r.isActive) return null;
    if (new Date(r.expiresAt).getTime() < Date.now()) return null;
    return { id: r.id, email: r.email, name: r.name, role: r.role, emailVerified: r.emailVerified };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.tokenHash, sha256Hex(token)));
  }
  jar.delete(ADMIN_COOKIE);
}

/* --------------------------- 邮件令牌 --------------------------- */

export async function issueEmailToken(opts: {
  email: string;
  purpose: "verify_email" | "reset_password" | "login_code";
  ttlMinutes: number;
  adminId?: string | null;
  withCode?: boolean;
}): Promise<{ token: string; code?: string; expiresAt: Date }> {
  const db = await getDb();
  // 同邮箱同用途的旧令牌作废，避免多链接并存
  await db
    .update(emailTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(emailTokens.email, opts.email), eq(emailTokens.purpose, opts.purpose), isNull(emailTokens.consumedAt)),
    );

  const token = randomToken(32);
  const code = opts.withCode ? randomCode(6) : undefined;
  const expiresAt = new Date(Date.now() + opts.ttlMinutes * 60_000);

  await db.insert(emailTokens).values({
    email: opts.email,
    adminId: opts.adminId ?? null,
    purpose: opts.purpose,
    tokenHash: sha256Hex(token),
    codeHash: code ? sha256Hex(`${opts.email}:${code}`) : null,
    expiresAt,
  });

  return { token, code, expiresAt };
}

export async function consumeEmailToken(token: string, purpose: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256Hex(token)), eq(emailTokens.purpose, purpose)))
    .limit(1);
  if (!row) return { ok: false as const, reason: "invalid" };
  if (row.consumedAt) return { ok: false as const, reason: "used" };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false as const, reason: "expired" };
  await db.update(emailTokens).set({ consumedAt: new Date() }).where(eq(emailTokens.id, row.id));
  return { ok: true as const, email: row.email, adminId: row.adminId };
}

export async function consumeEmailCode(email: string, code: string, purpose: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.email, email),
        eq(emailTokens.purpose, purpose),
        eq(emailTokens.codeHash, sha256Hex(`${email}:${code}`)),
      ),
    )
    .limit(1);
  if (!row) return { ok: false as const, reason: "invalid" };
  if (row.consumedAt) return { ok: false as const, reason: "used" };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false as const, reason: "expired" };
  await db.update(emailTokens).set({ consumedAt: new Date() }).where(eq(emailTokens.id, row.id));
  return { ok: true as const, email: row.email, adminId: row.adminId };
}

/* ----------------------------- 审计 ----------------------------- */

export async function audit(opts: {
  adminId?: string | null;
  adminEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      adminId: opts.adminId ?? null,
      adminEmail: opts.adminEmail ?? "",
      action: opts.action,
      targetType: opts.targetType ?? "",
      targetId: opts.targetId ?? "",
      detail: opts.detail ?? null,
      ip: opts.ip ?? null,
    });
  } catch {
    // 审计失败不影响主流程
  }
}

/** 清理过期令牌与会话（惰性调用） */
export async function cleanupExpired(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(emailTokens).where(lt(emailTokens.expiresAt, new Date(Date.now() - 86400_000)));
    await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date(Date.now() - 86400_000)));
  } catch {
    /* ignore */
  }
}
