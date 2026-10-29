import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Signed-in client for admin pages and actions. It carries the visitor's
// session cookie, so row-level security decides what it may read and write.
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Pages can't set cookies; middleware.ts refreshes the session instead.
        }
      },
    },
  });
}
