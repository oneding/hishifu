/**
 * 版本信息（构建时由 next.config.ts 注入，见 NEXT_PUBLIC_APP_*）。
 * 用于页脚展示与问题排查：让用户/运营一眼知道线上跑的是哪个版本。
 */
export const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const appCommit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "unknown";
export const appBuildAtISO = process.env.NEXT_PUBLIC_APP_BUILD_AT ?? "";

/** 形如 v1.0.3 */
export const versionLabel = `v${appVersion}`;

/** 构建时间的 UTC+8 展示（YYYY-MM-DD HH:mm） */
export function buildAtLabel(): string {
  if (!appBuildAtISO) return "";
  const d = new Date(appBuildAtISO);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 完整串：v1.0.3 · a1b2c3d */
export function versionFull(): string {
  return appCommit && appCommit !== "unknown"
    ? `${versionLabel} · ${appCommit}`
    : versionLabel;
}
