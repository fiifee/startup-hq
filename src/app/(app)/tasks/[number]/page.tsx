import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { Markdown } from "@/components/markdown";
import { Byline } from "@/components/people";
import { SuggestionCard } from "@/components/suggestions";
import { CommentBox, DriveLinks, TaskEditor } from "@/components/task-editor";
import { cardCls, formatDate, h2Cls, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { listFounders } from "@/lib/services/people";
import { getTaskDetail } from "@/lib/services/tasks";
import { feedItems } from "@/lib/view";

export default async function TaskPage(props: PageProps<"/tasks/[number]">) {
  await requireUser();
  const { number } = await props.params;
  const task = await getTaskDetail(number).catch(() => null);
  if (!task) notFound();
  const [founders, activity, suggestions] = await Promise.all([
    listFounders(),
    recentActivity({ entityType: "task", entityId: task.id, limit: 50 }),
    db.suggestion.findMany({ where: { entityType: "task", entityId: task.id, status: "open" }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href="/tasks" className="hover:text-ink">Tasks</Link>
        <span>/</span>
        <span className="tabular">T-{task.number}</span>
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
        <TaskEditor task={task} founders={founders} />
      </section>

      <section className={`${cardCls} p-4 space-y-3`}>
        <h2 className={h2Cls}>Drive files</h2>
        <DriveLinks links={task.links} target={{ taskId: task.id }} founders={founders} />
      </section>

      <section className={`${cardCls}`}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Comments</h2>
        <ul className="divide-y divide-line">
          {task.comments.map((c) => (
            <li key={c.id} className={`px-4 py-3 ${c.agent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: founders.find((f) => f.id === c.byId)?.color }}>
              <div className="flex items-center gap-2 mb-1">
                <Byline founders={founders} byId={c.byId} agent={c.agent} size="xs" />
                <span className="text-xs text-ink-3">{relative(c.createdAt)}</span>
              </div>
              <Markdown className="text-sm">{c.body}</Markdown>
            </li>
          ))}
        </ul>
        <div className="p-3 border-t border-line">
          <CommentBox taskRef={String(task.number)} />
        </div>
      </section>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>History</h2>
        <ActivityFeed items={feedItems(activity)} founders={founders} />
      </section>
    </div>
  );
}
