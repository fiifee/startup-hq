import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { GoalEditor, ProgressBar } from "@/components/goals";
import { Byline } from "@/components/people";
import { SuggestionCard } from "@/components/suggestions";
import { QuickAddTask, TaskList } from "@/components/tasks";
import { cardCls, formatDate, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { getGoalDetail } from "@/lib/services/goals";
import { listFounders } from "@/lib/services/people";
import { feedItems } from "@/lib/view";

export default async function GoalPage(props: PageProps<"/goals/[number]">) {
  const user = await requireUser();
  const { number } = await props.params;
  const goal = await getGoalDetail(number).catch(() => null);
  if (!goal) notFound();
  const [founders, activity, suggestions] = await Promise.all([
    listFounders(),
    recentActivity({ entityType: "goal", entityId: goal.id, limit: 30 }),
    db.suggestion.findMany({ where: { entityType: "goal", entityId: goal.id, status: "open" } }),
  ]);
  const open = goal.tasks.filter((t) => !["done", "dropped"].includes(t.status));
  const closed = goal.tasks.filter((t) => ["done", "dropped"].includes(t.status));
  const owner = founders.find((f) => f.id === goal.ownerId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href="/goals" className="hover:text-ink">Goals</Link>
        <span>/</span>
        <span className="tabular">G-{goal.number}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          Added by <Byline founders={founders} byId={goal.createdById} agent={goal.createdAgent} size="xs" /> · {formatDate(goal.createdAt)}
        </span>
      </div>
      <div className={`${cardCls} p-4`}>
        <ProgressBar done={goal.progress.done} total={goal.progress.total} color={owner?.color} />
      </div>
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          founders={founders}
          suggestion={s}
          changes={Object.entries(s.proposed as Record<string, string>).map(([field, after]) => ({
            label: field === "title" ? "Goal" : "Description",
            before: field === "title" ? goal.title : goal.description,
            after,
          }))}
        />
      ))}
      <section className={`${cardCls} p-4 md:p-5`}>
        <GoalEditor goal={goal} founders={founders} />
      </section>
      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Tasks <span className="text-ink-3 font-normal">{open.length} open</span></h2>
        <TaskList tasks={open.map((t) => ({ ...t, goal: null }))} founders={founders} empty="No open tasks for this goal." />
        <div className="p-3 border-t border-line"><QuickAddTask founders={founders} me={user.id} goal={String(goal.number)} /></div>
        {closed.length > 0 && (
          <details className="border-t border-line">
            <summary className="px-4 py-2.5 text-sm text-ink-2 cursor-pointer">{closed.length} done or dropped</summary>
            <TaskList tasks={closed.map((t) => ({ ...t, goal: null }))} founders={founders} />
          </details>
        )}
      </section>
      <details className={cardCls}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">History</summary>
        <ActivityFeed items={feedItems(activity)} founders={founders} />
      </details>
    </div>
  );
}
