import type { Prisma } from "@prisma/client";
import { isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity, type Tx } from "./activity";
import { parseDeadline } from "../deadline";
import { matchUsers } from "../names";
import { ymd } from "../time";
import { listFounders, resolveUser, userTz } from "./people";

/**
 * Asking a teammate for input on something. One row per person asked. Only that
 * person answers (reply, "looks good", or "can't right now"); their AI may only
 * leave a draft for them.
 */
export const ASK_TARGETS = ["task", "note", "decision", "event"] as const;
export type AskTarget = (typeof ASK_TARGETS)[number];

/** Where an ask points: a link and a short label like "T-7 Revise questionnaire". */
export async function targetOf(entityType: string, entityId: string): Promise<{ href: string; label: string } | null> {
  if (entityType === "task") {
    const t = await db.task.findUnique({ where: { id: entityId }, select: { number: true, title: true } });
    return t && { href: `/tasks/${t.number}`, label: `T-${t.number} ${t.title}` };
  }
  if (entityType === "decision") {
    const d = await db.decision.findUnique({ where: { id: entityId }, select: { number: true, title: true } });
    return d && { href: "/brief#decisions", label: `D-${d.number} ${d.title}` };
  }
  if (entityType === "event") {
    const e = await db.event.findUnique({ where: { id: entityId }, select: { number: true, title: true } });
    return e && { href: `/timeline/${e.number}`, label: `E-${e.number} ${e.title}` };
  }
  if (entityType === "note") {
    const n = await db.note.findUnique({ where: { id: entityId }, select: { id: true, title: true, kind: true, meeting: { select: { id: true } } } });
    if (!n) return null;
    const href = n.meeting ? `/meetings/${n.meeting.id}` : n.kind === "brief" ? "/brief" : `/notes/${n.id}`;
    return { href, label: n.title };
  }
  return null;
}

/** A deadline written in the question ("before Friday"), read in the asker's time zone. */
async function deadlineIn(actor: Actor, question: string) {
  const d = parseDeadline(question, ymd(new Date(), await userTz(actor.userId)));
  return d ? new Date(`${d.date}T00:00:00Z`) : null;
}

async function insertAsks(tx: Tx, actor: Actor, input: { entityType: AskTarget; entityId: string; question: string; to: string[]; dueDate?: Date | null }, label: string) {
  const created = [];
  for (const toId of input.to) {
    const a = await tx.ask.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        question: input.question.trim().slice(0, 2000),
        fromId: actor.userId,
        fromAgent: actor.agent,
        toId,
        dueDate: input.dueDate ?? null,
      },
    });
    const who = await tx.user.findUnique({ where: { id: toId }, select: { name: true, email: true } });
    await logActivity(tx, actor, "ask", a.id, "created", `Asked ${who?.name?.split(" ")[0] ?? who?.email} for input on ${label}: ${a.question.slice(0, 80)}`);
    created.push(a);
  }
  return created;
}

/** Ask one or more teammates. `to` takes names, emails or ids; you can't ask yourself. */
export async function createAsk(actor: Actor, input: { entityType: AskTarget; entityId: string; question: string; to: string[]; dueDate?: Date | null }) {
  if (!ASK_TARGETS.includes(input.entityType)) throw new Error(`Can ask about: ${ASK_TARGETS.join(", ")}`);
  if (!input.question.trim()) throw new Error("Write what you'd like them to look at");
  const target = await targetOf(input.entityType, input.entityId);
  if (!target) throw new Error("Can't find what you're asking about");
  const ids = [...new Set(await Promise.all(input.to.map((t) => resolveUser(t, actor))))].filter((id): id is string => !!id && id !== actor.userId);
  if (!ids.length) throw new Error("Pick at least one teammate (not yourself)");
  const dueDate = input.dueDate === undefined || input.dueDate === null ? await deadlineIn(actor, input.question) : input.dueDate;
  return db.$transaction((tx) => insertAsks(tx, actor, { ...input, to: ids, dueDate }, target.label));
}

/**
 * "@Anna can you check this?" in a comment asks Anna. Matches first names,
 * full names without spaces, and email names. Returns the asks created.
 */
