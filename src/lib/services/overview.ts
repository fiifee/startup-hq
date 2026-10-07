import type { Actor } from "../actor";
import { db } from "../db";
import { driveStatus } from "../google";
import { recentActivity } from "./activity";
import { briefForAI } from "./brief";
import { actorName, listFounders } from "./people";

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
    db.decision.findMany({ where: { status: "active" }, orderBy: { decidedAt: "desc" }, take: 10 }),
    db.meeting.findMany({ orderBy: { date: "desc" }, take: 5, select: { id: true, title: true, date: true, processedAt: true } }),
    db.agendaItem.findMany({ where: { meetingId: null, done: false }, orderBy: { createdAt: "asc" } }),
    db.suggestion.count({ where: { status: "open" } }),
    recentActivity({ since: weekAgo, limit: 25 }),
    driveStatus(),
    briefForAI(),
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
    recentDecisions: decisions.map((d) => ({ ref: `D-${d.number}`, title: d.title, date: d.decidedAt.toISOString().slice(0, 10) })),
    recentMeetings: meetings.map((m) => ({ id: m.id, title: m.title, date: m.date.toISOString().slice(0, 10), summarised: !!m.processedAt })),
    nextAgenda: agenda.map((a) => a.text),
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
