import { isRevertible } from "./services/activity";

/** Activity rows shaped for the feed component. */
export function feedItems(rows: { id: string; summary: string; byId: string | null; agent: string | null; createdAt: Date; revertedAt: Date | null; entityType: string; action: string }[]) {
  return rows.map((a) => ({
    id: a.id,
    summary: a.summary,
    byId: a.byId,
    agent: a.agent,
    createdAt: a.createdAt,
    revertedAt: a.revertedAt,
    revertible: isRevertible(a),
  }));
}

/** A moment `days` ago, for date filters in server components. */
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

/** Whether `date` is within the last `minutes`. */
export function isRecent(date: Date, minutes: number) {
  return Date.now() - date.getTime() < minutes * 60_000;
}
