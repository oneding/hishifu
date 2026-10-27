/**
 * 应用一个 drizzle 生成的 SQL 迁移文件（幂等，逐条执行）。
 *
 * 用法：DATABASE_URL=... npm run db:apply -- drizzle/0001_xxx.sql
 *
 * - 按 drizzle 的 `--> statement-breakpoint` 切分后逐条执行
 * - 已存在的对象（duplicate ... / already exists）自动跳过，便于重复执行
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

const file = process.argv[2];
if (!file) {
  console.error("用法：npm run db:apply -- <migration.sql>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
const statements = raw
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const db = await getDb();
  let ok = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await (db as any).execute(sql.raw(stmt));
      ok += 1;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        skipped += 1;
        console.log(`[skip] ${stmt.split("\n")[0].slice(0, 70)}`);
      } else {
        console.error("[fail]", stmt.slice(0, 120));
        throw e;
      }
    }
  }
  console.log(`[db] applied ${file} · executed=${ok} skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[db] apply failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
