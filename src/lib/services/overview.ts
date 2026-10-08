import type { Actor } from "../actor";
import { db } from "../db";
import { driveStatus } from "../google";
import { recentActivity } from "./activity";
import { targetOf } from "./asks";
import { briefForAI } from "./brief";
import { whenText } from "../time";
import { actorName, listFounders, userTz } from "./people";

/** A compact picture of the whole workspace: the first thing an AI should read. */
export async function workspaceOverview(actor: Actor) {
  const now = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [founders, open, proposed, overdue, mine, decisions, meetings, agenda, suggestions, activity, drive, brief] = await Promise.all([
    listFounders(),
    db.task.groupBy({ by: ["status"], _count: true, where: { status: { in: ["todo", "doing", "blocked"] } } }),
    db.task.count({ where: { status: "proposed" } }),
    db.task.findMany({ where: { status: { in: ["todo", "doing", "blocked"] }, dueDate: { lt: now } }, include: { assignee: true }, take: 20 }),
    actor.userId
      ? db.task.findMany({ where: { assigneeId: actor.userId, status: { in: ["todo", "doing", "blocked", "proposed"] } }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 30 })
      : Promise.resolve([]),
    db.decision.findMany({ where: { status: { in: ["active", "open"] } }, orderBy: { decidedAt: "desc" }, take: 20 }),
    db.meeting.findMany({ orderBy: { date: "desc" }, take: 5, select: { id: true, title: true, date: true, processedAt: true } }),
    db.agendaItem.findMany({ where: { meetingId: null, done: false }, orderBy: { createdAt: "asc" } }),
    db.suggestion.count({ where: { status: "open" } }),
    recentActivity({ since: weekAgo, limit: 25 }),
    driveStatus(),
    briefForAI(),
  ]);
  const [tz, events, asksToYou, yourAsks] = await Promise.all([
    userTz(actor.userId),
    db.event.findMany({
      where: { status: { in: ["confirmed", "proposed"] }, startsAt: { gte: new Date(Date.now() - 86_400_000), lte: new Date(Date.now() + 30 * 86_400_000) } },
      include: { attendance: true },
      orderBy: { startsAt: "asc" },
    }),
    actor.userId ? db.ask.findMany({ where: { toId: actor.userId, status: "open" }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    actor.userId ? db.ask.findMany({ where: { fromId: actor.userId, OR: [{ status: "open" }, { seenByAsker: false, status: { in: ["answered", "declined"] } }] }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);
  const name = (byId: string | null, agent: string | null) => actorName(founders, byId, agent);
  return {
    you: founders.find((f) => f.id === actor.userId)?.email ?? null,
    actingAs: actor.agent ? name(actor.userId, actor.agent) : null,
    today: now.toISOString().slice(0, 10),
    companyBrief: { noteId: brief.noteId, narrative: brief.narrative.map((b) => b.content).join("\n\n") || "(empty: offer to draft it)", rightNow: brief.rightNow },
    users: founders.map((f) => ({ name: f.name, email: f.email, owner: f.isOwner })),
    taskCounts: Object.fromEntries([...open.map((g) => [g.status, g._count]), ["proposed", proposed]]),
    yourOpenTasks: mine.map((t) => ({ ref: `T-${t.number}`, title: t.title, status: t.status, due: t.dueDate?.toISOString().slice(0, 10) ?? null })),
    overdue: overdue.map((t) => ({ ref: `T-${t.number}`, title: t.title, assignee: t.assignee?.name ?? t.assignee?.email ?? null, due: t.dueDate?.toISOString().slice(0, 10) })),
    recentDecisions: decisions.filter((d) => d.status === "active").slice(0, 10).map((d) => ({ ref: `D-${d.number}`, title: d.title, date: d.decidedAt.toISOString().slice(0, 10) })),
    stillToDecide: decisions.filter((d) => d.status === "open").map((d) => ({ ref: `D-${d.number}`, question: d.title })),
    recentMeetings: meetings.map((m) => ({ id: m.id, title: m.title, date: m.date.toISOString().slice(0, 10), summarised: !!m.processedAt })),
    nextAgenda: agenda.map((a) => a.text),
    yourTimezone: tz,
    requestsToYou: await Promise.all(
      asksToYou.map(async (a) => ({ ref: `A-${a.number}`, from: actorName(founders, a.fromId, a.fromAgent), question: a.question.slice(0, 300), by: a.dueDate?.toISOString().slice(0, 10) ?? null, about: (await targetOf(a.entityType, a.entityId))?.label ?? a.entityType })),
    ),
    yourRequests: yourAsks.map((a) => ({ ref: `A-${a.number}`, to: actorName(founders, a.toId, null), status: a.status, answer: a.answer || null })),
    comingUp: events.map((e) => ({
      ref: `E-${e.number}`,
      title: e.title,
      kind: e.kind,
      importance: e.importance,
      when: whenText(e.startsAt, e.allDay, tz, e.timezone),
      proposed: e.status === "proposed",
      going: e.attendance.filter((x) => x.status === "going").map((x) => founders.find((f) => f.id === x.userId)?.name ?? "?"),
    })),
    openSuggestions: suggestions,
    drive: drive.connected ? { folder: drive.folderName } : "not connected",
    lastWeek: activity.map((a) => `${a.createdAt.toISOString().slice(0, 10)} ${name(a.byId, a.agent)}: ${a.summary}`),
    rules: [
      "Reply and write in the language the user is writing to you in.",
      "Everything you write is labelled with your user's name and your agent name.",
      "You cannot overwrite text a person wrote: such edits become suggestions a person accepts.",
      "Meeting action items should be created as proposed tasks for a user to confirm.",
      "Keep the company brief current after work that changes the picture.",
    ],
  };
}
