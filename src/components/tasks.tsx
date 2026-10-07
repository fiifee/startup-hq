"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { confirmTasksAction, createTaskAction, updateTaskAction } from "@/app/actions";
import { Avatar, Byline, type Founder } from "./people";
import { dueLabel, inputCls, PRIORITY_META, selectCls, STATUS_META } from "./ui";
import { useAction } from "./use-action";

export type TaskLite = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assigneeId: string | null;
  createdById: string | null;
  createdAgent: string | null;
  tags: string[];
};

export function StatusSelect({ task, compact = false }: { task: Pick<TaskLite, "number" | "status">; compact?: boolean }) {
  const { pending, run } = useAction();
  const meta = STATUS_META[task.status] ?? STATUS_META.todo;
  return (
    <select
      aria-label="Status"
      value={task.status}
      disabled={pending}
      onChange={(e) => run(() => updateTaskAction(String(task.number), { status: e.target.value }))}
      className={`${compact ? "h-7 text-xs w-[92px]" : "h-8 text-sm"} px-1.5 rounded border font-medium cursor-pointer appearance-none text-center ${meta.cls}`}
    >
      {Object.entries(STATUS_META).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  );
}

export function TaskRow({ task, founders, showConfirm = true }: { task: TaskLite; founders: Founder[]; showConfirm?: boolean }) {
  const { pending, run } = useAction();
  const assignee = founders.find((f) => f.id === task.assigneeId);
  const due = task.status === "done" || task.status === "dropped" ? null : dueLabel(task.dueDate);
  const pr = PRIORITY_META[task.priority];
  return (
    <li className={`flex items-center gap-3 px-3 py-2 min-h-12 ${task.createdAgent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: founders.find((f) => f.id === task.createdById)?.color ?? "#7b776f" }}>
      <StatusSelect task={task} compact />
      <div className="flex-1 min-w-0">
        <Link href={`/tasks/${task.number}`} className={`block truncate hover:underline ${task.status === "done" || task.status === "dropped" ? "text-ink-3 line-through" : ""}`}>
          <span className="text-ink-3 tabular mr-1.5">T-{task.number}</span>
          {task.title}
        </Link>
        <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
          {task.createdAgent && <Byline founders={founders} byId={task.createdById} agent={task.createdAgent} size="xs" />}
          {(task.priority === "high" || task.priority === "urgent") && <span className={pr.cls}>{pr.label}</span>}
          {due && <span className={due.tone === "late" ? "text-danger font-medium" : due.tone === "soon" ? "text-warn" : "text-ink-2"}>{due.text}</span>}
          {task.tags.map((t) => <span key={t} className="text-ink-3">#{t}</span>)}
        </div>
      </div>
      {showConfirm && task.status === "proposed" && (
        <div className="flex gap-1">
          <button disabled={pending} onClick={() => run(() => confirmTasksAction([String(task.number)], true), "Confirmed")} title="Confirm: move to To do" className="h-8 px-2 rounded-md border border-line-strong text-sm hover:bg-sunken inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Confirm
          </button>
          <button disabled={pending} onClick={() => run(() => confirmTasksAction([String(task.number)], false))} title="Drop" aria-label="Drop" className="h-8 w-8 rounded-md text-ink-2 hover:bg-sunken inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <Avatar user={assignee} />
    </li>
  );
}

export function TaskList({ tasks, founders, empty = "Nothing here." }: { tasks: TaskLite[]; founders: Founder[]; empty?: string }) {
  if (!tasks.length) return <p className="px-3 py-4 text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => <TaskRow key={t.id} task={t} founders={founders} />)}
    </ul>
  );
}

export function ConfirmAll({ refs }: { refs: string[] }) {
  const { pending, run } = useAction();
  if (!refs.length) return null;
  return (
    <button disabled={pending} onClick={() => run(() => confirmTasksAction(refs, true), `Confirmed ${refs.length} tasks`)} className="h-8 px-3 rounded-md bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
      <Check className="w-3.5 h-3.5" /> Confirm all {refs.length}
    </button>
  );
}

export function QuickAddTask({ founders, me, meetingId }: { founders: Founder[]; me: string; meetingId?: string }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(me);
  const [due, setDue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        run(
          () => createTaskAction({ title, assignee: assignee || null, due: due || null, meetingId }),
          undefined,
          () => {
            setTitle("");
            setDue("");
          },
        );
      }}
      className="flex flex-wrap gap-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="New task title" className={`${inputCls} flex-1 min-w-[200px]`} />
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee" className={selectCls}>
        <option value="">Unassigned</option>
        {founders.map((f) => <option key={f.id} value={f.id}>{f.name ?? f.email}</option>)}
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={`${selectCls} w-[150px]`} />
      <button disabled={pending || !title.trim()} className="h-10 px-4 rounded-md bg-ink text-canvas text-sm font-medium disabled:opacity-50">Add</button>
    </form>
  );
}
