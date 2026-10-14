"use client";

import { useState } from "react";
import { FolderOpen, Link2, Pencil, Trash2, X } from "lucide-react";
import { commentAction, deleteTaskAction, editCommentAction, linkDriveAction, unlinkDriveAction, updateTaskAction } from "@/app/actions";
import { Markdown } from "./markdown";
import { MentionTextarea } from "./mention-textarea";
import { shortName } from "@/lib/names";
import { DateInput } from "./date-input";
import { DrivePicker } from "./drive-picker";
import { Byline, type Founder } from "./people";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, inputCls, labelCls, relative, selectCls, STATUS_META, textareaCls } from "./ui";
import { useAction } from "./use-action";

type Task = {
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: Date | null;
  tags: string[];
  textById: string | null;
  textAgent: string | null;
  goalId: string | null;
};

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function TaskEditor({ task, founders, goals }: { task: Task; founders: Founder[]; goals: { id: string; number: number; title: string }[] }) {
  const { pending, run } = useAction();
  const goalNumber = (id: string | null) => goals.find((g) => g.id === id)?.number.toString() ?? "";
  const [f, setF] = useState({
    goal: goalNumber(task.goalId),
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assigneeId ?? "",
    due: ymd(task.dueDate),
    tags: task.tags.join(", "),
  });
  const dirty =
    f.goal !== goalNumber(task.goalId) ||
    f.title !== task.title ||
    f.description !== task.description ||
    f.status !== task.status ||
    f.priority !== task.priority ||
    f.assignee !== (task.assigneeId ?? "") ||
    f.due !== ymd(task.dueDate) ||
    f.tags !== task.tags.join(", ");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            updateTaskAction(String(task.number), {
              title: f.title,
              description: f.description,
              status: f.status,
              priority: f.priority,
              assignee: f.assignee || "none",
              due: f.due || null,
              tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
              goal: f.goal || null,
            }),
          "Saved",
        );
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="title" className={labelCls}>Title</label>
        <input id="title" value={f.title} onChange={set("title")} className={`${inputCls} text-lg font-medium`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="status" className={labelCls}>Status</label>
          <select id="status" value={f.status} onChange={set("status")} className={`${selectCls} w-full`}>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="assignee" className={labelCls}>Owner</label>
          <select id="assignee" value={f.assignee} onChange={set("assignee")} className={`${selectCls} w-full`}>
            <option value="">Unassigned</option>
            {founders.map((u) => <option key={u.id} value={u.id}>{shortName(u, founders)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="due" className={labelCls}>Due</label>
          <DateInput id="due" value={f.due} onChange={set("due")} className={`${selectCls} w-full`} />
        </div>
        <div>
          <label htmlFor="priority" className={labelCls}>Priority</label>
          <select id="priority" value={f.priority} onChange={set("priority")} className={`${selectCls} w-full`}>
            {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="description" className="text-sm font-medium">Description</label>
          <span className="text-xs text-ink-3 inline-flex items-center gap-1.5">
            Text by <Byline founders={founders} byId={task.textById} agent={task.textAgent} size="xs" />
          </span>
        </div>
        <textarea id="description" value={f.description} onChange={set("description")} rows={6} placeholder="Details, links, context. Markdown works." className={textareaCls} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="goal" className={labelCls}>Goal</label>
          <select id="goal" value={f.goal} onChange={set("goal")} className={`${selectCls} w-full`}>
            <option value="">No goal</option>
            {goals.map((g) => <option key={g.id} value={g.number}>G-{g.number} {g.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tags" className={labelCls}>Tags</label>
          <input id="tags" value={f.tags} onChange={set("tags")} placeholder="fundraising, legal" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={!dirty || pending} className={btnPrimary}>Save</button>
        {dirty && <span className="text-sm text-ink-2">Unsaved changes</span>}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete T-${task.number} permanently? (Setting it to Dropped keeps it.)`)) deleteTaskAction(String(task.number));
          }}
          className={`${btnDanger} ml-auto`}
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </form>
  );
}

export function CommentBox({ taskRef, founders, me }: { taskRef: string; founders: Founder[]; me: string }) {
  const { pending, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => commentAction(taskRef, body), undefined, () => setBody(""));
      }}
      className="flex gap-2 items-end"
    >
      <MentionTextarea value={body} onChange={setBody} founders={founders} me={me} rows={2} placeholder="Add a comment… type @ to ask a teammate" aria-label="Comment" className={textareaCls} />
      <button disabled={pending || !body.trim()} className={btnPrimary}>Post</button>
    </form>
  );
}

export function DriveLinks({ links, target, founders, defaultName }: { links: { id: string; fileId: string; name: string; url: string; byId: string | null; agent: string | null }[]; target: { taskId?: string; noteId?: string; meetingId?: string }; founders: Founder[]; defaultName?: string }) {
  const { pending, run } = useAction();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"closed" | "browse" | "paste">("closed");
  return (
    <div className="space-y-2">
      {links.map((l) => (
        <div key={l.id} className="arrive flex items-center gap-2 text-sm">
          <Link2 className="w-4 h-4 text-ink-3 shrink-0" />
          <a href={l.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 truncate">{l.name}</a>
          {l.agent && <Byline founders={founders} byId={l.byId} agent={l.agent} size="xs" />}
          <button aria-label={`Unlink ${l.name}`} onClick={() => run(() => unlinkDriveAction(l.id))} className="ml-auto p-1 rounded text-ink-3 hover:text-ink hover:bg-sunken"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {mode === "browse" && <DrivePicker target={target} linked={links.map((l) => l.fileId)} defaultName={defaultName} onClose={() => setMode("closed")} />}
      {mode === "paste" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => linkDriveAction(url, target), "Linked", () => {
              setUrl("");
              setMode("closed");
            });
          }}
          className="flex gap-2"
        >
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a Google Drive link" className={inputCls} />
          <button disabled={pending || !url.trim()} className={btnPrimary}>Attach</button>
          <button type="button" onClick={() => setMode("closed")} className={btnSecondary}>Cancel</button>
        </form>
      )}
      {mode === "closed" && (
        <div className="flex items-center gap-1">
          <button onClick={() => setMode("browse")} className={btnSmall}><FolderOpen className="w-4 h-4" /> Attach from Drive</button>
          <button onClick={() => setMode("paste")} className={`${btnSmall} text-ink-3`}>Paste a link</button>
        </div>
      )}
    </div>
  );
}

/**
 * One comment. Anyone can fix what an AI wrote; a person's own comment is theirs
 * to change. Edits are marked and the old text stays in the history.
 */
export function CommentItem({
  comment: c,
  founders,
  me,
}: {
  comment: { id: string; body: string; byId: string | null; agent: string | null; editedById: string | null; editedAt: Date | null; createdAt: Date };
  founders: Founder[];
  me: string;
}) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const canEdit = !!c.agent || c.byId === me;
  const editor = founders.find((f) => f.id === c.editedById);
  return (
    <li className={`arrive group px-4 py-3 [--mark-top:1.1rem] ${c.agent ? "ai-tint" : ""}`} style={{ ["--who" as string]: founders.find((f) => f.id === c.byId)?.color }}>
      <div className="flex items-center gap-2 mb-1">
        <Byline founders={founders} byId={c.byId} agent={c.agent} size="xs" />
        <span className="text-xs text-ink-3">{relative(c.createdAt)}</span>
        {c.editedAt && <span className="text-xs text-ink-3">· edited{editor ? ` by ${editor.name?.split(" ")[0] ?? editor.email}` : ""}</span>}
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} aria-label="Edit comment" className="ml-auto p-1 rounded text-ink-3 hover:text-ink hover:bg-sunken opacity-0 group-hover:opacity-100 focus:opacity-100">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editCommentAction(c.id, body), body.trim() ? "Saved" : "Deleted", () => setEditing(false));
          }}
          className="space-y-2"
        >
          <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={textareaCls} />
          <div className="flex gap-2 items-center">
            <button disabled={pending} className={btnPrimary}>Save</button>
            <button type="button" onClick={() => { setBody(c.body); setEditing(false); }} className={btnSecondary}>Cancel</button>
            <span className="text-xs text-ink-3">Empty saves as delete. Undo from the history.</span>
          </div>
        </form>
      ) : (
        <Markdown className="text-sm">{c.body}</Markdown>
      )}
    </li>
  );
}
