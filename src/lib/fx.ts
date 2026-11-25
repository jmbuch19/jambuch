import "server-only";
import { adminClient } from "@/lib/supabase-admin";

// The day's USD → INR rate, for anything we pay for in dollars (ElevenLabs credits,
// Claude tokens). Never a fixed number in code or settings (Jaydeep, 25 Nov 2026).
//
// Fetched once a day by the daily job and kept in settings row `fx.usd_inr`:
//   { rate, date, source, fetched_at }
// Sources: Frankfurter (European Central Bank reference rates), then open.er-api.com.
// A rate that is missing, absurd, or moved more than 8% from the last good one is not
// used: the last good rate stays and the job reports it. Quotes store the rate they used.

export type Fx = { rate: number; date: string; source: string; fetched_at: string };

const KEY = "fx.usd_inr";
const SANE_MIN = 50;
const SANE_MAX = 200;
const MAX_DAILY_MOVE = 0.08;

async function fromFrankfurter(): Promise<Omit<Fx, "fetched_at"> | null> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR", { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { date?: string; rates?: { INR?: number } };
  return j.rates?.INR ? { rate: j.rates.INR, date: j.date ?? "", source: "Frankfurter (ECB reference rate)" } : null;
}

async function fromErApi(): Promise<Omit<Fx, "fetched_at"> | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { time_last_update_utc?: string; rates?: { INR?: number } };
  const date = j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString().slice(0, 10) : "";
  return j.rates?.INR ? { rate: j.rates.INR, date, source: "open.er-api.com" } : null;
}

export async function storedFx(): Promise<Fx | null> {
  const { data } = await adminClient().from("settings").select("value").eq("key", KEY).maybeSingle();
  const v = data?.value as Fx | undefined;
  return v && typeof v.rate === "number" && v.rate > 0 ? v : null;
}

// Fetch today's rate and store it. Returns what happened, for the daily job's report.
export async function refreshFx(): Promise<{ ok: boolean; fx: Fx | null; note?: string }> {
  const last = await storedFx();
  let got: Omit<Fx, "fetched_at"> | null = null;
  for (const source of [fromFrankfurter, fromErApi]) {
    try {
      got = await source();
    } catch {
      got = null;
    }
    if (got && got.rate >= SANE_MIN && got.rate <= SANE_MAX) break;
    got = null;
  }
  if (!got) return { ok: false, fx: last, note: "no source answered with a sensible rate; keeping the last one" };
  if (last && Math.abs(got.rate - last.rate) / last.rate > MAX_DAILY_MOVE) {
    return { ok: false, fx: last, note: `rate jumped from ${last.rate} to ${got.rate}; kept ${last.rate} until checked` };
  }
  const fx: Fx = { ...got, rate: Math.round(got.rate * 10000) / 10000, fetched_at: new Date().toISOString() };
  await adminClient().from("settings").upsert({ key: KEY, value: fx, updated_at: fx.fetched_at });
  return { ok: true, fx };
}

// The rate to price with now: the stored one; if none has ever been stored (first run),
// fetch it once. Throws only if no rate can be had at all, so nothing is ever priced on a
// guessed rate.
export async function usdInr(): Promise<Fx> {
  const fx = await storedFx();
  if (fx) {
    // Older than 3 days (the daily job failed): try to refresh, but still price with the
    // last good rate if that fails.
    if (Date.now() - Date.parse(fx.fetched_at) > 3 * 86400_000) {
      const r = await refreshFx().catch(() => null);
      if (r?.fx) return r.fx;
    }
    return fx;
  }
  const r = await refreshFx();
  if (!r.fx) throw new Error("No USD→INR rate available yet.");
  return r.fx;
}
