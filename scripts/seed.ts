/**
 * 演示数据（全部标注为测试用）。
 * 可通过环境变量覆盖初始管理员：SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { admins, classSessions, courseTranslations, courses, venueTranslations, venues } from "../src/db/schema";
import { setSetting } from "../src/lib/settings";
import { hashPassword, normalizeEmail } from "../src/lib/security";

const ADMIN_EMAIL = normalizeEmail(process.env.SEED_ADMIN_EMAIL || "admin@xingyi-test.local");
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Xingyi@2026";

const CANCEL_ZH = `· 开课前 24 小时（含）以上取消：全额退款，名额即时释放。
· 开课前 24 小时以内取消：不予退款，可自行转让名额给他人。
· 因场馆或教练原因取消课程：全额退款，并另行邮件通知。
· 以上时间均以北京时间（UTC+8）为准。
· 本测试环境不产生真实扣款，退款为模拟操作。`;

const CANCEL_EN = `· Cancel 24 hours or more before the start: full refund, seats released immediately.
· Cancel within 24 hours of the start: no refund; you may transfer your place to someone else.
· If we cancel the class (venue or coach): full refund, notified by email.
· All times are Beijing/Shanghai time (UTC+8).
· This is a test environment — no real money is charged and refunds are simulated.`;

async function main() {
  const db = await getDb();

  /* ---------------- 管理员 ---------------- */
  const existing = await db.select().from(admins).where(eq(admins.email, ADMIN_EMAIL)).limit(1);
  if (!existing.length) {
    await db.insert(admins).values({
      email: ADMIN_EMAIL,
      name: "运营管理员",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: "owner",
      emailVerified: true,
    });
    console.log(`[seed] admin created  → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`[seed] admin exists    → ${ADMIN_EMAIL}`);
  }

  /* ---------------- 全局设置 ---------------- */
  await setSetting("HOLD_MINUTES", 15);
  await setSetting("CONTACT_EMAIL", "hello@xingyi-test.local");
  await setSetting("CANCEL_CUTOFF_HOURS", 24);
  await setSetting("CURRENCY_DEFAULT", "CNY");

  /* ---------------- 课程 ---------------- */
  let course = (await db.select().from(courses).where(eq(courses.slug, "xingyi-taster-shanghai")).limit(1))[0];
  if (!course) {
    course = (
      await db
        .insert(courses)
        .values({
          slug: "xingyi-taster-shanghai",
          status: "published",
          durationMinutes: 90,
          taughtLanguages: ["zh", "en"], // 实际授课语言（页面语言与此无关）
          imageUrl: null,
        })
        .returning()
    )[0];
  }

  const trs = [
    {
      locale: "zh",
      title: "上海零基础形意拳体验课",
      summary: "90 分钟入门：站桩、五行拳基础动作与呼吸配合。无需任何武术基础，穿运动服即可参加。",
      description: `形意拳是中国传统内家拳之一，动作朴实、招式简练，讲究「心意诚于中，肢体形于外」。

本次体验课面向完全零基础的朋友，用 90 分钟带你完成一次完整的入门训练：

1. 热身与关节活动（10 分钟）
2. 三体式站桩：建立基本结构与重心（20 分钟）
3. 五行拳基础：劈、崩、钻、炮、横的动作要领（35 分钟）
4. 呼吸与发力配合练习（15 分钟）
5. 放松与答疑（10 分钟）

教练会逐一纠正动作，全程强度可控，久坐办公人群也能轻松跟上。课程结束后你会带走一套可以在家练习的基础动作。`,
      audience: `· 完全零基础，从未接触过武术
· 久坐办公、希望改善体态与呼吸的人群
· 想了解内家拳但对高强度训练有顾虑的人
· 年龄 12–60 岁，无重大心脑血管疾病`,
      includes: `· 专业教练全程指导（师生比不超过 1:6）
· 练功服与练功鞋试用
· 饮用水与毛巾
· 场地意外险（测试版为演示项目）
· 课后动作要点图文资料`,
      excludes: `· 往返交通费用
· 餐食与饮品
· 一对一私教课程
· 武术器械购买`,
      cancelPolicy: CANCEL_ZH,
      notes: "演示数据，仅用于流程验收。",
    },
    {
      locale: "en",
      title: "Beginner Xingyiquan Taster Class in Shanghai",
      summary:
        "A 90-minute introduction: stance work, the five-element strikes and breath coordination. No experience needed — just wear sportswear.",
      description: `Xingyiquan is one of the classic Chinese internal martial arts: direct, economical movements built on structure and intent.

This 90-minute taster takes a complete beginner through one full training session:

1. Warm-up and joint mobility (10 min)
2. San Ti Shi stance: building structure and balance (20 min)
3. The five elements: Pi, Beng, Zuan, Pao and Heng (35 min)
4. Breathing and power coordination (15 min)
5. Cool-down and Q&A (10 min)

The coach corrects each participant individually and the intensity stays manageable, so it suits desk-bound beginners too. You leave with a short set you can practise at home.`,
      audience: `· Complete beginners with no martial arts background
· People who sit at a desk all day and want better posture and breathing
· Anyone curious about internal arts but wary of high-intensity training
· Ages 12–60, no serious cardiovascular conditions`,
      includes: `· Full coaching throughout (max 6 participants per coach)
· Training outfit and shoes to borrow
· Drinking water and towels
· Venue accident insurance (demo item in this test build)
· Illustrated take-home notes`,
      excludes: `· Transport to and from the venue
· Meals and drinks
· One-to-one private lessons
· Martial arts equipment purchases`,
      cancelPolicy: CANCEL_EN,
      notes: "Demo data for acceptance testing only.",
    },
  ];

  for (const t of trs) {
    const found = await db
      .select()
      .from(courseTranslations)
      .where(eq(courseTranslations.courseId, course.id));
    if (found.some((f) => f.locale === t.locale)) continue;
    await db.insert(courseTranslations).values({ courseId: course.id, ...t });
  }

  /* ---------------- 场地 ---------------- */
  // 演示场地坐标：上海静安 南京西路（GCJ-02，与 directions 里的高德链接一致）
  const VENUE_LNG = 121.4453;
  const VENUE_LAT = 31.2304;
  let venue = (await db.select().from(venues).limit(1))[0];
  if (!venue) {
    venue = (
      await db
        .insert(venues)
        .values({
          mapUrl:
            "https://www.google.com/maps/search/?api=1&query=Jing%27an+Temple+Shanghai+West+Nanjing+Road",
          lng: VENUE_LNG,
          lat: VENUE_LAT,
        })
        .returning()
    )[0];
  } else if (venue.lng == null || venue.lat == null) {
    // 已存在但缺坐标（老库）：补上，「查看地图」才能跳高德
    await db
      .update(venues)
      .set({ lng: venue.lng ?? VENUE_LNG, lat: venue.lat ?? VENUE_LAT, updatedAt: new Date() })
      .where(eq(venues.id, venue.id));
    venue = { ...venue, lng: venue.lng ?? VENUE_LNG, lat: venue.lat ?? VENUE_LAT };
  }

  const vtrs = [
    {
      locale: "zh",
      name: "静安武术体验空间（演示场地）",
      addressLine: "上海市静安区南京西路 1266 号 3 楼 302 室（演示地址，非真实场地）",
      directions:
        "地铁 2 / 12 / 13 号线南京西路站 1 号口出，步行约 5 分钟。\n大楼 B1 有访客电梯直达 3 楼，前台登记后左手第二间教室。\n高德地图：https://uri.amap.com/marker?position=121.4453,31.2304",
    },
    {
      locale: "en",
      name: "Jing'an Martial Arts Studio (demo venue)",
      addressLine: "Room 302, 3F, 1266 West Nanjing Road, Jing'an, Shanghai (demo address, not a real venue)",
      directions:
        "Metro lines 2 / 12 / 13 to West Nanjing Road, exit 1, about 5 minutes on foot.\nTake the visitor lift from B1 to 3F; register at reception, second classroom on the left.\nAmap (for users in China): https://uri.amap.com/marker?position=121.4453,31.2304",
    },
  ];
  for (const t of vtrs) {
    const found = await db.select().from(venueTranslations).where(eq(venueTranslations.venueId, venue.id));
    if (found.some((f) => f.locale === t.locale)) continue;
    await db.insert(venueTranslations).values({ venueId: venue.id, ...t });
  }

  /* ---------------- 场次（时间均为上海时间 UTC+8） ---------------- */
  const sessions = [
    { start: "2026-11-01T02:00:00Z", end: "2026-11-01T03:30:00Z", capacity: 12 },
    { start: "2026-11-08T02:00:00Z", end: "2026-11-08T03:30:00Z", capacity: 12 },
    { start: "2026-11-15T11:00:00Z", end: "2026-11-15T12:30:00Z", capacity: 8 },
    // 演示「满员自动停售」：已满
    { start: "2026-11-22T02:00:00Z", end: "2026-11-22T03:30:00Z", capacity: 2, confirmed: 2 },
  ];

  for (const s of sessions) {
    const found = await db.select().from(classSessions).where(eq(classSessions.courseId, course.id));
    if (found.some((f) => f.startAt.toISOString() === new Date(s.start).toISOString())) continue;
    await db.insert(classSessions).values({
      courseId: course.id,
      venueId: venue.id,
      startAt: new Date(s.start),
      endAt: new Date(s.end),
      priceCents: 19900, // ¥199
      currency: "CNY",
      capacity: s.capacity,
      seatsConfirmed: s.confirmed ?? 0,
      seatsHeld: 0,
      status: "open",
      note: "演示场次",
    });
  }

  console.log("[seed] done · course/sessions ready (all data marked as demo)");
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
