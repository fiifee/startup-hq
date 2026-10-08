import { generateText, Output } from "ai";
import { z } from "zod";
import { ai, type Actor } from "../actor";
import { db } from "../db";
import { modelFor, type Provider } from "../llm";
import { listGoals } from "./goals";
import { appendToNote, deleteBlock, editBlock, getNote } from "./notes";
import { actorName, listFounders } from "./people";

/**
 * The company brief: one living page every AI reads first. The narrative is
 * written by people and AIs (with the usual authorship rules); the "right now"
 * part is computed from goals, tasks and decisions, so it is never out of date.
 */
export async function briefNote() {
  const existing = await db.note.findFirst({ where: { kind: "brief" }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return db.note.create({ data: { title: "Company brief", kind: "brief", pinned: true } });
}

export async function getBrief() {
  const note = await briefNote();
  return getNote(note.id);
}

/** The computed half of the brief. */
export async function briefState() {
  const twoWeeks = new Date(Date.now() - 14 * 86_400_000);
  const [goals, doing, blocked, done, decisions, toDecide] = await Promise.all([
    listGoals(),
    db.task.findMany({ where: { status: "doing" }, include: { assignee: true }, orderBy: { updatedAt: "desc" }, take: 15 }),
    db.task.findMany({ where: { status: "blocked" }, include: { assignee: true }, take: 10 }),
    db.task.findMany({ where: { status: "done", completedAt: { gte: twoWeeks } }, include: { assignee: true }, orderBy: { completedAt: "desc" }, take: 15 }),
    db.decision.findMany({ where: { status: "active" }, orderBy: { decidedAt: "desc" }, take: 8 }),
    db.decision.findMany({ where: { status: "open" }, orderBy: { number: "asc" } }),
  ]);
  return { goals, doing, blocked, done, decisions, toDecide };
}

/** Everything that happened since the narrative was last touched. */
export async function briefStaleness(noteId: string) {
  const [last, reviewed] = await Promise.all([
    db.block.findFirst({ where: { noteId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.setting.findUnique({ where: { key: REVIEWED_KEY } }),
  ]);
  const times = [last?.updatedAt, reviewed ? new Date(reviewed.value) : null].filter((d): d is Date => !!d);
  const since = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : new Date(0);
  const blockIds = (await db.block.findMany({ where: { noteId }, select: { id: true } })).map((b) => b.id);
  const changes = await db.activity.findMany({
    where: {
      createdAt: { gt: since },
      NOT: [{ entityType: "block", entityId: { in: blockIds } }, { entityType: "suggestion" }],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return { since: times.length ? since : null, changes };
}

const REVIEWED_KEY = "brief.reviewedAt";

/** Record that someone (or their AI) checked the brief against recent changes. */
export async function markBriefReviewed() {
  const value = new Date().toISOString();
  await db.setting.upsert({ where: { key: REVIEWED_KEY }, update: { value }, create: { key: REVIEWED_KEY, value } });
}

const name = (u: { name: string | null; email: string } | null) => (u ? (u.name?.split(" ")[0] ?? u.email) : "unassigned");

/** The brief as one markdown text, for AIs and for the overview. */
export async function briefForAI() {
  const [note, state] = await Promise.all([getBrief(), briefState()]);
  const founders = await listFounders();
  const lines = [
    ...state.goals.map((g) => `- G-${g.number} ${g.title} (${g.horizon}${g.targetDate ? `, target ${g.targetDate.toISOString().slice(0, 10)}` : ""}): ${g.progress.done}/${g.progress.total} tasks done`),
  ];
  return {
    noteId: note.id,
    narrative: note.blocks.map((b) => ({ id: b.id, author: actorName(founders, b.byId, b.agent), writtenBy: b.agent ? "ai" : "human", content: b.content })),
    rightNow: {
      goals: lines,
      inProgress: state.doing.map((t) => `T-${t.number} ${t.title} (${name(t.assignee)})`),
      blocked: state.blocked.map((t) => `T-${t.number} ${t.title} (${name(t.assignee)})`),
      doneLastTwoWeeks: state.done.map((t) => `T-${t.number} ${t.title} (${name(t.assignee)})`),
      activeDecisions: state.decisions.map((d) => `D-${d.number} ${d.title}`),
      stillToDecide: state.toDecide.map((d) => `D-${d.number} ${d.title}`),
    },
  };
}

const opsSchema = z.object({
  operations: z.array(
    z.object({
      op: z.enum(["edit", "add", "remove"]),
      blockId: z.string().nullable().describe("Block to edit or remove; for add, the block to insert after (null = at the end)"),
      content: z.string().nullable().describe("New markdown for edit/add; null for remove"),
      reason: z.string().describe("One line: what changed in the company that makes this update necessary"),
    }),
  ),
});

/**
 * Bring the narrative up to date with what happened, using a user's own key.
 * People's paragraphs are never overwritten: edits to them arrive as suggestions.
 */
export async function refreshBriefWithKey(userId: string, provider?: Provider) {
  const m = await modelFor(userId, provider);
  if (!m) throw new Error("Add your own AI key in Settings first, so this runs on your credits.");
  const brief = await briefForAI();
  const { changes } = await briefStaleness(brief.noteId);
  const founders = await listFounders();
  const changeLines = changes.map((c) => `${c.createdAt.toISOString().slice(0, 10)} ${actorName(founders, c.byId, c.agent)}: ${c.summary}`);

  const { output } = await generateText({
    model: m.model,
    output: Output.object({ schema: opsSchema }),
    system: [
      "You maintain the company brief of a small startup: a short living document that tells any newcomer or AI what the company does, for whom, where it stands and what matters now.",
      "Update only what the recent changes make outdated, missing or wrong. Keep it concise; prefer editing a paragraph over adding one. Do not restate the task list: the brief carries the picture, not the items.",
      "Write in the language the existing brief is written in. If it is empty, write in the language most of the recent changes are in.",
      brief.narrative.length === 0
        ? "The brief is empty: draft it from scratch with sections like ## What we're building, ## For whom, ## Where we are, ## What matters now, ## People. Mark unknowns as questions rather than inventing facts."
        : "",
      "Return no operations if nothing needs to change.",
    ].filter(Boolean).join("\n"),
    prompt: JSON.stringify({ brief: brief.narrative, rightNow: brief.rightNow, changesSinceLastUpdate: changeLines.slice(-150) }, null, 1),
  });

  const actor: Actor = ai(userId, m.agent);
  let applied = 0;
  let suggested = 0;
  for (const op of output.operations) {
    try {
      if (op.op === "add" && op.content) {
        await appendToNote(actor, brief.noteId, op.content, op.blockId);
        applied++;
      } else if (op.op === "edit" && op.blockId && op.content) {
        const r = await editBlock(actor, op.blockId, op.content, op.reason);
        if (r.suggestionId) suggested++;
        else applied++;
      } else if (op.op === "remove" && op.blockId) {
        const r = await deleteBlock(actor, op.blockId, op.reason);
        if (r.suggestionId) suggested++;
        else applied++;
      }
    } catch {
      // A stale block id from the model: skip that operation, keep the rest.
    }
  }
  await markBriefReviewed();
  return { applied, suggested, considered: changes.length };
}
