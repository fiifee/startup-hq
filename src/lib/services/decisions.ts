import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";

/** open = a decision that still has to be made; the rest are made decisions. */
export const DECISION_STATUSES = ["open", "active", "reversed", "superseded"] as const;

export async function listDecisions(f: { search?: string; status?: string; limit?: number } = {}) {
  const where: Prisma.DecisionWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.search) {
    where.OR = [
      { title: { contains: f.search, mode: "insensitive" } },
      { rationale: { contains: f.search, mode: "insensitive" } },
    ];
  }
  return db.decision.findMany({
    where,
    orderBy: [{ decidedAt: "desc" }, { number: "desc" }],
    take: Math.min(f.limit ?? 100, 500),
    include: { meeting: { select: { id: true, title: true, date: true } } },
  });
}

export async function findDecision(ref: string | number) {
  const s = String(ref).trim();
  const num = s.match(/^(?:d-?|#)?(\d+)$/i);
  const d = num ? await db.decision.findUnique({ where: { number: Number(num[1]) } }) : await db.decision.findUnique({ where: { id: s } });
  if (!d) throw new Error(`Decision ${s} not found`);
  return d;
}

export async function recordDecision(
  actor: Actor,
  input: { title: string; rationale?: string; decidedAt?: Date; meetingId?: string | null; status?: "open" | "active" },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  const open = input.status === "open";
  return db.$transaction(async (tx) => {
    const d = await tx.decision.create({
      data: {
        title: title.slice(0, 300),
        rationale: input.rationale?.trim() ?? "",
        status: open ? "open" : "active",
        decidedAt: input.decidedAt ?? new Date(),
        meetingId: input.meetingId ?? null,
        ...by(actor, "created"),
        ...by(actor, "text"),
      },
    });
    await logActivity(tx, actor, "decision", d.id, "created", `${open ? "Proposed decision" : "Recorded"} D-${d.number} "${d.title}"`);
    return d;
  });
}

/**
 * Edit a decision, or settle an open one (status open → active stamps today's
 * date). An AI rewording what a person wrote files a suggestion instead.
 */
export async function updateDecision(actor: Actor, ref: string | number, patch: { title?: string; rationale?: string; status?: string }, reason = "") {
  const d = await findDecision(ref);
  if (patch.status && !DECISION_STATUSES.includes(patch.status as never)) throw new Error(`status must be one of ${DECISION_STATUSES.join(", ")}`);
  const text: { title?: string; rationale?: string } = {};
  if (patch.title?.trim() && patch.title.trim() !== d.title) text.title = patch.title.trim().slice(0, 300);
  if (patch.rationale !== undefined && patch.rationale.trim() !== d.rationale) text.rationale = patch.rationale.trim();
  const protectedText = isAI(actor) && !d.textAgent && Object.keys(text).length > 0;

  const data: Prisma.DecisionUncheckedUpdateInput = {};
  if (!protectedText && Object.keys(text).length) Object.assign(data, text, by(actor, "text"));
  if (patch.status && patch.status !== d.status) {
    data.status = patch.status;
    if (d.status === "open" && patch.status === "active") data.decidedAt = new Date();
  }

  return db.$transaction(async (tx) => {
    let suggestionId: string | null = null;
    if (protectedText) {
      const s = await tx.suggestion.create({ data: { entityType: "decision", entityId: d.id, proposed: text, reason, ...by(actor) } });
      suggestionId = s.id;
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested new wording for D-${d.number}`);
    }
    let decision = d;
    if (Object.keys(data).length) {
      decision = await tx.decision.update({ where: { id: d.id }, data });
      const what =
        d.status === "open" && decision.status === "active" ? "Decided" : data.status ? `Marked ${decision.status}` : "Edited";
      await logActivity(tx, actor, "decision", d.id, "updated", `${what} D-${d.number} "${decision.title}"`, d);
    }
    return { decision, suggestionId };
  });
}
