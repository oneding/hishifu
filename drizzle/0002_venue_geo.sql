-- 场地经纬度（高德 GCJ-02 坐标系），用于生成高德地图定位链接
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "lng" double precision;
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "lat" double precision;
