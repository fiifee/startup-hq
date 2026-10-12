import { Target } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { firstName } from "@/components/people";
import { TaskBoard } from "@/components/task-board";
import { ConfirmAll, QuickAddTask, TaskList } from "@/components/tasks";
import { cardCls, h1Cls, STATUS_META } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";
import { daysAgo } from "@/lib/view";

export const metadata = { title: "Tasks" };

const VIEWS = { open: ["doing", "blocked", "todo"], proposed: ["proposed"], done: ["done", "dropped"] } as const;

export default async function TasksPage(props: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const who = typeof sp.who === "string" ? sp.who : "all";
  const view = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "open") as keyof typeof VIEWS;
  const q = typeof sp.q === "string" ? sp.q : "";
  const layout = sp.layout === "board" ? "board" : "list";
  const group = sp.group === "goal" ? "goal" : "status";
  const founders = await listFounders();

  const monthAgo = daysAgo(30);
  const where: Prisma.TaskWhereInput =
    layout === "board"
      ? { OR: [{ status: { in: ["proposed", "todo", "doing", "blocked"] } }, { status: "done", completedAt: { gte: monthAgo } }] }
      : { status: { in: [...VIEWS[view]] } };
  if (who === "me") where.assigneeId = user.id;
  else if (who === "none") where.assigneeId = null;
  else if (who !== "all") where.assigneeId = who;
  if (q) where.AND = [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }];

  const tasks = await db.task.findMany({
    where,
    orderBy:
      view === "done"
        ? [{ completedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
        : [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    take: 300,
    include: { goal: { select: { number: true, title: true } } },
  });

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ who, view, layout, group, ...(q ? { q } : {}), ...patch });
    return `/tasks?${p}`;
  };
  const chip = (active: boolean) =>
    `h-8 px-3 rounded-full text-sm inline-flex items-center gap-1.5 border ${
      active ? "bg-ink text-canvas border-ink" : "border-line-strong text-ink-2 hover:text-ink hover:bg-sunken"
    }`;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className={h1Cls}>Tasks</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-sunken" aria-label="Layout">
          {(["list", "board"] as const).map((l) => (
            <Link key={l} href={link({ layout: l })} aria-current={layout === l} className={`h-8 px-3 rounded-md text-sm inline-flex items-center ${layout === l ? "bg-surface shadow-sm font-medium" : "text-ink-2 hover:text-ink"}`}>
              {l === "list" ? "List" : "Board"}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Whose tasks">
        <Link href={link({ who: "all" })} className={chip(who === "all")}>Everyone</Link>
        {founders.map((f) => (
          <Link
            key={f.id}
            href={link({ who: f.id === user.id ? "me" : f.id })}
            className={chip(who === f.id || (who === "me" && f.id === user.id))}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: f.color }} /> {f.id === user.id ? "Me" : firstName(f)}
          </Link>
        ))}
        <Link href={link({ who: "none" })} className={chip(who === "none")}>Unassigned</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className={`flex gap-1 p-1 rounded-lg bg-sunken ${layout === "board" ? "invisible" : ""}`} role="tablist">
          {(["open", "proposed", "done"] as const).map((v) => (
            <Link
              key={v}
              href={link({ view: v })}
              role="tab"
              aria-selected={view === v}
              className={`h-8 px-3 rounded-md text-sm inline-flex items-center ${
                view === v ? "bg-surface text-ink shadow-sm font-medium" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v === "open" ? "Open" : v === "proposed" ? "Proposed by AI" : "Done"}
            </Link>
          ))}
        </div>
        {layout === "list" && (
          <div className="flex items-center gap-1 text-sm text-ink-2 ml-auto">
            Group by
            {(["status", "goal"] as const).map((g) => (
              <Link key={g} href={link({ group: g })} className={`h-8 px-2.5 rounded-md inline-flex items-center ${group === g ? "bg-sunken text-ink font-medium" : "hover:text-ink"}`}>
                {g === "status" ? "Status" : "Goal"}
              </Link>
            ))}
          </div>
        )}
        <form className="flex gap-2">
          <input type="hidden" name="who" value={who} />
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="layout" value={layout} />
          <input type="hidden" name="group" value={group} />
          <input name="q" defaultValue={q} placeholder="Filter…" aria-label="Filter tasks" className="h-9 px-3 rounded-md border border-line bg-surface text-sm w-48 focus:outline-none focus:border-accent" />
        </form>
      </div>

      {(view !== "done" || layout === "board") && (
        <div className={`${cardCls} p-3`}>
          <QuickAddTask founders={founders} me={who !== "all" && who !== "me" && who !== "none" ? who : user.id} />
        </div>
      )}

      {layout === "board" ? (
        <TaskBoard tasks={tasks} founders={founders} />
      ) : group === "goal" ? (
        [...new Map(tasks.map((t) => [t.goal?.number ?? 0, t.goal])).entries()]
          .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
          .map(([num, goal]) => {
            const inGoal = tasks.filter((t) => (t.goal?.number ?? 0) === num);
            return (
              <section key={num} className={cardCls}>
                <h2 className="px-4 py-2.5 border-b border-line text-sm font-semibold flex items-center gap-2">
                  {goal ? <Link href={`/goals/${num}`} className="hover:underline inline-flex items-center gap-1.5"><Target className="w-3.5 h-3.5" aria-hidden />{goal.title}</Link> : "No goal"}
                  <span className="text-ink-3 font-normal tabular">{inGoal.length}</span>
                </h2>
                <TaskList tasks={inGoal.map((t) => ({ ...t, goal: null }))} founders={founders} />
              </section>
            );
          })
      ) : view === "open" ? (
        VIEWS.open.map((status) => {
          const group = tasks.filter((t) => t.status === status);
          if (!group.length && status !== "todo") return null;
          return (
            <section key={status} className={cardCls}>
              <h2 className="px-4 py-2.5 border-b border-line text-sm font-semibold flex items-center gap-2">
                {STATUS_META[status].label} <span className="text-ink-3 font-normal tabular">{group.length}</span>
              </h2>
              <TaskList tasks={group} founders={founders} empty="Nothing to do. Add a task above." />
            </section>
          );
        })
      ) : (
        <section className={cardCls}>
          {view === "proposed" && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
              <p className="text-sm text-ink-2">Tasks an AI inferred, e.g. from a meeting. Confirm to move them to To do.</p>
              <ConfirmAll refs={tasks.map((t) => String(t.number))} />
            </div>
          )}
          <TaskList
            tasks={tasks}
            founders={founders}
            empty={view === "proposed" ? "Nothing waiting for confirmation." : "Nothing finished yet."}
          />
        </section>
      )}
    </div>
  );
}
