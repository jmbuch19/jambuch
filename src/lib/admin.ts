import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "./supabase-server";

export function isAdminEmail(email: string | null | undefined) {
  const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!allowed && email?.trim().toLowerCase() === allowed;
}

// Gate for every admin page and action. Two checks: the signed-in email is
// ADMIN_EMAIL, and the members row has role 'admin' (granted by hand in SQL;
// the database policies rely on that role, so the email alone is not enough).
export async function requireAdmin() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  if (!isAdminEmail(user.email)) redirect("/admin/login?error=not-allowed");

  const { data: member } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin") redirect("/admin/login?error=no-role");

  return { db, user };
}
