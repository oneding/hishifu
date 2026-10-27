import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { resendEmailLog } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 重发某条邮件日志（后台「邮件」页的等价接口，便于脚本化验收） */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const res = await resendEmailLog(id);
    return NextResponse.json({ ok: res.ok, status: res.status, error: res.error ?? null });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
