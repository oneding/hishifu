"use client";

import { useActionState } from "react";
import { saveCourseAction, type ActionState } from "./actions";
import { useT } from "./AuthUI";

const initial: ActionState = {};

export interface CourseFormInitial {
  courseId: string;
  durationMinutes: number;
  taughtLanguages: string;
  venueId: string;
  mapUrl: string;
  lng: string;
  lat: string;
  zh: Record<string, string>;
  en: Record<string, string>;
}

const FIELDS: { key: string; zh: string; en: string; area?: boolean }[] = [
  { key: "title", zh: "课程名称", en: "Title" },
  { key: "summary", zh: "一句话简介", en: "Summary", area: true },
  { key: "description", zh: "体验介绍", en: "Description", area: true },
  { key: "audience", zh: "适合人群", en: "Who it's for", area: true },
  { key: "includes", zh: "费用包含", en: "What's included", area: true },
  { key: "excludes", zh: "费用不包含", en: "Not included", area: true },
  { key: "cancelPolicy", zh: "取消与退款规则", en: "Cancellation policy", area: true },
  { key: "notes", zh: "内部备注", en: "Internal notes", area: true },
];

const VENUE_FIELDS: { key: string; zh: string; en: string; area?: boolean }[] = [
  { key: "venueName", zh: "场地名称", en: "Venue name" },
  { key: "venueAddress", zh: "详细地址", en: "Address", area: true },
  { key: "venueDirections", zh: "到店指引", en: "Getting there", area: true },
];

export function CourseForm({ data }: { data: CourseFormInitial }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveCourseAction, initial);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[20px] font-extrabold">{t("课程与规则", "Class & policies")}</h1>
        <p className="mt-1 text-[12px] text-muted">
          {t("中英文共用同一套课程、场次、库存与订单。", "Both languages share the same class, sessions, inventory and orders.")}
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="courseId" value={data.courseId} />
        <input type="hidden" name="venueId" value={data.venueId} />

        <div className="card grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <label className="label">{t("课程时长（分钟）", "Duration (minutes)")}</label>
            <input className="field" type="number" name="durationMinutes" defaultValue={data.durationMinutes} min={1} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">
              {t("实际授课语言（代码，逗号分隔）", "Instruction languages (codes, comma separated)")}
            </label>
            <input className="field" name="taughtLanguages" defaultValue={data.taughtLanguages} placeholder="zh,en" />
            <p className="mt-1 text-[11px] text-muted">
              {t("与「页面语言」无关，仅表示教练授课语言。", "Independent of the website language — this is the language used in class.")}
            </p>
          </div>
        </div>

        {(["zh", "en"] as const).map((l) => (
          <div key={l} className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="badge badge-slate">{l === "zh" ? "中文" : "English"}</span>
              <span className="text-[13px] text-muted">{l === "zh" ? "中文站展示内容" : "English site content"}</span>
            </div>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{l === "zh" ? f.zh : f.en}</label>
                {f.area ? (
                  <textarea className="field min-h-[90px]" name={`${l}_${f.key}`} defaultValue={data[l][f.key] ?? ""} />
                ) : (
                  <input className="field" name={`${l}_${f.key}`} defaultValue={data[l][f.key] ?? ""} />
                )}
              </div>
            ))}
          </div>
        ))}

        <div className="card space-y-3 p-4">
          <h2 className="text-[15px] font-bold">{t("场地", "Venue")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{t("经度（高德 GCJ-02）", "Longitude (Amap GCJ-02)")}</label>
              <input className="field" name="lng" defaultValue={data.lng} placeholder="121.4453" inputMode="decimal" />
            </div>
            <div>
              <label className="label">{t("纬度（高德 GCJ-02）", "Latitude (Amap GCJ-02)")}</label>
              <input className="field" name="lat" defaultValue={data.lat} placeholder="31.2304" inputMode="decimal" />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-muted">
            {t(
              "填经纬度后，「查看地图」会跳到高德地图该位置（未安装 App 时打开网页版）。坐标请在高德地图拾取器取 GCJ-02 值，不要用 GPS/WGS-84 原值。",
              "With coordinates set, \"View map\" opens this location in Amap (web version if the app is not installed). Pick GCJ-02 values from Amap\u2019s coordinate picker \u2014 raw GPS/WGS-84 values will be offset.",
            )}
          </p>
          <div>
            <label className="label">{t("地图链接（覆盖，选填）", "Map URL (override, optional)")}</label>
            <input className="field" name="mapUrl" defaultValue={data.mapUrl} placeholder="https://…" />
            <p className="mt-1 text-[11px] text-muted">
              {t("留空即使用上面的经纬度生成高德链接；填了则以这里为准。", "Leave empty to use the Amap link built from the coordinates above; if set, this URL wins.")}
            </p>
          </div>
          {(["zh", "en"] as const).map((l) => (
            <div key={l} className="grid gap-3 sm:grid-cols-3">
              {VENUE_FIELDS.map((f) => (
                <div key={f.key} className={f.area ? "sm:col-span-3" : ""}>
                  <label className="label">
                    {l === "zh" ? f.zh : f.en} ({l})
                  </label>
                  {f.area ? (
                    <textarea className="field min-h-[70px]" name={`${l}_${f.key}`} defaultValue={data[l][f.key] ?? ""} />
                  ) : (
                    <input className="field" name={`${l}_${f.key}`} defaultValue={data[l][f.key] ?? ""} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {state?.message ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{state.message}</div>
        ) : null}
        {state?.error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{state.error}</div>
        ) : null}

        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? t("保存中…", "Saving…") : t("保存课程", "Save class")}
        </button>
      </form>
    </div>
  );
}
