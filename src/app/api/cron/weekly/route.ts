import { db } from "@/lib/db";
import { generateWeeklySummary } from "@/lib/services/weekly";

export const maxDuration = 120;

/** Vercel Cron, Mondays. Uses the key of the founder who volunteered theirs, if any. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const setting = await db.setting.findUnique({ where: { key: "digest.userId" } });
  const note = await generateWeeklySummary(setting?.value ?? null);
  return Response.json({ ok: true, noteId: note.id });
}
