export {};

/**
 * 目标数据库连通性自检。
 * 用法：TARGET_DATABASE_URL='postgresql://…' npx tsx scripts/check-db.ts
 * 会输出：服务器版本、时区、表数量、各表行数；失败时给出常见原因提示。
 */
const URL_ = (process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL || "").trim();

if (!URL_) {
  console.error("[check] 请设置 TARGET_DATABASE_URL 或 DATABASE_URL");
  process.exit(1);
}

const masked = URL_.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
console.log(`[check] 目标：${masked}`);

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: URL_,
    max: 2,
    connectionTimeoutMillis: 8000,
    ssl: URL_.includes("localhost") || URL_.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });

  try {
    const v = await pool.query("select version()");
    console.log(`[check] 版本：${String(v.rows[0].version).slice(0, 70)}`);

    const tz = await pool.query("show timezone");
    console.log(`[check] 时区：${tz.rows[0].timezone}`);

    const t = await pool.query(
      "select count(*)::int as c from information_schema.tables where table_schema='public'",
    );
    console.log(`[check] public 表数量：${t.rows[0].c}`);

    const rows = await pool.query(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    for (const r of rows.rows) {
      const n = await pool.query(`select count(*)::int as c from public."${r.table_name}"`);
      console.log(`  · ${r.table_name.padEnd(22)} ${n.rows[0].c} 行`);
    }
    console.log("[check] ✅ 连接正常");
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`[check] ❌ 连接失败：${msg}`);
    console.error(`
常见原因：
  1) 云服务器安全组/防火墙未放行 5432（当前建议用 SSH 隧道，只走 22 端口）
  2) Postgres 未监听公网地址（检查 docker 端口映射与 postgresql.conf 的 listen_addresses）
  3) 账号或密码不对（自建 Supabase 的默认用户是 postgres，密码在 supabase/docker/.env 的 POSTGRES_PASSWORD）
  4) 若走 Supavisor 连接池(6543)，用户名需写成 postgres.<project-ref>`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
