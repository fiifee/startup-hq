import { by, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";

/**
 * What the next meeting should cover, assembled from the state of the work:
 * topics people added, overdue and blocked tasks, AI-proposed tasks nobody has
 * confirmed, and open AI suggestions.
 */
export async function getAgenda() {
  const now = new Date();
  const [items, overdue, blocked, proposed, suggestions, lastMeeting, toDecide, upcoming] = await Promise.all([
    db.agendaItem.findMany({ where: { meetingId: null, done: false }, orderBy: { createdAt: "asc" } }),
    db.task.findMany({ where: { status: { in: ["todo", "doing"] }, dueDate: { lt: now } }, include: { assignee: true }, orderBy: { dueDate: "asc" } }),
    db.task.findMany({ where: { status: "blocked" }, include: { assignee: true }, orderBy: { updatedAt: "desc" } }),
    db.task.findMany({ where: { status: "proposed" }, include: { assignee: true }, orderBy: { createdAt: "asc" } }),
    db.suggestion.count({ where: { status: "open" } }),
    db.meeting.findFirst({ orderBy: { date: "desc" }, select: { id: true, title: true, date: true } }),
    db.decision.findMany({ where: { status: "open" }, orderBy: { number: "asc" } }),
    db.event.findMany({
      where: { status: "confirmed", startsAt: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) } },
      include: { attendance: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return { items, overdue, blocked, proposed, openSuggestions: suggestions, lastMeeting, toDecide, upcoming };
}

export async function addAgendaItem(actor: Actor, text: string) {
  const t = text.trim();
  if (!t) throw new Error("Agenda item is empty");
  return db.$transaction(async (tx) => {
    const item = await tx.agendaItem.create({ data: { text: t.slice(0, 500), ...by(actor) } });
    await logActivity(tx, actor, "agenda", item.id, "created", `Added to agenda: ${t.slice(0, 80)}`);
    return item;
  });
}

export async function setAgendaItemDone(actor: Actor, id: string, done: boolean) {
  return db.$transaction(async (tx) => {
    const item = await tx.agendaItem.update({ where: { id }, data: { done } });
    await logActivity(tx, actor, "agenda", id, "updated", `${done ? "Closed" : "Reopened"} agenda item: ${item.text.slice(0, 80)}`);
    return item;
  });
}

export async function removeAgendaItem(actor: Actor, id: string) {
  await db.$transaction(async (tx) => {
    const item = await tx.agendaItem.delete({ where: { id } });
    await logActivity(tx, actor, "agenda", id, "deleted", `Removed agenda item: ${item.text.slice(0, 80)}`);
  });
}
