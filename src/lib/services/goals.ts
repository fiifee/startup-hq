import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";
import { resolveUser } from "./people";

export const GOAL_STATUSES = ["active", "achieved", "dropped"] as const;
export const HORIZONS = ["now", "next", "later"] as const;

/** Accepts 3, "3", "G-3", "#3" or a goal id. */
export async function findGoal(ref: string | number) {
  const s = String(ref).trim();
  const num = s.match(/^(?:g-?|#)?(\d+)$/i);
  const goal = num ? await db.goal.findUnique({ where: { number: Number(num[1]) } }) : await db.goal.findUnique({ where: { id: s } });
  if (!goal) throw new Error(`Goal ${s} not found`);
  return goal;
}

/** "G-3" / null / undefined → goal id for a task's goalId. */
export async function goalIdFor(ref: string | null | undefined) {
  if (ref === undefined) return undefined;
  if (ref === null || ref === "" || ref === "none") return null;
  return (await findGoal(ref)).id;
}

export type GoalProgress = { total: number; done: number; open: number };

/** Goals with progress counted from their tasks (dropped tasks don't count). */
export async function listGoals(f: { status?: string; includeClosed?: boolean } = {}) {
  const where: Prisma.GoalWhereInput = f.status ? { status: f.status } : f.includeClosed ? {} : { status: "active" };
  const goals = await db.goal.findMany({ where, orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { number: "asc" }] });
  const counts = await db.task.groupBy({
    by: ["goalId", "status"],
    _count: true,
    where: { goalId: { in: goals.map((g) => g.id) }, status: { not: "dropped" } },
  });
  return goals.map((g) => {
    const mine = counts.filter((c) => c.goalId === g.id);
    const total = mine.reduce((s, c) => s + c._count, 0);
    const done = mine.filter((c) => c.status === "done").reduce((s, c) => s + c._count, 0);
    return { ...g, progress: { total, done, open: total - done } as GoalProgress };
  });
}

export async function getGoalDetail(ref: string | number) {
  const g = await findGoal(ref);
  const tasks = await db.task.findMany({ where: { goalId: g.id }, orderBy: [{ status: "asc" }, { number: "asc" }] });
  const counted = tasks.filter((t) => t.status !== "dropped");
  return { ...g, tasks, progress: { total: counted.length, done: counted.filter((t) => t.status === "done").length, open: counted.filter((t) => t.status !== "done").length } };
}

function check(value: string | undefined, allowed: readonly string[], name: string) {
  if (value !== undefined && !allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

export type GoalInput = { title: string; description?: string; horizon?: string; targetDate?: Date | null; owner?: string | null };

export async function createGoal(actor: Actor, input: GoalInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  check(input.horizon, HORIZONS, "horizon");
  const ownerId = await resolveUser(input.owner ?? null, actor);
  return db.$transaction(async (tx) => {
    const g = await tx.goal.create({
      data: {
        title: title.slice(0, 300),
        description: input.description?.trim() ?? "",
        horizon: input.horizon ?? "now",
        targetDate: input.targetDate ?? null,
        ownerId,
        ...by(actor, "created"),
        ...by(actor, "text"),
      },
    });
    await logActivity(tx, actor, "goal", g.id, "created", `Added goal G-${g.number} "${g.title}"`);
    return g;
  });
}

export type GoalPatch = Partial<GoalInput> & { status?: string };

/** Same rule as tasks: an AI's rewording of a person's goal text becomes a suggestion. */
export async function updateGoal(actor: Actor, ref: string | number, patch: GoalPatch, reason = "") {
  const current = await findGoal(ref);
  check(patch.status, GOAL_STATUSES, "status");
  check(patch.horizon, HORIZONS, "horizon");
  const data: Prisma.GoalUncheckedUpdateInput = {};
  const text: { title?: string; description?: string } = {};
  if (patch.title !== undefined && patch.title.trim() && patch.title.trim() !== current.title) text.title = patch.title.trim().slice(0, 300);
  if (patch.description !== undefined && patch.description.trim() !== current.description) text.description = patch.description.trim();
  const protectedText = isAI(actor) && !current.textAgent && Object.keys(text).length > 0;
  if (!protectedText && Object.keys(text).length) Object.assign(data, text, by(actor, "text"));
  if (patch.status !== undefined && patch.status !== current.status) {
    data.status = patch.status;
    data.achievedAt = patch.status === "achieved" ? new Date() : null;
  }
  if (patch.horizon !== undefined) data.horizon = patch.horizon;
  if (patch.targetDate !== undefined) data.targetDate = patch.targetDate;
  if (patch.owner !== undefined) data.ownerId = await resolveUser(patch.owner, actor);

  return db.$transaction(async (tx) => {
    let suggestionId: string | null = null;
    if (protectedText) {
      const s = await tx.suggestion.create({ data: { entityType: "goal", entityId: current.id, proposed: text, reason, ...by(actor) } });
      suggestionId = s.id;
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested new wording for G-${current.number}`);
    }
    let goal = current;
    if (Object.keys(data).length) {
      goal = await tx.goal.update({ where: { id: current.id }, data });
      const parts = [
        current.status !== goal.status && `status ${goal.status}`,
        current.horizon !== goal.horizon && `moved to ${goal.horizon}`,
        current.title !== goal.title && "title",
        +(current.targetDate ?? 0) !== +(goal.targetDate ?? 0) && "target date",
        current.ownerId !== goal.ownerId && "owner",
      ].filter(Boolean);
      await logActivity(tx, actor, "goal", goal.id, "updated", `Updated G-${goal.number} "${goal.title}"${parts.length ? ": " + parts.join(", ") : ""}`, current);
    }
    return { goal, suggestionId };
  });
}
