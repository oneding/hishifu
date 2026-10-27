/**
 * 建表（幂等）。本地 PGlite 或远端 Postgres 都适用。
 * 用法：npm run db:migrate
 */
import { getDb } from "../src/db";

async function main() {
  const db = await getDb();
  const r: any = await (db as any).execute(`select count(*)::int as c from information_schema.tables where table_schema='public'`);
  const count = r?.rows?.[0]?.c ?? r?.[0]?.c ?? "?";
  console.log(`[db] ready · public tables = ${count}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[db] migrate failed:", e);
  process.exit(1);
});
