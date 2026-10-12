import { Capture } from "@/components/capture";
import { firstName } from "@/components/people";
import { AutoRefresh, Shell } from "@/components/shell";
import { TimezoneSync } from "@/components/timeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";

// Server actions here may hand work to the user's AI after responding (summaries, brief updates).
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [proposed, proposedEvents, suggestions, keys, asks, founders, open] = await Promise.all([
    db.task.count({ where: { status: "proposed" } }),
    db.event.count({ where: { status: "proposed" } }),
    db.suggestion.count({ where: { status: "open" } }),
    db.aiKey.count({ where: { userId: user.id } }),
    db.ask.count({ where: { toId: user.id, status: "open" } }),
    listFounders(),
    db.task.groupBy({ by: ["assigneeId", "status"], _count: true, where: { status: { in: ["todo", "doing", "blocked"] } } }),
  ]);
  const team = founders.map((f) => ({
    id: f.id,
    name: f.name,
    email: f.email,
    color: f.color,
    invited: !f.joinedAt,
    open: open.filter((g) => g.assigneeId === f.id).reduce((n, g) => n + g._count, 0),
    blocked: open.find((g) => g.assigneeId === f.id && g.status === "blocked")?._count ?? 0,
  }));
  return (
    <Shell user={user} team={team} reviewCount={proposed + proposedEvents + suggestions + asks}>
      {children}
      <AutoRefresh />
      <TimezoneSync current={user.timezone} pinned={user.timezonePinned} />
      <Capture hasKey={keys > 0} autoAI={user.autoAI} color={user.color} firstName={firstName(user)} userTz={user.timezone} />
    </Shell>
  );
}
