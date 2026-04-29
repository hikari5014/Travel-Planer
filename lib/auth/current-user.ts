import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// Single point of truth for "who is the active user". The cookie set by
// `middleware.ts` (named "traveler_id") is the User.id. Service layer calls
// getCurrentUserId() everywhere and the value is then used as a foreign key
// (Trip.userId, ApiUsageLog.userId, Settings.id, TripMember.userId).
//
// Phase 0–7 single-user mode used a hard-coded "default-user". That row is
// retained as a real User in the DB; new visitors get a cuid-ish id from
// middleware. SaaS migration (real auth) will swap this for a session
// reader without touching service code.

export const DEFAULT_USER_ID = "default-user";
const COOKIE_NAME = "traveler_id";

// READ ONLY — does not create a User row. Used by service queries that just
// need a userId for filtering. Returns DEFAULT_USER_ID if the cookie is
// missing (e.g. service code running outside a request scope: seed scripts,
// scheduled jobs, etc.).
export async function getCurrentUserId(): Promise<string> {
  try {
    const c = await cookies();
    return c.get(COOKIE_NAME)?.value || DEFAULT_USER_ID;
  } catch {
    // cookies() throws when called outside a request; fall back to legacy.
    return DEFAULT_USER_ID;
  }
}

// READ + LAZY-CREATE — call from any service that's about to write a row
// FK'd to User.id. Idempotently upserts the User row (safe to call N times
// per request). Returns the resolved User row.
export async function ensureCurrentUser(): Promise<{ id: string; displayName: string; isGuest: boolean }> {
  const id = await getCurrentUserId();
  const user = await prisma.user.upsert({
    where: { id },
    update: { lastSeenAt: new Date() },
    create: {
      id,
      displayName: id === DEFAULT_USER_ID ? "我" : pickGuestDisplayName(id),
      isGuest: id !== DEFAULT_USER_ID,
    },
  });
  return { id: user.id, displayName: user.displayName, isGuest: user.isGuest };
}

// Friendly placeholder name for guests. Uses the last 4 chars of their id
// so we get stable but distinguishable labels: "訪客 #A3F7", "訪客 #B11D".
function pickGuestDisplayName(id: string): string {
  const tag = id.slice(-4).toUpperCase();
  return `訪客 #${tag}`;
}