export async function asksFromMentions(actor: Actor, entityType: AskTarget, entityId: string, text: string) {
  const mentions = [...text.matchAll(/(^|[\s(])@([\p{L}][\p{L}0-9._-]*)/gu)].map((m) => m[2].replace(/[.,!?;:]+$/, ""));
  if (!mentions.length) return [];
  const founders = await listFounders();
  // Each mention must point at exactly one person ("@ann" → Anna); ambiguous ones are skipped.
  const to = [...new Set(mentions.flatMap((m) => {
    const found = matchUsers(m, founders);
    return found.length === 1 ? [found[0].id] : [];
  }))].filter((id) => id !== actor.userId);
  if (!to.length) return [];
  const target = await targetOf(entityType, entityId);
  if (!target) return [];
  const dueDate = await deadlineIn(actor, text);
  return db.$transaction((tx) => insertAsks(tx, actor, { entityType, entityId, question: text, to, dueDate }, target.label));
}

export async function findAsk(ref: string | number) {
  const s = String(ref).trim();
  const num = s.match(/^(?:a-?|#)?(\d+)$/i);
  const a = num ? await db.ask.findUnique({ where: { number: Number(num[1]) } }) : await db.ask.findUnique({ where: { id: s } });
  if (!a) throw new Error(`Request ${s} not found`);
  return a;
}

export async function listAsks(f: { toId?: string; fromId?: string; involving?: string; since?: Date; status?: string[]; entityType?: string; entityId?: string; unseenAnswered?: boolean; limit?: number }) {
  const where: Prisma.AskWhereInput = {};
  if (f.toId) where.toId = f.toId;
  if (f.fromId) where.fromId = f.fromId;
  if (f.involving) where.OR = [{ toId: f.involving }, { fromId: f.involving }];
  if (f.since) where.AND = [{ OR: [{ createdAt: { gte: f.since } }, { answeredAt: { gte: f.since } }] }];
  if (f.status) where.status = { in: f.status };
  if (f.entityType) where.entityType = f.entityType;
  if (f.entityId) where.entityId = f.entityId;
  if (f.unseenAnswered) {
    where.seenByAsker = false;
    where.status = { in: ["answered", "declined"] };
  }
  const rows = await db.ask.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: f.limit ?? 100 });
  return Promise.all(rows.map(async (a) => ({ ...a, target: await targetOf(a.entityType, a.entityId) })));
}

/**
 * The person asked answers: a reply, "looks good", or "can't right now". On a
 * task, a reply is also posted as a comment so the discussion stays in one place.
 */
export async function answerAsk(actor: Actor, ref: string | number, kind: "reply" | "approve" | "decline", text = "") {
  if (isAI(actor)) throw new Error("Only the person asked can answer. Leave a draft with draft_answer instead.");
  const a = await findAsk(ref);
  if (a.toId !== actor.userId) throw new Error("Only the person who was asked can answer");
  if (a.status !== "open") throw new Error("This request was already answered");
  const body = text.trim() || (kind === "approve" ? "Looks good." : kind === "decline" ? "Can't right now." : "");
  if (kind === "reply" && !body) throw new Error("Write your answer");
  return db.$transaction(async (tx) => {
    const updated = await tx.ask.update({
      where: { id: a.id },
      data: { status: kind === "decline" ? "declined" : "answered", answerKind: kind, answer: body, answeredAt: new Date(), draft: "", draftAgent: null },
    });
    if (a.entityType === "task" && kind !== "decline") {
      const asker = a.fromId ? await tx.user.findUnique({ where: { id: a.fromId }, select: { name: true } }) : null;
      await tx.taskComment.create({
        data: { taskId: a.entityId, body: `↩ To ${asker?.name?.split(" ")[0] ?? "the team"}: ${body}`, byId: actor.userId, agent: null },
      });
    }
    const target = await targetOf(a.entityType, a.entityId);
    await logActivity(tx, actor, "ask", a.id, "answered",
      `${kind === "approve" ? "Approved" : kind === "decline" ? "Couldn't help with" : "Answered"} a request on ${target?.label ?? a.entityType}: ${body.slice(0, 80)}`);
    return updated;
  });
}

/** An AI leaves a draft answer for its own user to review and send. */
export async function draftAnswer(actor: Actor, ref: string | number, text: string) {
  if (!isAI(actor)) throw new Error("Drafts are for AIs; answer directly instead");
  const a = await findAsk(ref);
  if (a.toId !== actor.userId) throw new Error("You can only draft answers to requests made to your own user");
  if (a.status !== "open") throw new Error("This request was already answered");
  return db.ask.update({ where: { id: a.id }, data: { draft: text.trim().slice(0, 4000), draftAgent: actor.agent } });
}

/** The asker withdraws a request, or marks an answer as read. */
export async function cancelAsk(actor: Actor, ref: string | number) {
  const a = await findAsk(ref);
  if (a.fromId !== actor.userId) throw new Error("Only whoever asked can withdraw it");
  if (a.status !== "open") throw new Error("Already answered");
  await db.$transaction(async (tx) => {
    await tx.ask.update({ where: { id: a.id }, data: { status: "cancelled" } });
    await logActivity(tx, actor, "ask", a.id, "cancelled", `Withdrew a request: ${a.question.slice(0, 80)}`);
  });
}

export async function markAnswersSeen(actor: Actor, ids: string[]) {
  await db.ask.updateMany({ where: { id: { in: ids }, fromId: actor.userId }, data: { seenByAsker: true } });
}
