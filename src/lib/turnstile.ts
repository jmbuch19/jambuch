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
  if (!secret || hostnames.size === 0) {
    console.warn("turnstile: TURNSTILE_SECRET_KEY or TURNSTILE_HOSTNAMES is not set");
    return false;
  }
  if (!token || token.length > 2048) {
    console.warn("turnstile: no usable token for", action, "(sent before the check finished, or the browser blocked it)");
    return false;
  }

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
    if (!res.ok) {
      console.warn("turnstile: siteverify answered", res.status, "for", action);
      return false;
    }
    const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    const ok = data.success === true && data.action === action && hostnames.has(data.hostname ?? "");
    // Why a check failed, so a visitor's "the spam check didn't go through" can be traced.
    if (!ok) {
      console.warn("turnstile failed:", {
        form: action,
        success: data.success,
        errors: data["error-codes"],
        tokenAction: data.action,
        hostname: data.hostname,
      });
    }
    return ok;
  } catch (e) {
    console.warn("turnstile: siteverify unreachable for", action, e instanceof Error ? e.message : e);
    return false;
  }
}
