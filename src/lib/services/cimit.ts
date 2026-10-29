import type { Actor } from "../actor";
import { db } from "../db";
import { driveFetch } from "../google";
import { logActivity } from "./activity";
import { fileMeta } from "./drive";

/**
 * The CIMIT checklist lives in a Google Sheet and stays there: this reads it live
 * and writes ticks straight back, so the sheet and the app can never disagree.
 */

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const KEY = "cimit.sheetId";

export type CimitItem = { text: string; done: boolean; cell: string };
export type CimitStage = { name: string; description: string; items: CimitItem[][] };
export type Cimit = { id: string; url: string; tracks: string[]; stages: CimitStage[] };

export async function cimitSheetId() {
  return (await db.setting.findUnique({ where: { key: KEY } }))?.value ?? null;
}

export async function setCimitSheet(fileId: string) {
  const meta = await fileMeta(fileId);
  if (meta.mimeType !== "application/vnd.google-apps.spreadsheet") throw new Error(`"${meta.name}" is not a Google Sheet`);
  await db.setting.upsert({ where: { key: KEY }, update: { value: meta.id }, create: { key: KEY, value: meta.id } });
  return meta;
}

const column = (i: number): string => (i >= 26 ? column(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const clean = (v: unknown) => String(v ?? "").replace(/^\s*•\s*/, "").replace(/\s+/g, " ").trim();

/**
 * Parses the sheet's layout: a header row with "Stage", a description column, then
 * one column per track (Clinical, Business…) each followed by its checkbox column.
 * A row with a stage name starts a stage; rows under it add items to it.
 */
export function parseCimit(rows: unknown[][], sheet: string): Pick<Cimit, "tracks" | "stages"> {
  const head = rows.findIndex((r) => r.some((c) => clean(c).toLowerCase() === "stage"));
  if (head < 0) throw new Error('The sheet has no header row with a "Stage" column');
  const header = rows[head].map(clean);
  const stageCol = header.findIndex((c) => c.toLowerCase() === "stage");
  const trackCols = header.map((c, i) => (i > stageCol + 1 && c ? i : -1)).filter((i) => i >= 0);
  const tracks = trackCols.map((i) => header[i]);
  const quoted = `'${sheet.replace(/'/g, "''")}'`;

  const stages: CimitStage[] = [];
  rows.slice(head + 1).forEach((row, n) => {
    const name = clean(row[stageCol]);
    if (name) stages.push({ name, description: clean(row[stageCol + 1]), items: tracks.map(() => []) });
    const stage = stages.at(-1);
    if (!stage) return;
    trackCols.forEach((col, t) => {
      const text = clean(row[col]);
      if (text) stage.items[t].push({ text, done: row[col + 1] === true, cell: `${quoted}!${column(col + 1)}${head + n + 2}` });
    });
  });
  return { tracks, stages };
}

export async function readCimit(): Promise<Cimit | null> {
  const id = await cimitSheetId();
  if (!id) return null;
  // No sheet name in the range means the first tab; the response says which tab that was.
  const res = await driveFetch(`${SHEETS}/${encodeURIComponent(id)}/values/A1:Z300?valueRenderOption=UNFORMATTED_VALUE`);
  const data: { range: string; values?: unknown[][] } = await res.json();
  const sheet = data.range.slice(0, data.range.lastIndexOf("!")).replace(/^'|'$/g, "").replace(/''/g, "'");
  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, ...parseCimit(data.values ?? [], sheet) };
}

/** Ticks or unticks one item. Only checklist cells can be written, and only TRUE/FALSE. */
export async function setCimitItem(actor: Actor, cell: string, done: boolean) {
  const sheet = await readCimit();
  if (!sheet) throw new Error("No CIMIT sheet is connected");
  const item = sheet.stages.flatMap((s) => s.items.flat()).find((i) => i.cell === cell);
  if (!item) throw new Error("That item is no longer in the sheet. Refresh and try again.");
  await driveFetch(`${SHEETS}/${encodeURIComponent(sheet.id)}/values/${encodeURIComponent(cell)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: [[done]] }),
  });
  await db.$transaction((tx) => logActivity(tx, actor, "drive", sheet.id, "updated", `${done ? "Ticked" : "Unticked"} "${item.text}" on the CIMIT checklist`));
}
