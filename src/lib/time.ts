/**
 * Times with places. Each user has a time zone (detected from their browser) and
 * each event has the zone it happens in. A timed event is stored as an instant;
 * an all-day event as noon UTC on its date, so its date never shifts between
 * zones. Runs on the server (UTC on Vercel) and in the browser alike.
 */
export const DEFAULT_TZ = "Europe/Tallinn";

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function offsetMs(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/**
 * "2026-10-24" → all day; "2026-10-24 14:00" (or with T) → 14:00 in `tz`.
 * Strings with Z or an offset are taken as-is.
 */
export function parseWhen(s: string, tz = DEFAULT_TZ): { date: Date; allDay: boolean } {
  const t = s.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) return { date: new Date(t), allDay: false };
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/);
  if (!m) throw new Error(`Use YYYY-MM-DD or YYYY-MM-DD HH:MM, got "${s}"`);
  const [, y, mo, d, h, mi] = m;
  if (h === undefined) return { date: new Date(Date.UTC(+y, +mo - 1, +d, 12)), allDay: true };
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // Two passes settle the offset across a daylight-saving change.
  const first = guess - offsetMs(new Date(guess), tz);
  return { date: new Date(guess - offsetMs(new Date(first), tz)), allDay: false };
}

/** "2026-10-24" for a moment in `tz` (all-day dates are read in UTC). */
export function ymd(d: Date, tz: string, allDay = false) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: allDay ? "UTC" : tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function hm(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Calendar days from today (in the viewer's zone) to the event's date. */
export function daysUntil(d: Date, viewerTz: string, allDay = false, now = new Date()) {
  return Math.round((Date.parse(ymd(d, viewerTz, allDay)) - Date.parse(ymd(now, viewerTz))) / 86_400_000);
}

/** "Sat 24 Oct", in the viewer's zone (all-day: the event's own date). */
export function formatDay(d: Date, viewerTz: string, allDay = false) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: allDay ? "UTC" : viewerTz, weekday: "short", day: "numeric", month: "short" }).format(d);
}

/** City part of an IANA zone: "Europe/Tallinn" → "Tallinn". */
export function tzCity(tz: string) {
  return tz.split("/").pop()!.replace(/_/g, " ");
}

/**
 * "Sat 24 Oct, 15:00" in the viewer's time, plus "14:00 Tallinn" when the
 * event happens in another zone and the clock differs there.
 */
export function formatWhen(d: Date, allDay: boolean, viewerTz: string, eventTz?: string) {
  const day = formatDay(d, viewerTz, allDay);
  if (allDay) return { main: day, local: null as string | null };
  const main = `${day}, ${hm(d, viewerTz)}`;
  const local = eventTz && eventTz !== viewerTz && hm(d, eventTz) !== hm(d, viewerTz) ? `${hm(d, eventTz)} ${tzCity(eventTz)}` : null;
  return { main, local };
}

/** One-line text form, for AIs and lists. */
export function whenText(d: Date, allDay: boolean, viewerTz: string, eventTz?: string) {
  const w = formatWhen(d, allDay, viewerTz, eventTz);
  return w.local ? `${w.main} (${w.local})` : w.main;
}

/** Values for <input type="date"> and <input type="time">, in the event's zone. */
export function inputValues(d: Date, allDay: boolean, tz: string) {
  return { date: ymd(d, tz, allDay), time: allDay ? "" : hm(d, tz) };
}

/** A short list of zones for the picker; the user's own is always added. */
export const COMMON_TZ = [
  "Europe/Tallinn", "Europe/Helsinki", "Europe/Riga", "Europe/Stockholm", "Europe/Copenhagen", "Europe/Berlin",
  "Europe/Amsterdam", "Europe/Paris", "Europe/London", "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "UTC",
];
