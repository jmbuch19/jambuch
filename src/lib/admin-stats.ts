import type { SupabaseClient } from "@supabase/supabase-js";

// Small helpers shared by the admin's Readers and Listeners pages.

// Supabase returns at most 1,000 rows per request, so read in pages.
export async function allRows<T>(db: SupabaseClient, table: string, columns: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function minutes(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return "under 1 min";
  return `${Math.round(seconds / 60)} min`;
}

export const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

// 754 → "12:34"
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Total time as "45 min" or "3.2 h".
export function hoursOrMinutes(seconds: number) {
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;
}
