import "server-only";

// Single point of truth for "who is the active user". Returns the row key used
// by all per-user resources (Trip.userId, Plan.userId, Settings.userId,
// ApiUsageLog.userId).
//
// Phase 0–6: local-first single-user mode → always returns DEFAULT_USER_ID.
// Phase 6+: SaaS / auth migration → swap this to read the session cookie /
// JWT subject. Every service query already calls through here, so the
// migration becomes a one-line change.

export const DEFAULT_USER_ID = "default-user";

export async function getCurrentUserId(): Promise<string> {
  // TODO: when auth lands, read from cookies()/headers() (next/headers) and
  // fall back to DEFAULT_USER_ID for unauthenticated dev sessions.
  return DEFAULT_USER_ID;
}

// Synchronous version for hot paths where we already know the request is
// local-mode. Prefer the async one in service code.
export function getCurrentUserIdSync(): string {
  return DEFAULT_USER_ID;
}
