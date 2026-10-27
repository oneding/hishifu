import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL 安全的不可猜测令牌（用于安全链接 / 会话 cookie） */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += randomInt(0, 10).toString();
  return s;
}

export function uuid(): string {
  return randomUUID();
}

/* ----------------------------- 密码 ----------------------------- */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, salt, hex] = stored.split("$");
    if (algo !== "scrypt" || !salt || !hex) return false;
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(hex, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/* ----------------------------- 签名 ----------------------------- */
export function hmacSign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmac(payload: string, secret: string, signature: string): boolean {
  const expected = hmacSign(payload, secret);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/* ----------------------------- 订单号 ----------------------------- */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function bookingCode(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return `XYQ-${y}${m}${d}-${s}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim()) && email.length <= 254;
}

/* --------------------- 令牌密文（用于原样重发邮件） --------------------- */
const CIPHER_ALGO = "aes-256-gcm";

function cipherKey(): Buffer {
  return createHash("sha256").update(String(process.env.AUTH_SECRET || "dev-only-secret")).digest();
}

/** AES-256-GCM 加密，输出 iv.tag.ciphertext(base64url) */
export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGO, cipherKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptToken(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".");
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv(CIPHER_ALGO, cipherKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
