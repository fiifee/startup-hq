import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";

export async function listOpenSuggestions() {
  const rows = await db.suggestion.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } });
  const blockIds = rows.filter((r) => r.entityType === "block").map((r) => r.entityId);
  const taskIds = rows.filter((r) => r.entityType === "task").map((r) => r.entityId);
  const goalIds = rows.filter((r) => r.entityType === "goal").map((r) => r.entityId);
  const decisionIds = rows.filter((r) => r.entityType === "decision").map((r) => r.entityId);
  const [blocks, tasks, goals, decisions] = await Promise.all([
    db.block.findMany({ where: { id: { in: blockIds } }, include: { note: { select: { id: true, title: true, kind: true } } } }),
    db.task.findMany({ where: { id: { in: taskIds } } }),
    db.goal.findMany({ where: { id: { in: goalIds } } }),
    db.decision.findMany({ where: { id: { in: decisionIds } } }),
  ]);
  return rows.map((s) => ({
    ...s,
    block: blocks.find((b) => b.id === s.entityId) ?? null,
    task: tasks.find((t) => t.id === s.entityId) ?? null,
    goal: goals.find((g) => g.id === s.entityId) ?? null,
    decision: decisions.find((d) => d.id === s.entityId) ?? null,
  }));
}

/** Only a person can accept or reject; the accepted text keeps the AI's name on it. */
export async function resolveSuggestion(actor: Actor, id: string, accept: boolean) {
  if (isAI(actor)) throw new Error("Only a person can accept or reject suggestions");
  return db.$transaction(async (tx) => {
    const s = await tx.suggestion.findUniqueOrThrow({ where: { id } });
    if (s.status !== "open") throw new Error("This suggestion was already handled");
    const proposed = s.proposed as Record<string, unknown>;
    const author = { userId: s.byId, agent: s.agent };
    if (accept && s.entityType === "block") {
      const block = await tx.block.findUnique({ where: { id: s.entityId } });
      if (block) {
        if (proposed.delete) {
          await tx.block.delete({ where: { id: block.id } });
          await logActivity(tx, actor, "block", block.id, "deleted", `Accepted removal: ${block.content.slice(0, 80)}`, block);
        } else {
          await tx.block.update({ where: { id: block.id }, data: { content: String(proposed.content), ...by(author) } });
          await logActivity(tx, actor, "block", block.id, "updated", `Accepted edit: ${String(proposed.content).slice(0, 80)}`, block);
        }
      }
    }
    if (accept && s.entityType === "task") {
      const task = await tx.task.findUnique({ where: { id: s.entityId } });
      if (task) {
        await tx.task.update({
          where: { id: task.id },
          data: {
            ...(typeof proposed.title === "string" ? { title: proposed.title } : {}),
            ...(typeof proposed.description === "string" ? { description: proposed.description } : {}),
            ...by(author, "text"),
          },
        });
        await logActivity(tx, actor, "task", task.id, "updated", `Accepted AI wording for T-${task.number}`, task);
      }
    }
    if (accept && s.entityType === "goal") {
      const goal = await tx.goal.findUnique({ where: { id: s.entityId } });
      if (goal) {
        await tx.goal.update({
          where: { id: goal.id },
          data: {
            ...(typeof proposed.title === "string" ? { title: proposed.title } : {}),
            ...(typeof proposed.description === "string" ? { description: proposed.description } : {}),
            ...by(author, "text"),
          },
        });
        await logActivity(tx, actor, "goal", goal.id, "updated", `Accepted AI wording for G-${goal.number}`, goal);
      }
    }
    if (accept && s.entityType === "decision") {
      const d = await tx.decision.findUnique({ where: { id: s.entityId } });
      if (d) {
        await tx.decision.update({
          where: { id: d.id },
          data: {
            ...(typeof proposed.title === "string" ? { title: proposed.title } : {}),
            ...(typeof proposed.rationale === "string" ? { rationale: proposed.rationale } : {}),
            ...by(author, "text"),
          },
        });
        await logActivity(tx, actor, "decision", d.id, "updated", `Accepted AI wording for D-${d.number}`, d);
      }
    }
    await tx.suggestion.update({ where: { id }, data: { status: accept ? "accepted" : "rejected", resolvedById: actor.userId, resolvedAt: new Date() } });
    await logActivity(tx, actor, "suggestion", id, accept ? "accepted" : "rejected", `${accept ? "Accepted" : "Rejected"} a suggestion`);
  });
}
