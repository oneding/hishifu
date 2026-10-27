import { NextResponse } from "next/server";
import { z } from "zod";
import { sendLookupLinks } from "@/lib/booking";
import { isValidEmail, normalizeEmail } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().max(254) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "email" }, { status: 400 });
  }
  if (!isValidEmail(parsed.data.email)) {
    return NextResponse.json({ ok: false, error: "email" }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const { found } = await sendLookupLinks(email);

  // 无论邮箱是否存在都返回相同结果，避免暴露他人预约信息
  return NextResponse.json({ ok: true, sent: true, found });
}
