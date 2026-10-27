import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

/**
 * 双驱动：
 *  - 配了 DATABASE_URL（Neon / Supabase / 任意 Postgres）→ node-postgres 连接池
 *  - 未配置 → PGlite 嵌入式 Postgres（数据落在 ./.data/pg，零安装）
 * 两边跑的是同一份 Postgres SQL，切换只改环境变量。
 */
/**
 * node-postgres 默认 sslmode=prefer，会先发 SSLRequest；
 * 自建 Postgres 未开 SSL 时服务端直接拒绝（"The server does not support SSL connections"），
 * 且 Node 端不像 libpq 那样会回退。因此这里显式按 URL 的 sslmode 决定：
 *   require / verify-ca / verify-full → 启用 SSL
 *   其余（disable、allow、prefer 及未指定）→ 关闭 SSL
 * 需要 SSL 时（如 Neon / Supabase 云）请在连接串上加 ?sslmode=require
 */
const SSL_MODES = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"];

function sslOptionsFromUrl(url: string): { ssl: false | { rejectUnauthorized: boolean }; sslmode: string } {
  let mode = "disable";
  try {
    const u = new URL(url);
    mode = (u.searchParams.get("sslmode") || u.searchParams.get("ssl") || "").toLowerCase();
    if (mode === "true" || mode === "1") mode = "require";
    if (mode === "false" || mode === "0") mode = "disable";
  } catch {
    /* 解析失败按 disable 处理 */
  }
  if (!SSL_MODES.includes(mode)) mode = "disable";
  if (["require", "verify-ca", "verify-full"].includes(mode)) {
    return { ssl: { rejectUnauthorized: mode === "verify-full" }, sslmode: mode };
  }
  return { ssl: false, sslmode: mode || "disable" };
}

async function createDb(): Promise<DB> {
  const url = (process.env.DATABASE_URL || "").trim();

  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { ssl, sslmode } = sslOptionsFromUrl(url);
    if (sslmode !== "disable") {
      console.log(`[db] postgres sslmode=${sslmode}`);
    }
    const pool = new Pool({ connectionString: url, max: 5, ssl });
    return drizzle(pool, { schema }) as DB;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = "./.data/pg";
  // PGlite 的 nodefs 不会递归建目录，先确保父目录存在
  (await import("node:fs")).mkdirSync("./.data", { recursive: true });
  const client = new PGlite(dataDir);
  return drizzle(client, { schema }) as unknown as DB;
}

const globalForDb = globalThis as unknown as { __dbPromise?: Promise<DB> };

async function initDb(): Promise<DB> {
  const db = await createDb();
  try {
    const { migrate } = await import("drizzle-orm/pglite/migrator").catch(() => ({ migrate: null }));
    const mod: any = urlDriverIsPg()
      ? await import("drizzle-orm/node-postgres/migrator")
      : { migrate };
    if (mod?.migrate) {
      await mod.migrate(db as any, { migrationsFolder: "./drizzle" });
    }
  } catch (e) {
    // 表已存在 / 迁移文件缺失不阻塞启动，表结构由 scripts/migrate.ts 保证
    console.warn("[db] migrate skipped:", (e as Error)?.message);
  }
  return db;
}

function urlDriverIsPg() {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

export function getDb(): Promise<DB> {
  if (!globalForDb.__dbPromise) {
    globalForDb.__dbPromise = initDb();
  }
  return globalForDb.__dbPromise;
}

/** 事务包装：所有涉及库存变更的操作必须走它 */
export async function withTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => fn(tx as any)) as Promise<T>;
}

export async function pingDb() {
  const db = await getDb();
  const r: any = await db.execute(sql`select version() as v`);
  return r?.rows?.[0]?.v ?? "unknown";
}

export { schema };
