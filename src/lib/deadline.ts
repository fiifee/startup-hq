/**
 * Read a deadline out of everyday wording, in English and Estonian:
 * "before Friday", "by tomorrow", "end of the week", "by 15.10", "in 3 days",
 * "reedeks", "homseks", "nädala lõpuks". Works on calendar dates only (the
 * caller supplies today's date in the writer's time zone). Runs anywhere.
 */
export type Deadline = { date: string; phrase: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const WEEKDAYS: [RegExp, number][] = [
  [/^(sun(day)?|pühapäev(aks)?|p)$/, 0],
  [/^(mon(day)?|esmaspäev(aks)?)$/, 1],
  [/^(tue(s|sday)?|teisipäev(aks)?)$/, 2],
  [/^(wed(nesday)?|kolmapäev(aks)?)$/, 3],
  [/^(thu(r|rs|rsday)?|neljapäev(aks)?)$/, 4],
  [/^(fri(day)?|reede(ks)?)$/, 5],
  [/^(sat(urday)?|laupäev(aks)?)$/, 6],
];
const WEEKDAY_WORDS =
  "monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun|esmaspäevaks|teisipäevaks|kolmapäevaks|neljapäevaks|reedeks|laupäevaks|pühapäevaks|esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev|pühapäev";
const MONTHS: [RegExp, number][] = [
  [/^jan/, 1], [/^(feb|veebr)/, 2], [/^(mar|märts)/, 3], [/^apr/, 4], [/^mai|^may/, 5], [/^(jun|juuni)/, 6],
  [/^(jul|juuli)/, 7], [/^aug/, 8], [/^sep/, 9], [/^(oct|okt)/, 10], [/^nov/, 11], [/^dets|^dec/, 12],
];
const MONTH_WORDS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec|jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember|okt|dets";

function weekdayOf(word: string) {
  return WEEKDAYS.find(([re]) => re.test(word))?.[1] ?? null;
}

/** Next date with that weekday, today included ("by Friday" on a Friday is today). */
function comingWeekday(today: Date, wd: number) {
  return addDays(today, (wd - today.getUTCDay() + 7) % 7);
}

/** `today` is "YYYY-MM-DD" in the writer's zone. */
export function parseDeadline(text: string, today: string): Deadline | null {
  // "after next week" / "pärast reedet" name a start, not a deadline: leave those to a person.
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `.replace(/\b(after|from|starting|alates|pärast) (next |the )?\w+/g, " ");
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  // Report the words as the writer typed them (the matching works on lowercased text),
  // with a leading "by"/"before"/… when there is one.
  const original = (phrase: string) => {
    const words = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const m = text.match(new RegExp(`(?:\\b(?:by|before|until|till|on|latest|enne|hiljemalt)\\s+)?${words}`, "i"));
    return (m?.[0] ?? phrase).trim();
  };
  const hit = (date: Date, phrase: string): Deadline => ({ date: iso(date), phrase: original(phrase) });
  let r: RegExpMatchArray | null;

  // Explicit dates first: 2026-10-15, 15.10(.26), 15/10, "15 Oct", "Oct 15".
  if ((r = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return hit(new Date(Date.UTC(+r[1], +r[2] - 1, +r[3])), r[0]);
  if ((r = t.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/))) {
    const dd = +r[1], mm = +r[2];
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      let yy = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : y;
      let date = new Date(Date.UTC(yy, mm - 1, dd));
      if (!r[3] && date < base) date = new Date(Date.UTC(++yy, mm - 1, dd));
      if (date.getUTCDate() === dd) return hit(date, r[0]);
    }
  }
  const dayMonth = t.match(new RegExp(`\\b(\\d{1,2})\\.?\\s*(${MONTH_WORDS})\\b`)) ?? null;
  const monthDay = t.match(new RegExp(`\\b(${MONTH_WORDS})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?\\b`)) ?? null;
  if (dayMonth || monthDay) {
    const dd = dayMonth ? +dayMonth[1] : +monthDay![2];
    const word = dayMonth ? dayMonth[2] : monthDay![1];
    const mm = MONTHS.find(([re]) => re.test(word))?.[1];
    if (mm && dd >= 1 && dd <= 31) {
      let date = new Date(Date.UTC(y, mm - 1, dd));
      if (date < base) date = new Date(Date.UTC(y + 1, mm - 1, dd));
      return hit(date, (dayMonth ?? monthDay)![0]);
    }
  }

  // Relative words.
  if ((r = t.match(/\b(today|tonight|end of (the )?day|eod|täna|tänaseks|täna õhtuks)\b/))) return hit(base, r[0]);
  if ((r = t.match(/\b(day after tomorrow|ülehomme|ülehommeks)\b/))) return hit(addDays(base, 2), r[0]);
  if ((r = t.match(/\b(tomorrow|tmrw|homme|homseks)\b/))) return hit(addDays(base, 1), r[0]);
  if ((r = t.match(/\b(end of (the |this )?week|eow|this week|nädala lõpuks|selle nädala jooksul|nädala lõpp)\b/))) return hit(comingWeekday(base, 5), r[0]);
  if ((r = t.match(/\b(end of (the |this )?month|kuu lõpuks)\b/))) return hit(new Date(Date.UTC(y, m, 0)), r[0]);
  if ((r = t.match(/\b((by |before )?next week|järgmiseks nädalaks|järgmisel nädalal)\b/))) return hit(addDays(comingWeekday(addDays(base, 1), 1), 0), r[0]);
  if ((r = t.match(/\bin (\d{1,2}|a|one|two|three) (day|days|week|weeks)\b/))) {
    const n = { a: 1, one: 1, two: 2, three: 3 }[r[1] as "a"] ?? +r[1];
    return hit(addDays(base, r[2].startsWith("week") ? n * 7 : n), r[0]);
  }
  if ((r = t.match(/\b(\d{1,2}) (päeva|nädala) pärast\b/))) return hit(addDays(base, r[2] === "nädala" ? +r[1] * 7 : +r[1]), r[0]);

  // Weekdays: "before Friday", "by next Tue", "reedeks", "on Monday".
  if ((r = t.match(new RegExp(`\\b(next |järgmiseks |järgmisel )?(${WEEKDAY_WORDS})\\b`)))) {
    const wd = weekdayOf(r[2]);
    if (wd !== null) {
      // "by Friday" is the coming Friday (today if it is Friday). "next Friday" is the
      // one in next week: the coming one if that already is next week, else a week on.
      let date = comingWeekday(base, wd);
      if (r[1]) {
        const daysToSunday = (7 - base.getUTCDay()) % 7;
        const ahead = Math.round((date.getTime() - base.getTime()) / 86_400_000);
        if (ahead <= daysToSunday) date = addDays(date, 7);
      }
      return hit(date, r[0]);
    }
  }
  return null;
}

/** Words that hint at a deadline the simple reader may have missed (worth asking the AI). */
export function hintsAtDeadline(text: string) {
  return /\b(by|before|until|till|deadline|due|latest|asap|enne|hiljemalt|tähtaeg|kuni)\b|\w+ks\b/i.test(text);
}
