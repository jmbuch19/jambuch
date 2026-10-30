import "server-only";
import { headers } from "next/headers";

// A Turnstile token counts only if Cloudflare says it passed, it was issued
// for this form (the action given to turnstile.render), and it was solved on
// one of our own hostnames (TURNSTILE_HOSTNAMES, comma-separated; never
// include localhost in production).
export async function passesTurnstile(token: string, action: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const hostnames = new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );
  if (!secret || hostnames.size === 0 || !token || token.length > 2048) return false;

  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip.trim());
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    return data.success === true && data.action === action && hostnames.has(data.hostname ?? "");
  } catch {
    return false;
  }
}
