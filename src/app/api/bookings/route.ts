import { NextResponse } from "next/server";
import { z } from "zod";
import { createBooking, getSessionRow, isBookable, seatsLeft } from "@/lib/booking";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import { isLocale } from "@/i18n/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254),
  qty: z.coerce.number().int().min(1).max(50),
  locale: z.string().default("zh"),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "generic", message: "bad json" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "generic", message: "invalid payload" }, { status: 400 });
  }

  const input = parsed.data;
  if (!isValidEmail(input.email)) {
    return NextResponse.json({ ok: false, error: "emailInvalid" }, { status: 400 });
  }

  const session = await getSessionRow(input.sessionId);
  if (!session) return NextResponse.json({ ok: false, error: "session" }, { status: 400 });
  if (session.status !== "open") return NextResponse.json({ ok: false, error: "closed" }, { status: 409 });
  if (seatsLeft(session) < input.qty) {
    return NextResponse.json({ ok: false, error: "soldOut" }, { status: 409 });
  }
  if (!isBookable(session)) {
    return NextResponse.json({ ok: false, error: "closed" }, { status: 409 });
  }

  const res = await createBooking({
    sessionId: input.sessionId,
    name: input.name,
    email: normalizeEmail(input.email),
    qty: input.qty,
    locale: isLocale(input.locale) ? input.locale : "zh",
    idempotencyKey: input.idempotencyKey ?? null,
  });

  if (!res.ok) {
    const code =
      res.error === "sold_out" ? "soldOut" : res.error === "blocked" ? "blocked" : res.error === "closed" ? "closed" : "generic";
    return NextResponse.json({ ok: false, error: code }, { status: res.error === "blocked" ? 403 : 409 });
  }

  return NextResponse.json({
    ok: true,
    code: res.booking.code,
    bookingId: res.booking.id,
    token: res.accessToken,
    duplicated: res.duplicated,
    expiresAt: res.booking.holdExpiresAt,
  });
}
