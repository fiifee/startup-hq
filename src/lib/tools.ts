/**
 * Every capability an AI has, defined once. The MCP server (Claude, ChatGPT,
 * Gemini, Hermes), the REST shim and the in-app assistant all call these, so an
 * AI can do anything a founder can do in the UI, and every write carries the
 * actor so it shows whose AI did it.
 */
import { z } from "zod";
import type { Actor } from "./actor";
import { recentActivity } from "./services/activity";
import { addAgendaItem, getAgenda, setAgendaItemDone } from "./services/agenda";
import { findDecision, listDecisions, recordDecision, updateDecision } from "./services/decisions";
import { createDoc, linkFile, listFolder, readFile, searchDrive } from "./services/drive";
import { briefForAI, briefStaleness, markBriefReviewed } from "./services/brief";
import { createGoal, getGoalDetail, listGoals, updateGoal } from "./services/goals";
import { createMeeting, getMeeting, listMeetings, saveMeetingOutcome, updateMeeting } from "./services/meetings";
import { appendToNote, createNote, deleteBlock, editBlock, getNote, listNotes, noteForAI, toggleChecklistItem, updateNote } from "./services/notes";
import { workspaceOverview } from "./services/overview";
import { actorName, listFounders } from "./services/people";
import { searchAll } from "./services/search";
import { listOpenSuggestions } from "./services/suggestions";
import { addTaskComment, createTask, getTaskDetail, listTasks, updateTask } from "./services/tasks";

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  readOnly?: boolean;
  run: (actor: Actor, args: Record<string, unknown>) => Promise<unknown>;
};

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Use YYYY-MM-DD")
  .describe("Date as YYYY-MM-DD");
const toDate = (s: unknown) => (typeof s === "string" && s ? new Date(s) : undefined);
const taskRef = z.union([z.string(), z.number()]).describe('Task number like "T-12" or 12, or the task id');

async function namer() {
  const founders = await listFounders();
  return (byId: string | null, agent: string | null) => actorName(founders, byId, agent);
}

function taskOut(t: { number: number; title: string; status: string; priority: string; dueDate: Date | null; tags: string[]; assignee?: { name: string | null; email: string } | null; createdAgent?: string | null; meetingId?: string | null; goal?: { number: number; title: string } | null }) {
  return {
    ref: `T-${t.number}`,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee ? (t.assignee.name ?? t.assignee.email) : null,
    due: t.dueDate?.toISOString().slice(0, 10) ?? null,
    tags: t.tags,
    createdByAI: !!t.createdAgent,
    meetingId: t.meetingId ?? null,
    goal: t.goal ? `G-${t.goal.number} ${t.goal.title}` : null,
  };
}

const goalRef = z.union([z.string(), z.number()]).describe('Goal like "G-2" or 2, or the goal id');

