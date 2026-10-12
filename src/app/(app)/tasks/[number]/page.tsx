import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { Byline } from "@/components/people";
import { SuggestionCard } from "@/components/suggestions";
import { AskButton, AskThread } from "@/components/asks";
import { CommentBox, CommentItem, DriveLinks, TaskEditor } from "@/components/task-editor";
import { cardCls, formatDate, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { listFounders } from "@/lib/services/people";
import { listAsks } from "@/lib/services/asks";
import { getTaskDetail } from "@/lib/services/tasks";
import { feedItems } from "@/lib/view";

export default async function TaskPage(props: PageProps<"/tasks/[number]">) {
  const user = await requireUser();
  const { number } = await props.params;
  const task = await getTaskDetail(number).catch(() => null);
  if (!task) notFound();
  const [founders, activity, suggestions, goals, asks] = await Promise.all([
    listFounders(),
    recentActivity({ entityType: "task", entityId: task.id, limit: 50 }),
    db.suggestion.findMany({ where: { entityType: "task", entityId: task.id, status: "open" }, orderBy: { createdAt: "asc" } }),
    db.goal.findMany({ where: { OR: [{ status: "active" }, ...(task.goalId ? [{ id: task.goalId }] : [])] }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    listAsks({ entityType: "task", entityId: task.id, status: ["open", "answered", "declined"] }),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href="/tasks" className="hover:text-ink">Tasks</Link>
        <span>/</span>
        <span className="ref">T-{task.number}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          Created by <Byline founders={founders} byId={task.createdById} agent={task.createdAgent} size="xs" /> · {formatDate(task.createdAt)}
        </span>
      </div>
      {task.meeting && (
        <p className="text-sm text-ink-2">
          From meeting <Link href={`/meetings/${task.meeting.id}`} className="underline">{task.meeting.title}</Link> ({formatDate(task.meeting.date)})
        </p>
      )}

      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          founders={founders}
          suggestion={{ id: s.id, byId: s.byId, agent: s.agent, reason: s.reason, createdAt: s.createdAt }}
          changes={Object.entries(s.proposed as Record<string, string>).map(([field, after]) => ({
            label: field === "title" ? "Title" : "Description",
            before: field === "title" ? task.title : task.description,
            after,
          }))}
        />
      ))}

      <section className={`${cardCls} p-4 md:p-5`}>
        <TaskEditor task={task} founders={founders} goals={goals} />
      </section>

      <section className={`${cardCls} p-4 space-y-3`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className={h2Cls}>Input from the team</h2>
          <AskButton entityType="task" entityId={task.id} founders={founders} me={user.id} />
        </div>
        {asks.length === 0 && <p className="text-sm text-ink-3">Need someone to look at this? Ask for input, or write @Name in a comment.</p>}
        <AskThread asks={asks} founders={founders} me={user.id} />
      </section>

      <section className={`${cardCls} p-4 space-y-3`}>
        <h2 className={h2Cls}>Drive files</h2>
        <DriveLinks links={task.links} target={{ taskId: task.id }} founders={founders} />
      </section>

      <section className={`${cardCls}`}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Comments</h2>
        <ul className="divide-y divide-line">
          {task.comments.map((c) => <CommentItem key={c.id} comment={c} founders={founders} me={user.id} />)}
        </ul>
        <div className="p-3 border-t border-line">
          <CommentBox taskRef={String(task.number)} founders={founders} me={user.id} />
        </div>
      </section>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>History</h2>
        <ActivityFeed items={feedItems(activity)} founders={founders} />
      </section>
    </div>
  );
}
