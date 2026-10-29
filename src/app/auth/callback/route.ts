import { NextResponse, type NextRequest } from "next/server";
import { sessionClient } from "@/lib/supabase-server";

// The sign-in email links here with a one-time code; swap it for a session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/admin";
  // Only ever send people back inside the site.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  if (code) {
    const db = await sessionClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
    console.error("sign-in code exchange failed:", error.message);
  }
  return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
}
