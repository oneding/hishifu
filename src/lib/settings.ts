import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";

/** 后台「设置」优先，其次环境变量，最后取默认值 */
export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    const v = rows[0]?.value;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isNaN(n)) return n;
  } catch {
    /* ignore */
  }
  const env = process.env[key];
  if (env != null && env !== "" && !Number.isNaN(Number(env))) return Number(env);
  return fallback;
}

export async function getSettingString(key: string, fallback = ""): Promise<string> {
  try {
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    const v = rows[0]?.value;
    if (typeof v === "string" && v) return v;
    if (v != null && typeof v !== "string") return String(v);
  } catch {
    /* ignore */
  }
  return process.env[key] || fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}

export async function allSettings(): Promise<Record<string, unknown>> {
  try {
    const db = await getDb();
    const rows = await db.select().from(settings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function holdMinutes(): Promise<number> {
  return getSettingNumber("HOLD_MINUTES", 15);
}

export async function contactEmail(): Promise<string> {
  return getSettingString("CONTACT_EMAIL", "hello@xingyi-test.local");
}

export async function cancelCutoffHours(): Promise<number> {
  return getSettingNumber("CANCEL_CUTOFF_HOURS", 24);
}
