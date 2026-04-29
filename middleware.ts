import { NextResponse, type NextRequest } from "next/server";

// Edge middleware — ensures every visitor has a `traveler_id` cookie before
// any page/API runs. We don't touch the DB here (Edge runtime can't reach
// Prisma); instead we just generate a stable id and let the service layer
// upsert a User row lazily on first write.
//
// The cookie value IS the user id. SaaS migration (real auth) will replace
// this middleware with a session-cookie reader.

const COOKIE_NAME = "traveler_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const config = {
  // Skip Next.js internals + static asset paths so middleware overhead is
  // limited to actual page/api requests.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|api/_health).*)",
  ],
};

export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE_NAME)) return NextResponse.next();

  // Generate a cuid-ish id without importing cuid (to keep edge bundle slim).
  // Format: c + base36 timestamp + 8 random base36 chars.
  const id =
    "c" +
    Date.now().toString(36) +
    Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(36).padStart(2, "0").slice(0, 2))
      .join("");

  const res = NextResponse.next();
  res.cookies.set({
    name: COOKIE_NAME,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
