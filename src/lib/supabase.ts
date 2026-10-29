import { createClient } from "@supabase/supabase-js";

// Read-only client for public pages. Uses the anon key, so row-level security
// limits it to published rows. Never import the service role key here.
export function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
