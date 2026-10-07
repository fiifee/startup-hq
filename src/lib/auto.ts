/**
 * Work a user's AI does by itself when they switch on "Let my AI work
 * automatically". It always runs on that user's own key, after the response has
 * been sent, so nobody waits for it.
 */
import { db } from "./db";
import { processMeetingWithKey } from "./process-meeting";
import { briefNote, briefStaleness, refreshBriefWithKey } from "./services/brief";

/** Changes since the brief's story was last updated before an automatic refresh. */
export const BRIEF_REFRESH_AFTER = 10;
const LOCK_KEY = "brief.refreshingUntil";

async function canWork(userId: string) {
  const [user, keys] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { autoAI: true } }),
    db.aiKey.count({ where: { userId } }),
  ]);
  return !!user?.autoAI && keys > 0;
}

/** Summarise a meeting that has a transcript and no summary yet. */
export async function autoSummarise(userId: string, meetingId: string) {
  try {
    if (!(await canWork(userId))) return;
    const m = await db.meeting.findUnique({ where: { id: meetingId }, select: { transcript: true, processedAt: true } });
    if (!m || m.processedAt || !m.transcript.trim()) return;
    await processMeetingWithKey(userId, meetingId);
  } catch (e) {
    console.error("auto summarise failed", meetingId, e);
  }
}

/**
 * Once enough has happened, bring the brief's story up to date. A short lease in
 * Settings stops two users' actions from refreshing it at the same time.
 */
export async function maybeRefreshBrief(userId: string) {
  try {
    if (!(await canWork(userId))) return;
    const note = await briefNote();
    const { changes } = await briefStaleness(note.id);
    if (changes.length < BRIEF_REFRESH_AFTER) return;
    const now = Date.now();
    const until = new Date(now + 5 * 60_000).toISOString();
    // Take the lease only if nobody holds a live one.
    const taken = await db.$executeRaw`
      INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (${LOCK_KEY}, ${until}, now())
      ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()
      WHERE "Setting"."value" < ${new Date(now).toISOString()}`;
    if (taken === 0) return;
    // Success frees the lease; a failure (e.g. a revoked key) holds it for 30 minutes,
    // so a broken key is not retried on every click.
    let release = new Date(0);
    try {
      await refreshBriefWithKey(userId);
    } catch (e) {
      release = new Date(Date.now() + 30 * 60_000);
      throw e;
    } finally {
      await db.setting.update({ where: { key: LOCK_KEY }, data: { value: release.toISOString() } });
    }
  } catch (e) {
    console.error("auto brief refresh failed", e);
  }
}

/** Who writes the Monday summary: the owner if they opted in, else any user who did. */
export async function digestUserId(): Promise<string | null> {
  const users = await db.user.findMany({
    where: { autoAI: true, aiKeys: { some: {} } },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return users[0]?.id ?? null;
}
