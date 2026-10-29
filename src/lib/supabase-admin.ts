import "server-only";
import { createClient } from "@supabase/supabase-js";

// Full-access client for trusted server code only (it bypasses row-level
// security). "server-only" makes the build fail if a browser component imports it.
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
