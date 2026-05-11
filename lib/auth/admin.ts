import "server-only";
import { timingSafeEqual } from "node:crypto";

// Fixed admin User.id. Trips / Settings / ApiUsageLog rows owned by the admin
// always FK to this id, so the admin's data persists across browser cookies,
// devices, and Vercel deployment URLs (which otherwise generate fresh
// guest cookies on every preview alias).
export const ADMIN_USER_ID = "admin";

export function isAdminPasswordSet(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

// Constant-time compare. Returns false when input/length mismatches the env
// secret to avoid leaking length information.
export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
