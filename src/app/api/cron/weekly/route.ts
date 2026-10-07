import { db } from "@/lib/db";
import { refreshBriefWithKey } from "@/lib/services/brief";
import { generateWeeklySummary } from "@/lib/services/weekly";

export const maxDuration = 120;

/** Vercel Cron, Mondays. Uses the key of the user who volunteered theirs, if any. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const setting = await db.setting.findUnique({ where: { key: "digest.userId" } });
  const note = await generateWeeklySummary(setting?.value ?? null);
  // The same key keeps the company brief's story current once a week.
  const brief = setting?.value ? await refreshBriefWithKey(setting.value).catch((e) => ({ error: String(e) })) : null;
  return Response.json({ ok: true, noteId: note.id, brief });
}
