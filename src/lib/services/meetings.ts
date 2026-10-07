import { by, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";
import { splitBlocks } from "./notes";
import { resolveUser } from "./people";

export async function listMeetings(limit = 30) {
  return db.meeting.findMany({
    orderBy: { date: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true, title: true, date: true, processedAt: true, processedBy: true, noteId: true, createdById: true, createdAgent: true,
      _count: { select: { tasks: true, decisions: true } },
    },
  });
}

export async function getMeeting(id: string) {
  const m = await db.meeting.findUnique({
    where: { id },
    include: {
      note: { include: { blocks: { orderBy: { position: "asc" } } } },
      tasks: { include: { assignee: true }, orderBy: { number: "asc" } },
      decisions: { orderBy: { number: "asc" } },
      agendaItems: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!m) throw new Error(`Meeting ${id} not found`);
  return m;
}

/**
 * Create a meeting with its notes page. Open agenda items are attached to it,
 * since this is the meeting that covered them.
 */
export async function createMeeting(actor: Actor, input: { title: string; date?: Date; transcript?: string; coverAgenda?: boolean }) {
  const title = input.title.trim() || "Meeting";
  return db.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { title, kind: "meeting", ...by(actor, "created") } });
    const meeting = await tx.meeting.create({
      data: { title, date: input.date ?? new Date(), transcript: input.transcript?.trim() ?? "", noteId: note.id, ...by(actor, "created") },
    });
    if (input.coverAgenda !== false) {
      await tx.agendaItem.updateMany({ where: { meetingId: null, done: false }, data: { meetingId: meeting.id } });
    }
    await logActivity(tx, actor, "meeting", meeting.id, "created", `Added meeting "${title}"`);
    return meeting;
  });
}

export async function updateMeeting(actor: Actor, id: string, patch: { title?: string; date?: Date; transcript?: string }) {
  const m = await getMeeting(id);
  return db.$transaction(async (tx) => {
    const updated = await tx.meeting.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim() || m.title } : {}),
        ...(patch.date ? { date: patch.date } : {}),
        ...(patch.transcript !== undefined ? { transcript: patch.transcript.trim() } : {}),
      },
    });
    if (patch.title) await tx.note.update({ where: { id: m.noteId }, data: { title: updated.title } });
    await logActivity(tx, actor, "meeting", id, "updated", `Updated meeting "${updated.title}"${patch.transcript !== undefined ? " (transcript)" : ""}`);
    return updated;
  });
}

export type MeetingOutcome = {
  summary: string;
  decisions?: { title: string; rationale?: string }[];
  actionItems?: { title: string; description?: string; assignee?: string | null; dueDate?: Date | null; priority?: string }[];
  followUps?: string[];
};

/**
 * Write what came out of a meeting: summary blocks in its notes, decisions in the
 * log, action items as *proposed* tasks a founder confirms, and follow-ups on the
 * next agenda. Everything carries the actor, so it shows whose AI wrote it.
 */
export async function saveMeetingOutcome(actor: Actor, meetingId: string, outcome: MeetingOutcome, label: string) {
  const m = await getMeeting(meetingId);
  const assignees = await Promise.all(
    (outcome.actionItems ?? []).map((a) => resolveUser(a.assignee ?? null, actor).catch(() => null)),
  );
  return db.$transaction(async (tx) => {
    const last = await tx.block.findFirst({ where: { noteId: m.noteId }, orderBy: { position: "desc" } });
    let pos = last?.position ?? 0;
    for (const content of splitBlocks(outcome.summary)) {
      pos += 1;
      await tx.block.create({ data: { noteId: m.noteId, position: pos, content, ...by(actor) } });
    }
    const decisions = [];
    for (const d of outcome.decisions ?? []) {
      const dec = await tx.decision.create({
        data: { title: d.title.trim().slice(0, 300), rationale: d.rationale?.trim() ?? "", decidedAt: m.date, meetingId: m.id, ...by(actor, "created") },
      });
      await logActivity(tx, actor, "decision", dec.id, "created", `Recorded D-${dec.number} "${dec.title}"`);
      decisions.push(dec);
    }
    const tasks = [];
    for (const [i, a] of (outcome.actionItems ?? []).entries()) {
      const t = await tx.task.create({
        data: {
          title: a.title.trim().slice(0, 300),
          description: a.description?.trim() ?? "",
          status: "proposed",
          priority: ["low", "normal", "high", "urgent"].includes(a.priority ?? "") ? a.priority! : "normal",
          assigneeId: assignees[i],
          dueDate: a.dueDate ?? null,
          meetingId: m.id,
          ...by(actor, "created"),
          ...by(actor, "text"),
        },
      });
      await logActivity(tx, actor, "task", t.id, "created", `Proposed T-${t.number} "${t.title}" from "${m.title}"`);
      tasks.push(t);
    }
    for (const text of outcome.followUps ?? []) {
      await tx.agendaItem.create({ data: { text: text.trim().slice(0, 500), ...by(actor) } });
    }
    await tx.meeting.update({ where: { id: m.id }, data: { processedAt: new Date(), processedBy: label } });
    await logActivity(tx, actor, "meeting", m.id, "processed",
      `Summarised "${m.title}": ${decisions.length} decisions, ${tasks.length} proposed tasks, ${(outcome.followUps ?? []).length} follow-ups`);
    return { decisions, tasks };
  });
}
