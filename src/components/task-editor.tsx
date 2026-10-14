"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, CalendarPlus, FolderOpen, Link2, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { commentAction, connectCommentAction, deleteTaskAction, editCommentAction, pinCommentAction, linkDriveAction, unlinkDriveAction, updateTaskAction } from "@/app/actions";
import { Markdown } from "./markdown";
import { MentionTextarea } from "./mention-textarea";
import { shortName } from "@/lib/names";
import { DateInput } from "./date-input";
import { DrivePicker } from "./drive-picker";
import { Byline, type Founder } from "./people";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, formatDate, inputCls, labelCls, relative, selectCls, STATUS_META, textareaCls } from "./ui";
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

export type ConnectTargets = {
  meetings: { id: string; title: string; date: Date }[];
  events: { id: string; number: number; title: string; startsAt: Date }[];
};

type CommentView = {
  id: string;
  body: string;
  byId: string | null;
  agent: string | null;
  editedById: string | null;
  editedAt: Date | null;
  createdAt: Date;
  pinnedAt: Date | null;
  meeting: { id: string; title: string; date: Date } | null;
  event: { number: number; title: string; startsAt: Date } | null;
  meetingId: string | null;
  eventId: string | null;
  agendaItemId: string | null;
  agendaItem: { done: boolean; meeting: { id: string; title: string; date: Date } | null } | null;
};

/** What a comment is connected to, as a link: a meeting, an event, or the next meeting's agenda. */
function Connection({ c }: { c: CommentView }) {
  const chip = "inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink";
  const held = c.agendaItem?.meeting;
  if (held) return <Link href={`/meetings/${held.id}`} className={chip}><CalendarDays className="w-3.5 h-3.5" aria-hidden />Discussed in {held.title} · <span className="ref">{formatDate(held.date, false)}</span></Link>;
  if (c.agendaItemId) return <Link href="/meetings" className={chip}><CalendarDays className="w-3.5 h-3.5" aria-hidden />On the next meeting&apos;s agenda</Link>;
  if (c.meeting) return <Link href={`/meetings/${c.meeting.id}`} className={chip}><CalendarDays className="w-3.5 h-3.5" aria-hidden />{c.meeting.title} · <span className="ref">{formatDate(c.meeting.date, false)}</span></Link>;
  if (c.event) return <Link href={`/timeline/${c.event.number}`} className={chip}><CalendarClock className="w-3.5 h-3.5" aria-hidden /><span className="ref">E-{c.event.number}</span> {c.event.title}</Link>;
  return null;
}

/**
 * One comment. Anyone can fix what an AI wrote; a person's own comment is theirs
 * to change. Anyone can pin it to the top of the task or connect it to a meeting
 * or event, where it then shows up with a link back here.
 */
export function CommentItem({ comment: c, founders, me, targets }: { comment: CommentView; founders: Founder[]; me: string; targets?: ConnectTargets }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [body, setBody] = useState(c.body);
  const canEdit = !!c.agent || c.byId === me;
  const editor = founders.find((f) => f.id === c.editedById);
  const current = c.agendaItemId && !c.agendaItem?.meeting ? "next" : c.meetingId ? `m:${c.meetingId}` : c.eventId ? `e:${c.eventId}` : "";
  const tool = "p-1 rounded text-ink-3 hover:text-ink hover:bg-sunken opacity-0 group-hover:opacity-100 focus:opacity-100";
  return (
    <li className={`arrive group px-4 py-3 [--mark-top:1.1rem] ${c.agent ? "ai-tint" : ""}`} style={{ ["--who" as string]: founders.find((f) => f.id === c.byId)?.color }}>
      <div className="flex items-center gap-2 mb-1">
        <Byline founders={founders} byId={c.byId} agent={c.agent} size="xs" />
        <span className="text-xs text-ink-3">{relative(c.createdAt)}</span>
        {c.editedAt && <span className="text-xs text-ink-3">· edited{editor ? ` by ${editor.name?.split(" ")[0] ?? editor.email}` : ""}</span>}
        {c.pinnedAt && <span className="text-xs font-medium text-ink-2 inline-flex items-center gap-1"><Pin className="w-3 h-3" aria-hidden /> Pinned</span>}
        <span className="ml-auto flex items-center gap-0.5">
          <button
            disabled={pending}
            onClick={() => run(() => pinCommentAction(c.id, !c.pinnedAt), c.pinnedAt ? "Unpinned" : "Pinned to the top")}
            aria-label={c.pinnedAt ? "Unpin comment" : "Pin comment to the top"}
            title={c.pinnedAt ? "Unpin" : "Pin to the top"}
            className={c.pinnedAt ? "p-1 rounded text-ink-2 hover:text-ink hover:bg-sunken" : tool}
          >
            {c.pinnedAt ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          {targets && (
            <button onClick={() => setConnecting((v) => !v)} aria-label="Connect to a meeting or event" title="Connect to a meeting or event" aria-expanded={connecting} className={connecting ? "p-1 rounded text-ink bg-sunken" : tool}>
              <CalendarPlus className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} aria-label="Edit comment" title="Edit" className={tool}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
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
      {connecting && targets ? (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-ink-2 shrink-0">Connect to</span>
          <select
            autoFocus
            disabled={pending}
            value={current}
            onChange={(e) => run(() => connectCommentAction(c.id, e.target.value), e.target.value ? "Connected" : "Disconnected", () => setConnecting(false))}
            className={`${selectCls} h-8 flex-1 min-w-0`}
          >
            <option value="">Nothing</option>
            <option value="next">Next meeting (adds it to the agenda)</option>
            {targets.meetings.length > 0 && (
              <optgroup label="Meetings">
                {targets.meetings.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.title} · {formatDate(m.date)}</option>)}
              </optgroup>
            )}
            {targets.events.length > 0 && (
              <optgroup label="Events">
                {targets.events.map((e) => <option key={e.id} value={`e:${e.id}`}>E-{e.number} {e.title} · {formatDate(e.startsAt)}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      ) : (
        <div className="mt-1.5 empty:hidden"><Connection c={c} /></div>
      )}
    </li>
  );
}
