// The Courtyard's weekly gathering: approved pieces wait, then join the thread
// together at a set weekday and time (India time, which has no daylight saving).

export type GatheringSetting = { weekday: number; time: string }; // weekday 0 = Sunday, time "HH:MM" IST

export const DEFAULT_GATHERING: GatheringSetting = { weekday: 0, time: "19:00" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function parseGathering(value: unknown): GatheringSetting {
  const v = (value ?? {}) as Partial<GatheringSetting>;
  const weekday = Number.isInteger(v.weekday) && v.weekday! >= 0 && v.weekday! <= 6 ? v.weekday! : DEFAULT_GATHERING.weekday;
  const time = typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? v.time : DEFAULT_GATHERING.time;
  return { weekday, time };
}

// The first gathering after `from` (a piece approved at 6:59 pm on a Sunday
// still makes that evening's gathering).
export function nextGathering(setting: GatheringSetting, from = new Date()): Date {
  const [h, m] = setting.time.split(":").map(Number);
  // Work in "IST wall-clock" by shifting, then shift back to a real instant.
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const candidate = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m));
  candidate.setUTCDate(candidate.getUTCDate() + ((setting.weekday - ist.getUTCDay() + 7) % 7));
  if (candidate.getTime() <= ist.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 7);
  return new Date(candidate.getTime() - IST_OFFSET_MS);
}

// "Sunday, 2 November 2026"
export function gatheringDay(when: string | Date) {
  return new Date(when).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// "Sun 2 Nov, 7:00 pm"
export function gatheringShort(when: string | Date) {
  return new Date(when).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function describeGathering(s: GatheringSetting) {
  const [h, m] = s.time.split(":").map(Number);
  const t = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  return `${WEEKDAYS[s.weekday]}s at ${t} IST`;
}

// The note each contributor gets on the evening of their gathering. The same
// words go in the email and in the WhatsApp-ready copy in the admin.
export function turnNote(p: { name: string; title: string; url: string }) {
  return `Your turn is in the courtyard tonight. Dear ${p.name.split(" ")[0]}, your piece “${p.title}” has joined the thread at jambuch.in: ${p.url}`;
}
