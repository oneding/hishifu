/**
 * 清空当前 DATABASE_URL 指向的库（表结构保留），用于重置演示数据。
 *
 * 用法：
 *   npm run db:reset                  # 会提示确认
 *   npx tsx --env-file=.env.local scripts/reset.ts --yes
 *
 * 注意：
 *  - 只清数据不删表；按外键反序 TRUNCATE，避免 23503。
 *  - 若未设置 DATABASE_URL，操作的是内置 PGlite（./.data/pg）。
 */
export {};

const FORCE = process.argv.includes("--yes") || process.argv.includes("-y");
const TARGET = (process.env.DATABASE_URL || "").trim();

/** 与 migrate-to.ts 的 ORDER 保持一致，此处反序清空 */
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

async function main() {
  const where = TARGET ? TARGET.replace(/\/\/[^@]*@/, "//***@") : "内置 PGlite（./.data/pg）";
  if (!FORCE) {
    console.log(`[reset] 目标：${where}`);
    console.log("[reset] 这是破坏性操作（清空全部业务数据）。确认请加 --yes");
    process.exit(1);
  }
  console.log(`[reset] 清空目标库：${where}`);

  const { Pool } = await import("pg");
  const schema = await import("../src/db/schema");

  if (TARGET) {
    const pool = new Pool({
      connectionString: TARGET,
      max: 2,
      ssl: /[?&]sslmode=(require|verify-ca|verify-full)/.test(TARGET)
        ? { rejectUnauthorized: false }
        : false,
    });
    try {
      await pool.query(`truncate table ${ORDER.slice().reverse().join(", ")} restart identity cascade`);
      console.log("[reset] 完成（外部 Postgres）");
    } finally {
      await pool.end();
    }
    return;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync("./.data", { recursive: true });
  const client = new PGlite("./.data/pg");
  await client.query(`truncate table ${ORDER.slice().reverse().join(", ")} restart identity cascade`);
  await client.close();
  void schema;
  console.log("[reset] 完成（PGlite）");
}

main().catch((e) => {
  console.error("[reset] 失败:", (e as Error)?.message);
  process.exit(1);
});