function def<S extends z.ZodRawShape>(d: {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly?: boolean;
  run: (actor: Actor, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}): ToolDef {
  return { ...d, input: z.object(d.input), run: d.run as ToolDef["run"] };
}

export const TOOLS: ToolDef[] = [
  def({
    name: "get_overview",
    title: "Workspace overview",
    description:
      "Start here. Snapshot of the startup workspace: the company brief, users, task counts, your open tasks, overdue work, recent decisions and meetings, next meeting's agenda, and the last week's activity.",
    input: {},
    readOnly: true,
    run: (actor) => workspaceOverview(actor),
  }),
  def({
    name: "search",
    title: "Search everything",
    description: "Search tasks, notes, meeting transcripts and decisions by keyword.",
    input: { query: z.string().min(1) },
    readOnly: true,
    run: async (_a, { query }) => {
      const r = await searchAll(query);
      return {
        tasks: r.tasks.map(taskOut),
        notes: r.notes,
        meetings: r.meetings,
        decisions: r.decisions.map((d) => ({ ref: `D-${d.number}`, title: d.title, status: d.status })),
      };
    },
  }),

  // ---- Tasks
  def({
    name: "list_tasks",
    title: "List tasks",
    description: "List tasks. By default only open ones (proposed, todo, doing, blocked).",
    input: {
      status: z.array(z.enum(["proposed", "todo", "doing", "blocked", "done", "dropped"])).optional(),
      assignee: z.string().optional().describe('"me", a user\'s name or email, or "none"'),
      search: z.string().optional(),
      due_before: date.optional(),
      include_closed: z.boolean().optional(),
      meeting_id: z.string().optional(),
      goal: goalRef.optional(),
      limit: z.number().int().min(1).max(300).optional(),
    },
    readOnly: true,
    run: async (actor, a) =>
      (await listTasks(actor, {
        status: a.status,
        assignee: a.assignee,
        search: a.search,
        dueBefore: toDate(a.due_before),
        includeClosed: a.include_closed,
        meetingId: a.meeting_id,
        goal: a.goal === undefined ? undefined : String(a.goal),
        limit: a.limit,
      })).map(taskOut),
  }),
  def({
    name: "get_task",
    title: "Get task",
    description: "A task with its description, comments, linked Drive files and who wrote what.",
    input: { task: taskRef },
    readOnly: true,
    run: async (_a, { task }) => {
      const t = await getTaskDetail(task);
      const name = await namer();
      return {
        ...taskOut(t),
        description: t.description,
        textWrittenBy: name(t.textById, t.textAgent),
        createdBy: name(t.createdById, t.createdAgent),
        meeting: t.meeting,
        comments: t.comments.map((c) => ({ by: name(c.byId, c.agent), at: c.createdAt, body: c.body })),
        driveFiles: t.links.map((l) => ({ name: l.name, url: l.url, fileId: l.fileId })),
      };
    },
  }),
  def({
    name: "create_task",
    title: "Create task",
    description:
      'Create a task. Use status "proposed" for action items you inferred (e.g. from a meeting) so a user confirms them; use "todo" when a user asked you to add it. Link it to a goal when it serves one.',
    input: {
      title: z.string().min(1),
      description: z.string().optional(),
      assignee: z.string().optional().describe('"me", a user\'s name or email'),
      due: date.optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      status: z.enum(["proposed", "todo", "doing", "blocked", "done"]).optional(),
      tags: z.array(z.string()).optional(),
      meeting_id: z.string().optional(),
      goal: goalRef.optional(),
    },
    run: async (actor, a) =>
      taskOut(
        await createTask(actor, {
          title: a.title,
          description: a.description,
          assignee: a.assignee,
          dueDate: toDate(a.due) ?? null,
          priority: a.priority,
          status: a.status,
          tags: a.tags,
          meetingId: a.meeting_id,
          goal: a.goal === undefined ? undefined : String(a.goal),
        }),
      ),
  }),
  def({
    name: "update_task",
    title: "Update task",
    description:
      "Change a task's status, assignee, due date, priority, tags, title or description. If a person wrote the title/description, your new wording is filed as a suggestion for them to accept instead of overwriting.",
    input: {
      task: taskRef,
      status: z.enum(["proposed", "todo", "doing", "blocked", "done", "dropped"]).optional(),
      assignee: z.string().optional().describe('"me", a name, an email, or "none"'),
      due: date.nullable().optional().describe("YYYY-MM-DD, or null to clear"),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      tags: z.array(z.string()).optional(),
      goal: goalRef.nullable().optional().describe('Goal to link, or null to unlink'),
      title: z.string().optional(),
      description: z.string().optional(),
      reason: z.string().optional().describe("Why, shown to the user when it becomes a suggestion"),
    },
    run: async (actor, a) => {
      const { task, suggestionId } = await updateTask(
        actor,
        a.task,
        {
          status: a.status,
          assignee: a.assignee,
          dueDate: a.due === null ? null : toDate(a.due),
          priority: a.priority,
          tags: a.tags,
          goal: a.goal === undefined ? undefined : a.goal === null ? null : String(a.goal),
          title: a.title,
          description: a.description,
        },
        a.reason,
      );
      return { ...taskOut(task), ...(suggestionId ? { note: "A person wrote this text, so your wording was saved as a suggestion for them to accept." } : {}) };
    },
  }),
  def({
    name: "comment_on_task",
    title: "Comment on task",
    description: "Add a progress note or comment to a task. Comments are never overwritten.",
    input: { task: taskRef, body: z.string().min(1) },
    run: async (actor, a) => {
      await addTaskComment(actor, a.task, a.body);
      return { ok: true };
    },
  }),

  // ---- Company brief
  def({
    name: "get_brief",
    title: "Company brief",
    description:
      "The living company brief: the narrative (blocks with ids and authors) plus a computed 'right now' (goals and progress, in progress, blocked, recently done, decisions), and the changes since the narrative was last updated. Update the narrative with edit_block / append_to_note on its noteId; call brief_reviewed when it needs no change.",
    input: {},
    readOnly: true,
    run: async () => {
      const brief = await briefForAI();
      const founders = await listFounders();
      const { since, changes } = await briefStaleness(brief.noteId);
      return {
        ...brief,
        lastUpdated: since,
        changesSinceLastUpdate: changes.slice(-80).map((c) => `${c.createdAt.toISOString().slice(0, 10)} ${actorName(founders, c.byId, c.agent)}: ${c.summary}`),
      };
    },
  }),
  def({
    name: "brief_reviewed",
    title: "Mark brief reviewed",
    description: "Record that you checked the company brief against recent changes and it is still accurate.",
    input: {},
    run: async () => {
      await markBriefReviewed();
      return { ok: true };
    },
  }),

  // ---- Goals
  def({
    name: "list_goals",
    title: "Goals and roadmap",
    description: "Goals on the roadmap with progress (tasks done / total). horizon: now, next, later. By default only active goals.",
    input: { status: z.enum(["active", "achieved", "dropped"]).optional(), include_closed: z.boolean().optional() },
    readOnly: true,
    run: async (_a, a) =>
      (await listGoals({ status: a.status, includeClosed: a.include_closed })).map((g) => ({
        ref: `G-${g.number}`,
        title: g.title,
        status: g.status,
        horizon: g.horizon,
        target: g.targetDate?.toISOString().slice(0, 10) ?? null,
        progress: `${g.progress.done}/${g.progress.total} tasks done`,
      })),
  }),
  def({
    name: "get_goal",
    title: "Get goal",
    description: "A goal with its description and all tasks linked to it.",
    input: { goal: goalRef },
    readOnly: true,
    run: async (_a, a) => {
      const g = await getGoalDetail(a.goal);
      const name = await namer();
      return {
        ref: `G-${g.number}`,
        title: g.title,
        description: g.description,
        status: g.status,
        horizon: g.horizon,
        target: g.targetDate?.toISOString().slice(0, 10) ?? null,
        progress: g.progress,
        textWrittenBy: name(g.textById, g.textAgent),
        tasks: g.tasks.map((t) => ({ ref: `T-${t.number}`, title: t.title, status: t.status })),
      };
    },
  }),
  def({
    name: "create_goal",
    title: "Create goal",
    description: "Add a goal to the roadmap. horizon: now (this period), next, later.",
    input: {
      title: z.string().min(1),
      description: z.string().optional(),
      horizon: z.enum(["now", "next", "later"]).optional(),
      target: date.optional(),
      owner: z.string().optional().describe('"me", a user\'s name or email'),
    },
    run: async (actor, a) => {
      const g = await createGoal(actor, { title: a.title, description: a.description, horizon: a.horizon, targetDate: toDate(a.target) ?? null, owner: a.owner });
      return { ref: `G-${g.number}` };
    },
  }),
  def({
    name: "update_goal",
    title: "Update goal",
    description: "Change a goal's status (active, achieved, dropped), horizon, target date, owner or wording. Rewording a person's text becomes a suggestion.",
    input: {
      goal: goalRef,
      status: z.enum(["active", "achieved", "dropped"]).optional(),
      horizon: z.enum(["now", "next", "later"]).optional(),
      target: date.nullable().optional(),
      owner: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      reason: z.string().optional(),
    },
    run: async (actor, a) => {
      const { goal, suggestionId } = await updateGoal(
        actor,
        a.goal,
        { status: a.status, horizon: a.horizon, targetDate: a.target === null ? null : toDate(a.target), owner: a.owner, title: a.title, description: a.description },
        a.reason,
      );
      return { ref: `G-${goal.number}`, status: goal.status, horizon: goal.horizon, ...(suggestionId ? { note: "A person wrote this text; your wording was saved as a suggestion." } : {}) };
    },
  }),

  // ---- Notes
  def({
    name: "list_notes",
    title: "List notes",
    description: "List notes. kind: note (general), meeting (meeting notes), weekly (weekly summaries).",
    input: { kind: z.enum(["note", "meeting", "weekly"]).optional(), search: z.string().optional(), limit: z.number().int().max(200).optional() },
    readOnly: true,
    run: async (_a, a) =>
      (await listNotes(a)).map((n) => ({ id: n.id, title: n.title, kind: n.kind, pinned: n.pinned, updatedAt: n.updatedAt, meetingId: n.meeting?.id ?? null })),
  }),
  def({
    name: "get_note",
    title: "Read note",
    description: "Read a note as blocks. Each block has an id, its author, and whether a human or an AI wrote it.",
    input: { note_id: z.string() },
    readOnly: true,
    run: async (_a, { note_id }) => noteForAI(await getNote(note_id), await namer()),
  }),
  def({
    name: "create_note",
    title: "Create note",
    description: "Create a note from markdown. Blank lines separate blocks.",
    input: { title: z.string().min(1), content: z.string().optional() },
    run: async (actor, a) => {
      const n = await createNote(actor, { title: a.title, content: a.content });
      return { id: n.id, title: n.title };
    },
  }),
  def({
    name: "append_to_note",
    title: "Add to note",
    description: "Add markdown to a note, at the end or after a given block.",
    input: { note_id: z.string(), content: z.string().min(1), after_block_id: z.string().optional() },
    run: async (actor, a) => {
      const blocks = await appendToNote(actor, a.note_id, a.content, a.after_block_id);
      return { added: blocks.map((b) => b.id) };
    },
  }),
  def({
    name: "edit_block",
    title: "Edit note block",
    description:
      "Replace one block's text (empty text removes it). Blocks a person wrote are not changed: your edit becomes a suggestion they accept or reject.",
    input: { block_id: z.string(), content: z.string(), reason: z.string().optional() },
    run: async (actor, a) => {
      const r = await editBlock(actor, a.block_id, a.content, a.reason);
      return r.suggestionId ? { suggested: true, note: "A person wrote this block; your edit is waiting for their approval." } : { updated: true };
    },
  }),
  def({
    name: "delete_block",
    title: "Remove note block",
    description: "Remove a block. For blocks a person wrote, this files a removal suggestion instead.",
    input: { block_id: z.string(), reason: z.string().optional() },
    run: async (actor, a) => {
      const r = await deleteBlock(actor, a.block_id, a.reason);
      return r.suggestionId ? { suggested: true } : { deleted: true };
    },
  }),
  def({
    name: "toggle_checklist_item",
    title: "Tick checklist item",
    description: "Tick or untick a checklist item (markdown '- [ ] item') in a note block. Works on any block; ticking never counts as rewriting.",
    input: {
      block_id: z.string(),
      item: z.union([z.number().int().min(0), z.string()]).describe("0-based index, or part of the item's text"),
      checked: z.boolean().optional().describe("Omit to toggle"),
    },
    run: async (actor, a) => toggleChecklistItem(actor, a.block_id, a.item, a.checked),
  }),
  def({
    name: "rename_note",
    title: "Rename or pin note",
    description: "Change a note's title or pin it to the top.",
    input: { note_id: z.string(), title: z.string().optional(), pinned: z.boolean().optional() },
    run: async (actor, a) => {
      const n = await updateNote(actor, a.note_id, { title: a.title, pinned: a.pinned });
      return { id: n.id, title: n.title, pinned: n.pinned };
    },
  }),

  // ---- Meetings
  def({
    name: "list_meetings",
    title: "List meetings",
    description: "Recent meetings, newest first, and whether each has been summarised.",
    input: { limit: z.number().int().max(200).optional() },
    readOnly: true,
    run: async (_a, a) =>
      (await listMeetings(a.limit)).map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date.toISOString().slice(0, 10),
        summarised: !!m.processedAt,
        summarisedBy: m.processedBy,
        noteId: m.noteId,
        tasks: m._count.tasks,
        decisions: m._count.decisions,
      })),
  }),
  def({
    name: "get_meeting",
    title: "Get meeting",
    description:
      "A meeting with its notes, decisions, tasks and the agenda it covered. Set include_transcript to read the transcript.",
    input: { meeting_id: z.string(), include_transcript: z.boolean().optional() },
    readOnly: true,
    run: async (_a, a) => {
      const m = await getMeeting(a.meeting_id);
      const name = await namer();
      return {
        id: m.id,
        title: m.title,
        date: m.date.toISOString().slice(0, 10),
        summarisedBy: m.processedBy,
        notes: noteForAI({ ...m.note, meeting: null }, name),
        agendaCovered: m.agendaItems.map((i) => i.text),
        decisions: m.decisions.map((d) => ({ ref: `D-${d.number}`, title: d.title, rationale: d.rationale, status: d.status })),
        tasks: m.tasks.map(taskOut),
        transcriptLength: m.transcript.length,
        ...(a.include_transcript ? { transcript: m.transcript } : {}),
      };
    },
  }),
  def({
    name: "create_meeting",
    title: "Add meeting",
    description: "Add a meeting, optionally with its transcript. Covers the currently open agenda items.",
    input: { title: z.string().min(1), date: date.optional(), transcript: z.string().optional() },
    run: async (actor, a) => {
      const m = await createMeeting(actor, { title: a.title, date: toDate(a.date), transcript: a.transcript });
      return { id: m.id, noteId: m.noteId };
    },
  }),
  def({
    name: "set_meeting_transcript",
    title: "Set meeting transcript",
    description: "Replace a meeting's transcript.",
    input: { meeting_id: z.string(), transcript: z.string() },
    run: async (actor, a) => {
      await updateMeeting(actor, a.meeting_id, { transcript: a.transcript });
      return { ok: true };
    },
  }),
  def({
    name: "save_meeting_outcome",
    title: "Save meeting summary",
    description:
      "After reading a meeting transcript, save in one call: a markdown summary (added to the meeting notes), decisions (to the decision log), action items (as proposed tasks for users to confirm), and follow-ups (to the next agenda). Write in the language the user is talking to you in; when working from the transcript alone, in the transcript's language. Keep names and terms as they are.",
    input: {
      meeting_id: z.string(),
      summary: z.string().min(1).describe("Markdown. Short sections; bullet points over prose."),
      decisions: z.array(z.object({ title: z.string(), rationale: z.string().optional() })).optional(),
      action_items: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            assignee: z.string().optional().describe("User name or email"),
            due: date.optional(),
            priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
          }),
        )
        .optional(),
      follow_ups: z.array(z.string()).optional().describe("Open questions for the next meeting's agenda"),
    },
    run: async (actor, a) => {
      const name = await namer();
      const r = await saveMeetingOutcome(
        actor,
        a.meeting_id,
        {
          summary: a.summary,
          decisions: a.decisions,
          actionItems: a.action_items?.map((x) => ({ ...x, dueDate: toDate(x.due) ?? null })),
          followUps: a.follow_ups,
        },
        name(actor.userId, actor.agent),
      );
      return { decisions: r.decisions.map((d) => `D-${d.number}`), proposedTasks: r.tasks.map((t) => `T-${t.number}`) };
    },
  }),

  // ---- Decisions
  def({
    name: "list_decisions",
    title: "Decision log",
    description: "The decision log, newest first. Check it before proposing something that may already have been decided.",
    input: { search: z.string().optional(), status: z.enum(["active", "reversed", "superseded"]).optional() },
    readOnly: true,
    run: async (_a, a) => {
      const name = await namer();
      return (await listDecisions(a)).map((d) => ({
        ref: `D-${d.number}`,
        title: d.title,
        rationale: d.rationale,
        status: d.status,
        date: d.decidedAt.toISOString().slice(0, 10),
        meeting: d.meeting?.title ?? null,
        recordedBy: name(d.createdById, d.createdAgent),
      }));
    },
  }),
  def({
    name: "record_decision",
    title: "Record decision",
    description: "Add a decision to the log, with the reasoning behind it.",
    input: { title: z.string().min(1), rationale: z.string().optional(), date: date.optional(), meeting_id: z.string().optional() },
    run: async (actor, a) => {
      const d = await recordDecision(actor, { title: a.title, rationale: a.rationale, decidedAt: toDate(a.date), meetingId: a.meeting_id });
      return { ref: `D-${d.number}` };
    },
  }),
  def({
    name: "update_decision",
    title: "Update decision",
    description: "Mark a decision reversed or superseded, or refine its wording.",
    input: {
      decision: z.union([z.string(), z.number()]).describe('"D-3", 3 or the id'),
      status: z.enum(["active", "reversed", "superseded"]).optional(),
      title: z.string().optional(),
      rationale: z.string().optional(),
    },
    run: async (actor, a) => {
      await findDecision(a.decision);
      const d = await updateDecision(actor, a.decision, a);
      return { ref: `D-${d.number}`, status: d.status };
    },
  }),

  // ---- Agenda
  def({
    name: "get_agenda",
    title: "Next meeting agenda",
    description: "What the next meeting should cover: added topics, overdue and blocked tasks, unconfirmed proposed tasks.",
    input: {},
    readOnly: true,
    run: async () => {
      const g = await getAgenda();
      const name = await namer();
      return {
        topics: g.items.map((i) => ({ id: i.id, text: i.text, addedBy: name(i.byId, i.agent) })),
        overdue: g.overdue.map(taskOut),
        blocked: g.blocked.map(taskOut),
        awaitingConfirmation: g.proposed.map(taskOut),
        openSuggestions: g.openSuggestions,
        lastMeeting: g.lastMeeting,
      };
    },
  }),
  def({
    name: "add_agenda_item",
    title: "Add agenda topic",
    description: "Add a topic to the next meeting's agenda.",
    input: { text: z.string().min(1) },
    run: async (actor, a) => {
      const i = await addAgendaItem(actor, a.text);
      return { id: i.id };
    },
  }),
  def({
    name: "close_agenda_item",
    title: "Close agenda topic",
    description: "Mark an agenda topic as handled.",
    input: { item_id: z.string() },
    run: async (actor, a) => {
      await setAgendaItemDone(actor, a.item_id, true);
      return { ok: true };
    },
  }),

  // ---- Google Drive
  def({
    name: "drive_list",
    title: "List Drive folder",
    description: "List files in the startup's shared Google Drive folder (or one of its sub-folders).",
    input: { folder_id: z.string().optional() },
    readOnly: true,
    run: async (_a, a) => (await listFolder(a.folder_id)).map((f) => ({ id: f.id, name: f.name, type: f.mimeType, url: f.webViewLink, modified: f.modifiedTime })),
  }),
  def({
    name: "drive_search",
    title: "Search Drive",
    description: "Search Google Drive file names and contents.",
    input: { query: z.string().min(1) },
    readOnly: true,
    run: async (_a, a) => (await searchDrive(a.query)).map((f) => ({ id: f.id, name: f.name, type: f.mimeType, url: f.webViewLink, modified: f.modifiedTime })),
  }),
  def({
    name: "drive_read",
    title: "Read Drive file",
    description: "Read a Google Doc (as markdown), Sheet (as CSV), Slides (as text) or text file.",
    input: { file_id: z.string(), max_chars: z.number().int().max(200_000).optional() },
    readOnly: true,
    run: async (_a, a) => readFile(a.file_id, a.max_chars),
  }),
  def({
    name: "drive_create_doc",
    title: "Create Google Doc",
    description: "Create a Google Doc from markdown in the shared folder.",
    input: { name: z.string().min(1), content: z.string(), folder_id: z.string().optional() },
    run: async (actor, a) => {
      const f = await createDoc(actor, a.name, a.content, a.folder_id);
      return { id: f.id, url: f.webViewLink };
    },
  }),
  def({
    name: "drive_link",
    title: "Attach Drive file",
    description: "Attach a Drive file to a task, note or meeting.",
    input: { file_id: z.string(), task: taskRef.optional(), note_id: z.string().optional(), meeting_id: z.string().optional() },
    run: async (actor, a) => {
      const taskId = a.task !== undefined ? (await getTaskDetail(a.task)).id : undefined;
      const l = await linkFile(actor, a.file_id, { taskId, noteId: a.note_id, meetingId: a.meeting_id });
      return { id: l.id, name: l.name };
    },
  }),

  // ---- Awareness
  def({
    name: "recent_activity",
    title: "Recent activity",
    description: "Who changed what recently, people and AI.",
    input: { since: date.optional(), limit: z.number().int().max(200).optional() },
    readOnly: true,
    run: async (_a, a) => {
      const name = await namer();
      return (await recentActivity({ since: toDate(a.since), limit: a.limit ?? 40 })).map((x) => ({
        at: x.createdAt,
        by: name(x.byId, x.agent),
        ai: !!x.agent,
        what: x.summary,
      }));
    },
  }),
  def({
    name: "list_suggestions",
    title: "Pending suggestions",
    description: "AI edits to human-written text that are waiting for a person to accept.",
    input: {},
    readOnly: true,
    run: async () => {
      const name = await namer();
      return (await listOpenSuggestions()).map((s) => ({
        id: s.id,
        by: name(s.byId, s.agent),
        on: s.task ? `T-${s.task.number}` : s.block ? `note "${s.block.note.title}"` : s.entityType,
        proposed: s.proposed,
        reason: s.reason,
      }));
    },
  }),
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export async function runTool(actor: Actor, name: string, args: unknown) {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  return tool.run(actor, parsed.data);
}
