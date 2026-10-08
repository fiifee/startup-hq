import { Capture } from "@/components/capture";
import { firstName } from "@/components/people";
import { AutoRefresh, Shell } from "@/components/shell";
import { TimezoneSync } from "@/components/timeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Server actions here may hand work to the user's AI after responding (summaries, brief updates).
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [proposed, proposedEvents, suggestions, keys] = await Promise.all([
    db.task.count({ where: { status: "proposed" } }),
    db.event.count({ where: { status: "proposed" } }),
    db.suggestion.count({ where: { status: "open" } }),
    db.aiKey.count({ where: { userId: user.id } }),
  ]);
  return (
    <Shell user={user} reviewCount={proposed + proposedEvents + suggestions}>
      {children}
      <AutoRefresh />
      <TimezoneSync current={user.timezone} pinned={user.timezonePinned} />
      <Capture hasKey={keys > 0} autoAI={user.autoAI} color={user.color} firstName={firstName(user)} />
    </Shell>
  );
}
