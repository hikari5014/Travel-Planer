"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_USER_ID, verifyAdminPassword } from "@/lib/auth/admin";

const COOKIE_NAME = "traveler_id";
const COOKIE_MAX_AGE_SECS = 60 * 60 * 24 * 30; // 30 days

export async function loginAsAdminAction(formData: FormData) {
  const password = (formData.get("password") as string) ?? "";
  if (!verifyAdminPassword(password)) {
    redirect("/login?error=1");
  }
  const c = await cookies();
  c.set({
    name: COOKIE_NAME,
    value: ADMIN_USER_ID,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECS,
  });
  redirect("/settings");
}

// Clears the admin cookie. Middleware will re-issue a fresh guest cookie on
// the next request, so the user is back to a clean visitor identity.
export async function logoutAction() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
  redirect("/login");
}
