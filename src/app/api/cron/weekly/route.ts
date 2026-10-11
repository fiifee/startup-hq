import { digestUserId } from "@/lib/auto";
import { refreshBriefWithKey } from "@/lib/services/brief";
import { generateWeeklySummary } from "@/lib/services/weekly";

export const maxDuration = 120;

/** Vercel Cron, Mondays. Runs on the key of a user who lets their AI work automatically, if any. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const userId = await digestUserId();
  const note = await generateWeeklySummary(userId);
  // The same key keeps the company brief's story current once a week.
  const brief = userId ? await refreshBriefWithKey(userId).catch((e) => ({ error: String(e) })) : null;
  return Response.json({ ok: true, noteId: note.id, brief });
}
