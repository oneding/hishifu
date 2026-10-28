/**
 * 地图链接：有经纬度走高德地图（URI API），否则回退到后台手工填写的地图链接。
 *
 * 坐标系说明：高德使用 GCJ-02（火星坐标）。从 Google / GPS 设备拿到的 WGS-84 坐标
 * 直接传给高德会有百米级偏移，后台录入时请填高德坐标系下的经纬度。
 *
 * 参考：https://lbs.amap.com/api/uri-api/guide/travel/route
 */
export type MapVenue = {
  mapUrl?: string | null;
  lng?: number | string | null;
  lat?: number | string | null;
};

const AMAP_SRC = "xingyi";

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** 经纬度是否落在中国大陆的合理范围内（粗校验，防止填反或填 0） */
function inChina(lng: number, lat: number): boolean {
  return lng >= 73 && lng <= 136 && lat >= 3 && lat <= 54;
}

/**
 * 高德「标注 / 定位」页：打开后以该点为中心，可一键唤起高德 App 导航。
 * https://uri.amap.com/marker?position=lng,lat&name=xxx&coordinate=gaode&callnative=1
 */
export function amapMarkerUrl(lng: number, lat: number, name?: string): string {
  // position 里的逗号保持原样（部分客户端对 %2C 处理不一致），其余参数走 encodeURIComponent
  const q = [
    `position=${round(lng)},${round(lat)}`,
    name ? `name=${encodeURIComponent(name)}` : "",
    `src=${AMAP_SRC}`,
    "coordinate=gaode",
    "callnative=1",
  ].filter(Boolean);
  return `https://uri.amap.com/marker?${q.join("&")}`;
}

/** 高德「导航」页：直接进路线规划（默认驾车）。 */
export function amapNavigationUrl(lng: number, lat: number, name?: string): string {
  const to = [round(lng), round(lat), name ? encodeURIComponent(name) : ""].join(",");
  const q = [`to=${to}`, "mode=car", "policy=1", `src=${AMAP_SRC}`, "coordinate=gaode", "callnative=1"];
  return `https://uri.amap.com/navigation?${q.join("&")}`;
}

function round(n: number): string {
  // 6 位小数约 0.1 米，足够定位且避免浮点长尾
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * 生成页面 / 邮件里「查看地图」的落地链接。
 * 优先级：经纬度 → 高德定位页；否则用后台填写的 mapUrl；都没有返回空串（页面不渲染该链接）。
 */
export function buildMapUrl(venue?: MapVenue | null, name?: string): string {
  if (!venue) return "";
  const lng = num(venue.lng);
  const lat = num(venue.lat);
  if (lng !== null && lat !== null && inChina(lng, lat)) {
    return amapMarkerUrl(lng, lat, name || undefined);
  }
  return (venue.mapUrl ?? "").trim();
}

/** 该链接是否是高德地图 */
export function isAmapUrl(url: string): boolean {
  return /^https?:\/\/(uri\.amap\.com|[^/]*amap\.com)/i.test(url);
}
