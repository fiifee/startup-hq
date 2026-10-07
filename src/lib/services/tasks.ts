import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";
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

export async function getTaskDetail(ref: string | number) {
  const t = await findTask(ref);
  const [comments, links] = await Promise.all([
    db.taskComment.findMany({ where: { taskId: t.id }, orderBy: { createdAt: "asc" } }),
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

export type TaskPatch = Partial<Omit<TaskInput, "meetingId">>;

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
  return db.$transaction(async (tx) => {
    const c = await tx.taskComment.create({ data: { taskId: task.id, body: text, ...by(actor) } });
    await logActivity(tx, actor, "task", task.id, "commented", `Commented on T-${task.number}: ${text.slice(0, 80)}`);
    return c;
  });
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
