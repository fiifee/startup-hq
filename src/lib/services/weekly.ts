import { generateText } from "ai";
import { ai as aiActor, type Actor } from "../actor";
import { db } from "../db";
import { modelFor } from "../llm";
import { createNote } from "./notes";
import { actorName, listFounders } from "./people";

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** The week in plain facts, built from the data with no AI involved. */
export async function weeklyFacts(end = new Date()) {
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const [founders, done, created, overdue, decisions, meetings, activity] = await Promise.all([
    listFounders(),
    db.task.findMany({ where: { completedAt: { gte: start, lte: end } }, include: { assignee: true } }),
    db.task.findMany({ where: { createdAt: { gte: start, lte: end } } }),
    db.task.findMany({ where: { status: { in: ["todo", "doing", "blocked"] }, dueDate: { lt: end } }, include: { assignee: true } }),
    db.decision.findMany({ where: { decidedAt: { gte: start, lte: end } } }),
    db.meeting.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    db.activity.findMany({ where: { createdAt: { gte: start, lte: end } } }),
  ]);
  const who = (u: { name: string | null; email: string } | null) => (u ? (u.name?.split(" ")[0] ?? u.email) : "unassigned");
  const aiChanges = activity.filter((a) => a.agent).length;
  const lines = [
    `**${fmt(start)} – ${fmt(end)}**`,
    `## Done (${done.length})`,
    ...(done.length ? done.map((t) => `- T-${t.number} ${t.title} — ${who(t.assignee)}`) : ["- Nothing marked done."]),
    `## Late (${overdue.length})`,
    ...(overdue.length ? overdue.map((t) => `- T-${t.number} ${t.title} — ${who(t.assignee)}, due ${fmt(t.dueDate!)}`) : ["- Nothing overdue."]),
    `## Decided (${decisions.length})`,
    ...(decisions.length ? decisions.map((d) => `- D-${d.number} ${d.title}`) : ["- No decisions recorded."]),
    `## Meetings (${meetings.length})`,
    ...(meetings.length ? meetings.map((m) => `- ${fmt(m.date)} ${m.title}`) : ["- No meetings."]),
    `## Activity`,
    `- ${created.length} tasks created, ${activity.length} changes in total, ${aiChanges} of them by AI.`,
    ...founders.map((f) => {
      const mine = activity.filter((a) => a.byId === f.id);
      return `- ${actorName(founders, f.id, null)}: ${mine.filter((a) => !a.agent).length} by hand, ${mine.filter((a) => a.agent).length} via AI`;
    }),
  ];
  return { start, end, markdown: lines.join("\n\n") };
}

/**
 * Write this week's summary as a note. With `userId`, that founder's own AI key
 * writes a short narrative on top of the facts; without a key it is facts only.
 */
export async function generateWeeklySummary(userId: string | null, triggeredBy?: Actor) {
  const facts = await weeklyFacts();
  let narrative = "";
  let actor: Actor = triggeredBy ?? aiActor(null, "Digest");
  const m = userId ? await modelFor(userId) : null;
  if (m) {
    const { text } = await generateText({
      model: m.model,
      system: "You write a weekly update for a three-person startup team. Be brief and concrete: 3-6 sentences on progress, what is stuck, and what needs a decision. No praise, no filler. Write in the language most of the task and decision titles are in.",
      prompt: facts.markdown,
    });
    narrative = text.trim();
    actor = aiActor(userId, m.agent);
  }
  const content = (narrative ? `${narrative}\n\n` : "") + facts.markdown;
  return createNote(actor, { title: `Week of ${fmt(facts.start)}`, kind: "weekly", content });
}
