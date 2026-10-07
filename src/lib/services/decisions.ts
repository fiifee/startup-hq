import type { Prisma } from "@prisma/client";
import { by, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";

export const DECISION_STATUSES = ["active", "reversed", "superseded"] as const;

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
    orderBy: { decidedAt: "desc" },
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

export async function recordDecision(actor: Actor, input: { title: string; rationale?: string; decidedAt?: Date; meetingId?: string | null }) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  return db.$transaction(async (tx) => {
    const d = await tx.decision.create({
      data: {
        title: title.slice(0, 300),
        rationale: input.rationale?.trim() ?? "",
        decidedAt: input.decidedAt ?? new Date(),
        meetingId: input.meetingId ?? null,
        ...by(actor, "created"),
      },
    });
    await logActivity(tx, actor, "decision", d.id, "created", `Recorded D-${d.number} "${d.title}"`);
    return d;
  });
}

export async function updateDecision(actor: Actor, ref: string | number, patch: { title?: string; rationale?: string; status?: string }) {
  const d = await findDecision(ref);
  if (patch.status && !DECISION_STATUSES.includes(patch.status as never)) throw new Error(`status must be one of ${DECISION_STATUSES.join(", ")}`);
  return db.$transaction(async (tx) => {
    const updated = await tx.decision.update({
      where: { id: d.id },
      data: {
        ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
        ...(patch.rationale !== undefined ? { rationale: patch.rationale.trim() } : {}),
        ...(patch.status ? { status: patch.status } : {}),
      },
    });
    await logActivity(tx, actor, "decision", d.id, "updated", `Updated D-${d.number}${patch.status ? ` (${patch.status})` : ""}`, d);
    return updated;
  });
}
