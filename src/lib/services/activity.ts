import type { Prisma } from "@prisma/client";
import type { Actor } from "../actor";
import { db } from "../db";

export type Tx = Prisma.TransactionClient;

export async function logActivity(
  tx: Tx,
  actor: Actor,
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
  before?: unknown,
) {
  await tx.activity.create({
    data: {
      entityType,
      entityId,
      action,
      summary: summary.slice(0, 500),
      before: before === undefined ? undefined : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
      byId: actor.userId,
      agent: actor.agent,
    },
  });
}

export async function recentActivity(opts: { since?: Date; limit?: number; entityType?: string; entityId?: string } = {}) {
  return db.activity.findMany({
    where: {
      ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
      ...(opts.entityType ? { entityType: opts.entityType } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 30, 200),
  });
}

/** Which logged changes can be undone with one click. */
export function isRevertible(a: { entityType: string; action: string; revertedAt: Date | null }) {
  if (a.revertedAt) return false;
  return (
    (a.entityType === "task" && (a.action === "updated" || a.action === "created")) ||
    (a.entityType === "block" && ["updated", "created", "deleted"].includes(a.action)) ||
    (a.entityType === "decision" && (a.action === "created" || a.action === "updated")) ||
    (a.entityType === "goal" && a.action === "updated") ||
    (a.entityType === "event" && (a.action === "updated" || a.action === "created")) ||
    (a.entityType === "comment" && (a.action === "updated" || a.action === "deleted"))
  );
}

/** Undo one change. The undo is itself logged, by the person who clicked it. */
export async function revertActivity(actor: Actor, activityId: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.activity.findUniqueOrThrow({ where: { id: activityId } });
    if (!isRevertible(a)) throw new Error("This change cannot be undone");
    const before = (a.before ?? {}) as Record<string, unknown>;

    if (a.entityType === "task") {
      if (a.action === "created") {
        await tx.task.update({ where: { id: a.entityId }, data: { status: "dropped" } });
      } else {
        const { id: _id, number: _n, createdAt: _c, updatedAt: _u, ...fields } = before as Record<string, unknown>;
        void _id; void _n; void _c; void _u;
        await tx.task.update({
          where: { id: a.entityId },
          data: {
            ...fields,
            dueDate: fields.dueDate ? new Date(fields.dueDate as string) : null,
            completedAt: fields.completedAt ? new Date(fields.completedAt as string) : null,
          } as Prisma.TaskUncheckedUpdateInput,
        });
      }
    } else if (a.entityType === "block") {
      if (a.action === "created") {
        await tx.block.deleteMany({ where: { id: a.entityId } });
      } else if (a.action === "updated") {
        await tx.block.update({
          where: { id: a.entityId },
          data: { content: before.content as string, byId: before.byId as string | null, agent: before.agent as string | null },
        });
      } else if (a.action === "deleted") {
        await tx.block.create({
          data: {
            id: a.entityId,
            noteId: before.noteId as string,
            position: before.position as number,
            content: before.content as string,
            byId: before.byId as string | null,
            agent: before.agent as string | null,
          },
        });
      }
    } else if (a.entityType === "comment") {
      if (a.action === "updated") {
        await tx.taskComment.update({
          where: { id: a.entityId },
          data: { body: before.body as string, editedById: (before.editedById as string | null) ?? null, editedAt: before.editedAt ? new Date(before.editedAt as string) : null },
        });
      } else {
        await tx.taskComment.create({
          data: {
            id: a.entityId,
            taskId: before.taskId as string,
            body: before.body as string,
            byId: before.byId as string | null,
            agent: before.agent as string | null,
            createdAt: new Date(before.createdAt as string),
          },
        });
      }
    } else if (a.entityType === "event") {
      if (a.action === "created") {
        await tx.event.update({ where: { id: a.entityId }, data: { status: "dismissed" } });
      } else {
        await tx.event.update({
          where: { id: a.entityId },
          data: {
            title: before.title as string,
            description: before.description as string,
            kind: before.kind as string,
            importance: before.importance as string,
            status: before.status as string,
            location: before.location as string,
            url: before.url as string,
            links: (before.links ?? []) as Prisma.InputJsonValue,
            allDay: before.allDay as boolean,
            timezone: before.timezone as string,
            startsAt: new Date(before.startsAt as string),
            endsAt: before.endsAt ? new Date(before.endsAt as string) : null,
            textById: before.textById as string | null,
            textAgent: before.textAgent as string | null,
          },
        });
      }
    } else if (a.entityType === "goal") {
      await tx.goal.update({
        where: { id: a.entityId },
        data: {
          title: before.title as string,
          description: before.description as string,
          status: before.status as string,
          horizon: before.horizon as string,
          targetDate: before.targetDate ? new Date(before.targetDate as string) : null,
          achievedAt: before.achievedAt ? new Date(before.achievedAt as string) : null,
          ownerId: before.ownerId as string | null,
          textById: before.textById as string | null,
          textAgent: before.textAgent as string | null,
        },
      });
    } else if (a.entityType === "decision") {
      if (a.action === "created") {
        await tx.decision.delete({ where: { id: a.entityId } });
      } else {
        await tx.decision.update({
          where: { id: a.entityId },
          data: {
            title: before.title as string,
            rationale: before.rationale as string,
            status: before.status as string,
            decidedAt: new Date(before.decidedAt as string),
            textById: (before.textById as string | null) ?? null,
            textAgent: (before.textAgent as string | null) ?? null,
          },
        });
      }
    }

    await tx.activity.update({ where: { id: a.id }, data: { revertedAt: new Date() } });
    await logActivity(tx, actor, a.entityType, a.entityId, "reverted", `Undid: ${a.summary}`);
  });
}
