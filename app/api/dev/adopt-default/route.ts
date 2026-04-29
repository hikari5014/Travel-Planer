import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// Dev-only recovery route. Phase 8b's middleware started giving every browser
// a fresh `traveler_id` cookie, which orphaned single-user installs that had
// data on the legacy "default-user" Settings/Trip rows. Hitting this endpoint
// switches the cookie back to "default-user" so the existing data is in
// scope again.
//
// Refuses in production to avoid making it possible for any visitor to claim
// the owner identity on a deployed app.

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Disabled in production." },
      { status: 403 },
    );
  }

  // Make sure the User row exists (the Phase 8 seed creates it, but defend
  // against fresh dev DBs).
  await prisma.user.upsert({
    where: { id: "default-user" },
    update: { lastSeenAt: new Date() },
    create: { id: "default-user", displayName: "我", isGuest: false },
  });

  const c = await cookies();
  c.set({
    name: "traveler_id",
    value: "default-user",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Redirect back to settings (or the URL passed in `?next=`) so the user
  // sees their recovered data immediately.
  const next = req.nextUrl.searchParams.get("next") ?? "/settings";
  return NextResponse.redirect(new URL(next, req.nextUrl.origin));
}
