/**
 * 给场地写入经纬度（高德 GCJ-02），让前台「查看地图」跳到高德地图对应位置。
 *
 * 用法（需要 DATABASE_URL，可走 scripts/ops/tunnel.py 的 SSH 隧道）：
 *   npm run venue:geo -- 121.4453 31.2304
 *   VENUE_ID=<uuid> npm run venue:geo -- 121.4453 31.2304   # 多场地时指定
 *
 * 幂等：重复执行只会覆盖同一条记录的坐标。
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { venues } from "../src/db/schema";
import { buildMapUrl } from "../src/lib/map";

const [lngRaw, latRaw] = process.argv.slice(2);

async function main() {
  const lng = Number.parseFloat(lngRaw ?? "");
  const lat = Number.parseFloat(latRaw ?? "");
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    console.error("用法：npm run venue:geo -- <经度> <纬度>   例：npm run venue:geo -- 121.4453 31.2304");
    process.exit(1);
  }
  // 粗校验：中国大陆范围
  if (lng < 73 || lng > 136 || lat < 3 || lat > 54) {
    console.error(`坐标不在中国大陆范围内（lng=${lng}, lat=${lat}），确认是否用了高德 GCJ-02 坐标？`);
    process.exit(1);
  }

  const db = await getDb();
  const venueId = process.env.VENUE_ID;
  const row = venueId
    ? (await db.select().from(venues).where(eq(venues.id, venueId)).limit(1))[0]
    : (await db.select().from(venues).orderBy(asc(venues.createdAt)).limit(1))[0];

  if (!row) {
    console.error("没有找到场地记录，请先 npm run db:seed");
    process.exit(1);
  }

  await db
    .update(venues)
    .set({ lng, lat, updatedAt: new Date() })
    .where(eq(venues.id, row.id));

  const updated = (await db.select().from(venues).where(eq(venues.id, row.id)).limit(1))[0];
  console.log(`[venue:geo] 场地 ${row.id} 坐标已更新 → ${lng}, ${lat}`);
  console.log(`[venue:geo] 前台链接：${buildMapUrl(updated)}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
