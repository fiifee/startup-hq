import { db } from "../db";

const KEY = "meeting.format";
export const DEFAULT_FORMAT = ["Summary", "Decisions", "Action items", "Open questions"];

/** The sections every meeting summary uses, in order. Chosen once for the team. */
export async function getMeetingFormat(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_FORMAT;
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) && list.length ? list.map(String) : DEFAULT_FORMAT;
  } catch {
    return DEFAULT_FORMAT;
  }
}

export async function setMeetingFormat(sections: string[]) {
  const clean = sections.map((s) => s.replace(/^#+\s*/, "").trim()).filter(Boolean).slice(0, 12);
  if (!clean.length) throw new Error("Add at least one section");
  const value = JSON.stringify(clean);
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return clean;
}

/** How to word the format rule for an AI. */
export function formatInstruction(sections: string[]) {
  return `Write the summary with exactly these sections, as "## " headings in this order: ${sections.map((s) => `"${s}"`).join(", ")}. Translate the headings into the language you are writing in. Leave a section out only if there is truly nothing for it.`;
}
