import { generateText, Output } from "ai";
import { z } from "zod";
import { modelFor } from "./llm";
import { cleanLinks, extractUrls, isJoinLink, unwrap, type EventLink } from "./links";
import { formatDay, isValidTz, parseWhen, ymd } from "./time";

/**
 * Pull events out of pasted text (an email, a newsletter) with the user's own
 * AI. The model only reads dates and times as written plus the zone they are in;
 * converting to an instant is done here, in code, so the clock is never guessed.
 */
const schema = z.object({
  events: z.array(
    z.object({
      title: z.string().describe("Short, specific; in the language of the text"),
      kind: z.enum(["event", "deadline", "opportunity"]).describe("deadline = something due; opportunity = a call/programme; its date is the apply-by date"),
      importance: z.enum(["mandatory", "recommended", "optional"]).describe("mandatory only if the text says attendance/submission is required"),
      date: z.string().describe("YYYY-MM-DD as stated in the text (resolve relative words like 'next Friday' against the reference date)"),
      time: z.string().nullable().describe("HH:MM 24h as stated, or null if no time is given"),
      endDate: z.string().nullable(),
      endTime: z.string().nullable(),
      timezone: z.string().describe("IANA zone the stated time is in: the zone written in the text if any, else where the event takes place, else the reader's zone"),
      location: z.string().nullable(),
      links: z
        .array(z.object({ label: z.string().describe('Short: "Join Zoom", "Register", "Agenda (PDF)"; add a passcode if the text gives one, e.g. "Join Zoom (passcode 482913)"'), url: z.string() }))
        .describe("Every link that matters for this event (join/video call first, then registration, agenda, materials), copied exactly from the text. Never invent or shorten links."),
      description: z.string().describe("1-2 sentences: what it is and what to do"),
      dateText: z.string().describe("The exact words in the text that give the date and time, copied verbatim"),
    }),
  ),
});

const ABBREVIATIONS = `Time zone abbreviations: CET/CEST → Europe/Berlin (unless the place says otherwise, e.g. Paris → Europe/Paris, Copenhagen → Europe/Copenhagen); EET/EEST → Europe/Tallinn (Helsinki → Europe/Helsinki, Riga → Europe/Riga); GMT/BST/UK time → Europe/London; UTC → UTC; ET/EST/EDT → America/New_York; PT/PST/PDT → America/Los_Angeles; IST (India) → Asia/Kolkata. Online events with a zone given: that zone. Online events with none: the organiser's zone if obvious, else the reader's.`;

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  pühapäev: 0, esmaspäev: 1, teisipäev: 2, kolmapäev: 3, neljapäev: 4, reede: 5, laupäev: 6,
};

export type ExtractedEvent = Omit<z.infer<typeof schema>["events"][number], "links"> & { links: EventLink[]; warnings: string[] };

export async function extractEvents(userId: string, userTz: string, text: string): Promise<{ events: ExtractedEvent[]; agent: string }> {
  const m = await modelFor(userId);
  if (!m) throw new Error("Add your own AI key in Settings to read events from text.");
  const now = new Date();
  const today = `${ymd(now, userTz)} (${formatDay(now, userTz)})`;

  const { output } = await generateText({
    model: m.model,
    output: Output.object({ schema }),
    system: [
      "You extract calendar entries from text a startup founder pasted (usually an email or newsletter).",
      "Return every distinct dated event, deadline or opportunity in it; one entry per date that matters (an event and its registration deadline are two entries). Ignore dates that are only context (when the email was sent, past events). Return an empty list if there are none.",
      "Copy dates and times exactly as stated; never shift them to another zone yourself. Use 24h HH:MM. If a time range is given, put the end in endTime.",
      ABBREVIATIONS,
      `Reference date for resolving relative dates: the email's own sent date if it shows one, else today, ${today}. The reader's zone is ${userTz}. If a date has no year, use the next occurrence on or after the reference date.`,
    ].join("\n"),
    prompt: text.slice(0, 30_000),
  });

  return { events: checkDrafts(output.events, userTz, now, text), agent: m.agent };
}

/**
 * Validate what the model read: a real zone, a readable date, not in the past,
 * and a weekday named in the text that matches the date.
 */
export function checkDrafts(raw: z.infer<typeof schema>["events"], userTz: string, now = new Date(), sourceText = ""): ExtractedEvent[] {
  // Only links that are really in the pasted text survive; a meeting link the model
  // missed is added when there is a single event to attach it to.
  const inText = extractUrls(sourceText);
  const present = (u: string) => !sourceText || inText.includes(u.replace(/[.,;:!?*>)\]]+$/, "")) || sourceText.includes(u);
  return raw.map((e) => {
    const warnings: string[] = [];
    let timezone = e.timezone;
    if (!isValidTz(timezone)) {
      warnings.push(`Unknown time zone "${timezone}"; using ${userTz}. Check it.`);
      timezone = userTz;
    }
    let start: Date | null = null;
    try {
      start = parseWhen(e.time ? `${e.date} ${e.time}` : e.date, timezone).date;
    } catch {
      warnings.push("The date could not be read; fill it in.");
    }
    if (start && start.getTime() < now.getTime() - 86_400_000) warnings.push("This date is in the past.");
    // The text names a weekday: check it agrees with the date.
    const named = e.dateText.toLowerCase().match(/[a-zäöüõš]+/g)?.find((w) => w in WEEKDAYS);
    if (named && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      const [y, mo, d] = e.date.split("-").map(Number);
      const actual = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
      if (actual !== WEEKDAYS[named]) {
        warnings.push(`The text says "${named}", but ${e.date} is a ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][actual]}. Check the date.`);
      }
    }
    const kept = (e.links ?? []).filter((l) => present(l.url));
    if (kept.length < (e.links ?? []).length) warnings.push("Some links were not in the text and were left out.");
    if (raw.length === 1) {
      for (const u of inText) {
        const real = unwrap(u);
        if (isJoinLink(real) && !kept.some((l) => unwrap(l.url) === real)) kept.push({ label: "", url: real });
      }
    }
    return { ...e, timezone, links: cleanLinks(kept), warnings };
  });
}
