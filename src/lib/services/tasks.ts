import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";
import { asksFromMentions } from "./asks";
import { goalIdFor } from "./goals";
import { resolveUser } from "./people";

export const TASK_STATUSES = ["proposed", "todo", "doing", "blocked", "done", "dropped"] as const;
export const OPEN_STATUSES = ["proposed", "todo", "doing", "blocked"];
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const include = {
  assignee: true,
  meeting: { select: { id: true, title: true, date: true } },
  goal: { select: { id: true, number: true, title: true } },
} satisfies Prisma.TaskInclude;

/** Accepts 12, "12", "T-12", "#12" or a task id. */
export async function findTask(ref: string | number) {
  const s = String(ref).trim();
  const num = s.match(/^(?:t-?|#)?(\d+)$/i);
  const task = num
    ? await db.task.findUnique({ where: { number: Number(num[1]) }, include })
    : await db.task.findUnique({ where: { id: s }, include });
  if (!task) throw new Error(`Task ${s} not found`);
  return task;
}

export async function listTasks(
  actor: Actor,
  f: { status?: string[]; assignee?: string; search?: string; dueBefore?: Date; includeClosed?: boolean; meetingId?: string; goal?: string; limit?: number } = {},
) {
  const where: Prisma.TaskWhereInput = {};
  if (f.status?.length) where.status = { in: f.status };
  else if (!f.includeClosed) where.status = { in: OPEN_STATUSES };
  if (f.assignee !== undefined) where.assigneeId = await resolveUser(f.assignee, actor);
  if (f.meetingId) where.meetingId = f.meetingId;
  if (f.goal !== undefined) where.goalId = await goalIdFor(f.goal);
  if (f.dueBefore) where.dueDate = { lte: f.dueBefore };
  if (f.search) {
    where.OR = [
      { title: { contains: f.search, mode: "insensitive" } },
      { description: { contains: f.search, mode: "insensitive" } },
      { tags: { has: f.search.toLowerCase() } },
    ];
  }
  return db.task.findMany({
    where,
    include,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    take: Math.min(f.limit ?? 100, 300),
  });
}

const COMMENT_LINKS = {
  meeting: { select: { id: true, title: true, date: true } },
  event: { select: { number: true, title: true, startsAt: true } },
  agendaItem: { select: { done: true, meeting: { select: { id: true, title: true, date: true } } } },
} as const;

export async function getTaskDetail(ref: string | number) {
  const t = await findTask(ref);
  const [comments, links] = await Promise.all([
    db.taskComment.findMany({
      where: { taskId: t.id },
      // Pinned first (latest pin on top), then the conversation in order.
      orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      include: COMMENT_LINKS,
    }),
    db.driveLink.findMany({ where: { taskId: t.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return { ...t, comments, links };
}

export type TaskInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string | null;
  dueDate?: Date | null;
  tags?: string[];
  meetingId?: string | null;
  goal?: string | null;
  eventId?: string | null;
};

function checkEnum(value: string | undefined, allowed: readonly string[], name: string) {
  if (value !== undefined && !allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

export async function createTask(actor: Actor, input: TaskInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  checkEnum(input.status, TASK_STATUSES, "status");
  checkEnum(input.priority, PRIORITIES, "priority");
  const assigneeId = await resolveUser(input.assignee ?? null, actor);
  const goalId = (await goalIdFor(input.goal)) ?? null;
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: title.slice(0, 300),
        description: input.description?.trim() ?? "",
        status: input.status ?? "todo",
        priority: input.priority ?? "normal",
        assigneeId,
        dueDate: input.dueDate ?? null,
        tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        meetingId: input.meetingId ?? null,
        eventId: input.eventId ?? null,
        goalId,
        completedAt: input.status === "done" ? new Date() : null,
        ...by(actor, "created"),
        ...by(actor, "text"),
      },
      include,
    });
    await logActivity(tx, actor, "task", task.id, "created", `Created T-${task.number} "${task.title}"`);
    return task;
  });
}

export type TaskPatch = Partial<Omit<TaskInput, "meetingId" | "eventId">>;

/**
 * Apply a change. When an AI tries to rewrite the title/description that a person
 * wrote, that part becomes a Suggestion and everything else still applies.
 */
export async function updateTask(actor: Actor, ref: string | number, patch: TaskPatch, reason = "") {
  const current = await findTask(ref);
  checkEnum(patch.status, TASK_STATUSES, "status");
  checkEnum(patch.priority, PRIORITIES, "priority");

  const data: Prisma.TaskUncheckedUpdateInput = {};
  const textChange: { title?: string; description?: string } = {};
  if (patch.title !== undefined && patch.title.trim() !== current.title) textChange.title = patch.title.trim().slice(0, 300);
  if (patch.description !== undefined && patch.description.trim() !== current.description) textChange.description = patch.description.trim();

  const protectedText = isAI(actor) && !current.textAgent && Object.keys(textChange).length > 0;
  if (!protectedText && Object.keys(textChange).length) Object.assign(data, textChange, by(actor, "text"));

  if (patch.status !== undefined && patch.status !== current.status) {
    data.status = patch.status;
    data.completedAt = patch.status === "done" ? new Date() : null;
  }
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.assignee !== undefined) data.assigneeId = await resolveUser(patch.assignee, actor);
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.goal !== undefined) data.goalId = await goalIdFor(patch.goal);
  if (patch.tags !== undefined) data.tags = patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);

  return db.$transaction(async (tx) => {
    let suggestionId: string | null = null;
    if (protectedText) {
      const s = await tx.suggestion.create({
        data: { entityType: "task", entityId: current.id, proposed: textChange, reason, ...by(actor) },
      });
      suggestionId = s.id;
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested a new ${Object.keys(textChange).join(" and ")} for T-${current.number}`);
    }
    let task = current;
    if (Object.keys(data).length) {
      const { assignee: _a, meeting: _m, goal: _g, ...before } = current;
      void _a; void _m; void _g;
      task = await tx.task.update({ where: { id: current.id }, data, include });
      await logActivity(tx, actor, "task", task.id, "updated", describeTaskChange(current, task), before);
    }
    return { task, suggestionId };
  });
}

function describeTaskChange(a: { number: number; status: string; title: string; assigneeId: string | null; dueDate: Date | null; priority: string; goalId: string | null }, b: typeof a) {
  const parts: string[] = [];
  if (a.goalId !== b.goalId) parts.push("goal");
  if (a.status !== b.status) parts.push(`status ${a.status} → ${b.status}`);
  if (a.title !== b.title) parts.push("title");
  if (a.assigneeId !== b.assigneeId) parts.push("assignee");
  if (+(a.dueDate ?? 0) !== +(b.dueDate ?? 0)) parts.push("due date");
  if (a.priority !== b.priority) parts.push(`priority ${b.priority}`);
  return `Updated T-${b.number} "${b.title}"${parts.length ? ": " + parts.join(", ") : ""}`;
}

export async function addTaskComment(actor: Actor, ref: string | number, body: string) {
  const task = await findTask(ref);
  const text = body.trim();
  if (!text) throw new Error("Comment is empty");
  const c = await db.$transaction(async (tx) => {
    const c = await tx.taskComment.create({ data: { taskId: task.id, body: text, ...by(actor) } });
    await logActivity(tx, actor, "task", task.id, "commented", `Commented on T-${task.number}: ${text.slice(0, 80)}`);
    return c;
  });
  // "@Anna …" asks Anna for input on this task.
  await asksFromMentions(actor, "task", task.id, text);
  return c;
}

/** Hard delete is for people only; AI drops tasks instead, which can be undone. */
export async function deleteTask(actor: Actor, ref: string | number) {
  if (isAI(actor)) throw new Error("AI cannot delete tasks. Set status to 'dropped' instead.");
  const task = await findTask(ref);
  await db.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: task.id } });
    await logActivity(tx, actor, "task", task.id, "deleted", `Deleted T-${task.number} "${task.title}"`);
  });
}

/**
 * Who may change a comment: anyone may fix what an AI wrote; a person's own
 * comment is theirs alone. AIs never rewrite comments.
 */
export function canEditComment(actor: Actor, c: { byId: string | null; agent: string | null }) {
  if (isAI(actor)) return false;
  return !!c.agent || c.byId === actor.userId;
}

/** Edit (or, with empty text, delete) a task comment. The old text stays in the history. */
export async function editTaskComment(actor: Actor, commentId: string, body: string) {
  const c = await db.taskComment.findUnique({ where: { id: commentId }, include: { task: { select: { number: true } } } });
  if (!c) throw new Error("Comment not found");
  if (!canEditComment(actor, c)) throw new Error(isAI(actor) ? "AI cannot change comments" : "Only the person who wrote this comment can change it");
  const text = body.trim();
  return db.$transaction(async (tx) => {
    const { task: _t, ...before } = c;
    void _t;
    if (!text) {
      await tx.taskComment.delete({ where: { id: c.id } });
      await logActivity(tx, actor, "comment", c.id, "deleted", `Deleted a comment on T-${c.task.number}: ${c.body.slice(0, 80)}`, before);
      return null;
    }
    const updated = await tx.taskComment.update({ where: { id: c.id }, data: { body: text, editedById: actor.userId, editedAt: new Date() } });
    await logActivity(tx, actor, "comment", c.id, "updated", `Edited a comment on T-${c.task.number}: ${text.slice(0, 80)}`, before);
    return updated;
  });
}

async function findComment(commentId: string) {
  const c = await db.taskComment.findUnique({ where: { id: commentId }, include: { task: { select: { number: true, title: true } }, agendaItem: true } });
  if (!c) throw new Error("Comment not found");
  return c;
}

/** Pin a comment to the top of its task, or unpin it. Anyone may. */
export async function pinComment(actor: Actor, commentId: string, pinned: boolean) {
  const c = await findComment(commentId);
  return db.$transaction(async (tx) => {
    const updated = await tx.taskComment.update({ where: { id: c.id }, data: pinned ? { pinnedAt: new Date(), pinnedById: actor.userId } : { pinnedAt: null, pinnedById: null } });
    await logActivity(tx, actor, "comment", c.id, pinned ? "pinned" : "unpinned", `${pinned ? "Pinned" : "Unpinned"} a comment on T-${c.task.number}: ${c.body.slice(0, 60)}`);
    return updated;
  });
}

export type CommentTarget = { next: true } | { meetingId: string } | { eventId: string } | null;

/**
 * Connect a task comment to a meeting, an event, or the next meeting's agenda
 * (which adds it as a topic), or disconnect it (null). One connection at a time.
 */
export async function connectComment(actor: Actor, commentId: string, target: CommentTarget) {
  const c = await findComment(commentId);
  return db.$transaction(async (tx) => {
    // A topic this comment put on the upcoming agenda goes away with the connection.
    if (c.agendaItem && !c.agendaItem.meetingId && !c.agendaItem.done) await tx.agendaItem.delete({ where: { id: c.agendaItem.id } });
    const data = { meetingId: null as string | null, eventId: null as string | null, agendaItemId: null as string | null };
    let label = "";
    if (target && "next" in target) {
      const excerpt = c.body.replace(/\s+/g, " ").slice(0, 300);
      const item = await tx.agendaItem.create({ data: { text: `T-${c.task.number} ${c.task.title}: ${excerpt}`.slice(0, 500), ...by(actor) } });
      data.agendaItemId = item.id;
      label = "the next meeting's agenda";
    } else if (target && "meetingId" in target) {
      const m = await tx.meeting.findUnique({ where: { id: target.meetingId }, select: { id: true, title: true } });
      if (!m) throw new Error("Meeting not found");
      data.meetingId = m.id;
      label = `meeting "${m.title}"`;
    } else if (target && "eventId" in target) {
      const e = await tx.event.findUnique({ where: { id: target.eventId }, select: { id: true, number: true, title: true } });
      if (!e) throw new Error("Event not found");
      data.eventId = e.id;
      label = `E-${e.number} "${e.title}"`;
    }
    const updated = await tx.taskComment.update({ where: { id: c.id }, data });
    await logActivity(tx, actor, "comment", c.id, target ? "connected" : "disconnected",
      target ? `Connected a comment on T-${c.task.number} to ${label}` : `Disconnected a comment on T-${c.task.number}`);
    return updated;
  });
}

/** Task comments connected to a meeting (directly or via its agenda) or to an event. */
export async function connectedComments(where: { meetingId: string } | { eventId: string }) {
  return db.taskComment.findMany({
    where: "meetingId" in where ? { OR: [{ meetingId: where.meetingId }, { agendaItem: { meetingId: where.meetingId } }] } : { eventId: where.eventId },
    orderBy: { createdAt: "asc" },
    include: { task: { select: { number: true, title: true } } },
  });
}
