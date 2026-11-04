import "server-only";
import { cookies } from "next/headers";
import { isAdminEmail } from "./admin";
import { sessionClient } from "./supabase-server";

// Whether this request comes from the admin, so their own reading and
// listening aren't counted. Only a signed-in visitor can be the admin, and only
// they carry a Supabase session cookie, so ordinary visitors never cost an
// extra sign-in check.
export async function isAdminVisit() {
  const store = await cookies();
  if (!store.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) return false;
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  return isAdminEmail(user?.email);
}
