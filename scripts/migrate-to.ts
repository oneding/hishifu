/**
 * 把数据从源库迁移到自有云服务器上的私有 Supabase / Postgres。
 *
 * 源库默认使用内置 PGlite（./.data/pg），目标库由 TARGET_DATABASE_URL 指定。
 * 用法：
 *   npm run db:migrate:to            # 结构 + 数据
 *   npx tsx scripts/migrate-to.ts --truncate   # 先清空目标表再导入
 *
 * 注意：运行前请停掉本地 dev server（PGlite 目录是单进程独占的）。
 */
import { getTableName } from "drizzle-orm";

const args = process.argv.slice(2);
const TRUNCATE = args.includes("--truncate");
const STRUCT_ONLY = args.includes("--structure-only");

const TARGET = (process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL || "").trim();
if (!TARGET) {
  console.error("[migrate] 请设置 TARGET_DATABASE_URL（或 DATABASE_URL）指向私有 Supabase 的 Postgres");
  process.exit(1);
}

async function main() {
  const schema = await import("../src/db/schema");
  const tables = Object.values(schema).filter((t: any) => getTableName(t as any));

  /* ---------------- 目标库：node-postgres ---------------- */
  const { Pool } = await import("pg");
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: TARGET,
    max: 4,
    ssl: TARGET.includes("localhost") || TARGET.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });
  const target = drizzlePg(pool, { schema: schema as any });

  console.log(`[migrate] 连接目标库 …`);
  const version = await pool.query("select version()");
  console.log(`[migrate] OK · ${String(version.rows[0].version).slice(0, 60)}`);

  /* ---------------- 1. 建表（同一套迁移 SQL） ---------------- */
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(target, { migrationsFolder: "./drizzle" });
  console.log("[migrate] 表结构已就绪");

  if (STRUCT_ONLY) {
    await pool.end();
    console.log("[migrate] 仅同步结构，完成");
    process.exit(0);
  }

  /* ---------------- 源库：PGlite ---------------- */
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync("./.data", { recursive: true });
  const source = drizzlePglite(new PGlite("./.data/pg"), { schema: schema as any });

  // 按外键依赖顺序复制，避免子表先于父表插入
  const ORDER = [
    "admins",
    "admin_sessions",
    "email_tokens",
    "courses",
    "venues",
    "course_translations",
    "venue_translations",
    "class_sessions",
    "bookings",
    "payments",
    "email_logs",
    "audit_logs",
    "settings",
    "idempotency_records",
  ];
  const byName = new Map<string, any>(tables.map((t: any) => [getTableName(t), t]));
  const ordered: any[] = [];
  for (const n of ORDER) {
    const t = byName.get(n);
    if (t) ordered.push(t);
  }
  for (const t of tables as any[]) {
    if (!ORDER.includes(getTableName(t))) ordered.push(t);
  }

  if (TRUNCATE) {
    const names = [...ORDER].reverse().map((n) => `"${n}"`).join(", ");
    await (target as any).execute(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    console.log("[migrate] 目标表已清空");
  }

  let total = 0;
  for (const table of ordered) {
    const name = getTableName(table);
    const rows: any[] = await (source as any).select().from(table);
    if (!rows.length) {
      console.log(`  · ${name.padEnd(22)} 0 行（跳过）`);
      continue;
    }
    // 分批插入，避免单条 SQL 过大
    const BATCH = 200;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await (target as any)
        .insert(table)
        .values(chunk)
        .onConflictDoNothing();
      done += chunk.length;
    }
    total += done;
    console.log(`  ✓ ${name.padEnd(22)} ${done} 行`);
  }

  await pool.end();
  console.log(`[migrate] 完成，共迁移 ${total} 行。现在把 DATABASE_URL 指向该库并重启服务即可。`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[migrate] 失败:", e);
  process.exit(1);
});
