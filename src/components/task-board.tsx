"use client";

import Link from "next/link";
import { toast } from "sonner";
import { updateTaskAction } from "@/app/actions";
import { DndColumns } from "./dnd-columns";
import { Avatar, Byline, type Founder } from "./people";
import type { TaskLite } from "./tasks";
import { dueLabel, PRIORITY_META } from "./ui";

const COLUMNS = [
  { id: "proposed", label: "Proposed", hint: "From AI, not confirmed yet" },
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

export type BoardTask = TaskLite & { goal?: { number: number; title: string } | null };

function Card({ task, founders }: { task: BoardTask; founders: Founder[] }) {
  const assignee = founders.find((f) => f.id === task.assigneeId);
  const due = task.status === "done" ? null : dueLabel(task.dueDate);
  const color = founders.find((f) => f.id === task.createdById)?.color ?? "#7b776f";
  return (
    <article
      className={`rounded-md border border-line bg-surface p-2.5 space-y-1.5 ${task.createdAgent ? "ai-tint" : ""}`}
      style={{ ["--who" as string]: color }}
    >
      <Link href={`/tasks/${task.number}`} className={`block text-sm leading-snug hover:underline ${task.status === "done" ? "text-ink-3 line-through" : ""}`}>
        <span className="text-ink-3 tabular mr-1">T-{task.number}</span>
        {task.title}
      </Link>
      {task.goal && <p className="text-xs text-ink-2 truncate">◎ G-{task.goal.number} {task.goal.title}</p>}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {task.createdAgent && <Byline founders={founders} byId={task.createdById} agent={task.createdAgent} size="xs" />}
        {(task.priority === "high" || task.priority === "urgent") && <span className={PRIORITY_META[task.priority].cls}>{PRIORITY_META[task.priority].label}</span>}
        {due && <span className={due.tone === "late" ? "text-danger font-medium" : due.tone === "soon" ? "text-warn" : "text-ink-2"}>{due.text}</span>}
        <span className="ml-auto"><Avatar user={assignee} size={20} /></span>
      </div>
    </article>
  );
}

/** Drag a task to another column to change its status. */
export function TaskBoard({ tasks, founders }: { tasks: BoardTask[]; founders: Founder[] }) {
  return (
    <DndColumns
      columns={COLUMNS}
      items={tasks}
      columnOf={(t) => t.status}
      onMove={async (t, status) => {
        const r = await updateTaskAction(String(t.number), { status });
        if (!r.ok) toast.error(r.error);
        return r.ok;
      }}
      renderCard={(t) => <Card task={t} founders={founders} />}
    />
  );
}
