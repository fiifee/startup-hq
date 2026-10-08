/** Labels that start lines in emails and invites, never speakers. */
const NOT_SPEAKERS = new Set(
  ("from to cc bcc date sent subject re fwd fw when where time location place organizer organiser host guests attendees " +
    "participants reply rsvp join link url zoom teams meeting id passcode password dial phone tel email e-mail web website " +
    "agenda note notes ps registration register deadline price cost venue address speaker speakers moderator topic " +
    "saatja saaja teema kuupäev aeg koht algus lõpp osalejad registreerimine").split(" "),
);

function speakerOf(line: string): string | null {
  const m = line.match(/^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([\p{L}][\p{L} .'-]{0,40}):\s/u);
  if (!m) return null;
  const name = m[1].trim().toLowerCase();
  if (NOT_SPEAKERS.has(name) || NOT_SPEAKERS.has(name.split(" ")[0]) || name.split(" ").length > 3) return null;
  return name;
}

/** "Liis: ..." or "[00:12] Liis: ..." — a transcript line, never a title. */
export function isSpeakerLine(line: string) {
  return speakerOf(line) !== null;
}

/**
 * Does pasted text look like a meeting transcript rather than an email, a task
 * or a note? Speakers have to dominate and recur. Runs in the browser too.
 */
export function looksLikeTranscript(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 6) return false;
  const counts = new Map<string, number>();
  for (const l of lines) {
    const s = speakerOf(l);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const speakerLines = [...counts.values()].reduce((a, b) => a + b, 0);
  const recurring = [...counts.values()].filter((n) => n >= 2).length;
  return speakerLines >= Math.max(4, lines.length * 0.4) && recurring >= 1 && counts.size <= 12;
}

const MONTHS = "jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember";

/** Text that names a date (an email invite, an announcement): a candidate event. */
export function mentionsDate(text: string) {
  const t = text.toLowerCase();
  return (
    new RegExp(`\\b\\d{1,2}\\.?\\s*(${MONTHS})\\b|\\b(${MONTHS})\\.?\\s+\\d{1,2}\\b`).test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(t)
  );
}

/** A title for pasted text: an email's subject, else its first line that isn't a header. */
export function guessTitle(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const subject = lines.find((l) => /^(subject|teema)\s*:/i.test(l));
  const isHeader = (l: string) => /^[\p{L} -]{1,20}:\s/u.test(l) && !/^(re|fwd?|fw|invitation|kutse)\s*:/i.test(l);
  const raw = subject ? subject.replace(/^[^:]+:\s*/, "") : (lines.find((l) => !isHeader(l)) ?? lines[0] ?? "");
  return raw.replace(/^((re|fwd?|fw|invitation|kutse|updated invitation)\s*:\s*)+/i, "").slice(0, 200);
}
