"use server";

/**
 * Everything a user does by hand in the UI. Each action runs as that user
 * (no agent), through the same services the AI uses.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/components/ui";
import { human } from "@/lib/actor";
import { autoSummarise, maybeRefreshBrief } from "@/lib/auto";
import { fillMissingDeadlines, suggestDeadline } from "@/lib/deadline-ai";
import { isSpeakerLine } from "@/lib/capture";
import { API_TOKEN_PREFIX } from "@/lib/agent-auth";
import { requireOwner, requireUser } from "@/lib/auth";
import { encrypt, randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { disconnectDrive, driveStatus, setDriveFolder } from "@/lib/google";
import { PROVIDERS, type Provider } from "@/lib/llm";
import { processMeetingWithKey } from "@/lib/process-meeting";
import { revertActivity } from "@/lib/services/activity";
import { markBriefReviewed, refreshBriefWithKey } from "@/lib/services/brief";
import { addEventNote, createEvent, editEventNote, setAttendance, updateEvent } from "@/lib/services/events";
import { createGoal, updateGoal, type GoalPatch } from "@/lib/services/goals";
import { isValidTz, parseWhen } from "@/lib/time";
import { addAgendaItem, removeAgendaItem, setAgendaItemDone } from "@/lib/services/agenda";
import { recordDecision, updateDecision } from "@/lib/services/decisions";
import { createFile, fileMeta, linkFile, listFolder, NEW_KINDS, type NewKind, searchDrive, unlinkFile } from "@/lib/services/drive";
import { setMeetingFormat } from "@/lib/services/format";
import { extractEvents } from "@/lib/extract-event";
import { createMeeting, deleteMeeting, updateMeeting } from "@/lib/services/meetings";
import { appendToNote, createNote, deleteBlock, editBlock, moveBlock, toggleChecklistItem, updateNote } from "@/lib/services/notes";
import { resolveSuggestion } from "@/lib/services/suggestions";
import { addTaskComment, createTask, deleteTask, editTaskComment, updateTask, type TaskPatch } from "@/lib/services/tasks";
import { answerAsk, cancelAsk, createAsk, markAnswersSeen, type AskTarget } from "@/lib/services/asks";
import { generateWeeklySummary } from "@/lib/services/weekly";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function me() {
  const user = await requireUser();
  // After any change, the user's AI may bring the brief up to date (if they opted in).
  after(() => maybeRefreshBrief(user.id));
  return { user, actor: human(user.id) };
}

function done<T>(data?: T): Result<T> {
  revalidatePath("/", "layout");
  return { ok: true, data };
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return done(await fn());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const dateOrNull = (s: string | null | undefined) => (s ? new Date(s) : null);

// ---- Tasks

export async function createTaskAction(input: { title: string; description?: string; assignee?: string | null; due?: string | null; priority?: string; status?: string; meetingId?: string | null; goal?: string | null; eventId?: string | null }) {
  const { actor } = await me();
  return attempt(async () => {
    const t = await createTask(actor, { ...input, dueDate: dateOrNull(input.due), assignee: input.assignee ?? null });
    return { number: t.number };
  });
}

export async function updateTaskAction(ref: string, patch: Omit<TaskPatch, "dueDate"> & { due?: string | null }) {
  const { actor } = await me();
  const { due, ...rest } = patch;
  return attempt(async () => {
    await updateTask(actor, ref, { ...rest, ...(due !== undefined ? { dueDate: dateOrNull(due) } : {}) });
  });
}

export async function deleteTaskAction(ref: string) {
  const { actor } = await me();
  await deleteTask(actor, ref);
  revalidatePath("/", "layout");
  redirect("/tasks");
}

export async function editCommentAction(commentId: string, body: string) {
  const { actor } = await me();
  return attempt(() => editTaskComment(actor, commentId, body).then(() => undefined));
}

// ---- Asking teammates for input

export async function askAction(input: { entityType: AskTarget; entityId: string; to: string[]; question: string; due?: string | null }) {
  const { actor } = await me();
  return attempt(async () => {
    const asks = await createAsk(actor, { ...input, dueDate: dateOrNull(input.due) });
    return { count: asks.length };
  });
}

/** The deadline written in a request, for the Ask form to show as you type. */
export async function suggestDeadlineAction(text: string) {
  const { user } = await me();
  return attempt(() => suggestDeadline(user.id, user.timezone, text));
}

export async function answerAskAction(id: string, kind: "reply" | "approve" | "decline", text?: string) {
  const { actor } = await me();
  return attempt(() => answerAsk(actor, id, kind, text).then(() => undefined));
}

export async function cancelAskAction(id: string) {
  const { actor } = await me();
  return attempt(() => cancelAsk(actor, id));
}

export async function seenAnswersAction(ids: string[]) {
  const { actor } = await me();
  return attempt(() => markAnswersSeen(actor, ids));
}

export async function commentAction(ref: string, body: string) {
  const { user, actor } = await me();
  // "@Liis … before the board meeting" — if the built-in reader found no date, the AI may.
  if (body.includes("@")) after(() => fillMissingDeadlines(user.id));
  return attempt(() => addTaskComment(actor, ref, body).then(() => undefined));
}

// ---- Timeline

type EventForm = {
  title?: string;
  kind?: string;
  importance?: string;
  date?: string;
  time?: string;
  endDate?: string | null;
  endTime?: string | null;
  timezone?: string;
  location?: string;
  url?: string;
  links?: { label?: string; url: string }[];
  description?: string;
  source?: string;
  sourceQuote?: string;
};

function when(f: EventForm) {
  if (!f.date) return null;
  return parseWhen(f.time ? `${f.date} ${f.time}` : f.date, f.timezone);
}

/** End of an event: an explicit end date/time, or an end time on the start day. */
function endOf(f: EventForm) {
  const day = f.endDate || (f.endTime ? f.date : null);
  if (!day) return null;
  return parseWhen(f.endTime && f.time ? `${day} ${f.endTime}` : day, f.timezone).date;
}

export async function createEventAction(f: EventForm) {
  const { actor } = await me();
  return attempt(async () => {
    const w = when(f);
    if (!w || !f.title?.trim()) throw new Error("Add a title and a date");
    const r = await createEvent(actor, {
      ...f,
      title: f.title,
      location: f.location ?? undefined,
      url: f.url ?? undefined,
      startsAt: w.date,
      allDay: w.allDay,
      endsAt: endOf(f),
    });
    return { number: r.event.number, duplicate: r.duplicate };
  });
}

/** Read events out of pasted text with the user's own AI, for review before saving. */
export async function extractEventsAction(text: string) {
  const { user } = await me();
  return attempt(() => extractEvents(user.id, user.timezone, text));
}

export async function updateEventAction(ref: string, f: EventForm & { status?: string }) {
  const { actor } = await me();
  return attempt(async () => {
    const w = when(f);
    await updateEvent(actor, ref, { ...f, ...(w ? { startsAt: w.date, allDay: w.allDay } : {}) });
  });
}

/** Confirm (or dismiss) events an AI proposed. */
export async function confirmEventsAction(refs: string[], accept: boolean) {
  const { actor } = await me();
  return attempt(async () => {
    for (const r of refs) await updateEvent(actor, r, { status: accept ? "confirmed" : "dismissed" });
  });
}

export async function setAttendanceAction(ref: string, status: string) {
  const { actor } = await me();
  return attempt(() => setAttendance(actor, ref, status, "me"));
}

export async function addEventNoteAction(ref: string, body: string) {
  const { user, actor } = await me();
  if (body.includes("@")) after(() => fillMissingDeadlines(user.id));
  return attempt(() => addEventNote(actor, ref, body).then(() => undefined));
}

export async function editEventNoteAction(id: string, body: string) {
  const { actor } = await me();
  return attempt(() => editEventNote(actor, id, body).then(() => undefined));
}

/** The browser reports its zone on each visit; it is used unless the user pinned one. */
export async function syncTimezoneAction(tz: string) {
  const user = await requireUser();
  if (!isValidTz(tz) || user.timezonePinned || user.timezone === tz) return { ok: true as const };
  await db.user.update({ where: { id: user.id }, data: { timezone: tz } });
  return done();
}

/** Pick a zone in Settings (pinned), or null to follow the browser again. */
export async function pinTimezoneAction(tz: string | null, browserTz?: string) {
  const user = await requireUser();
  const next = tz ?? browserTz ?? user.timezone;
  if (!isValidTz(next)) return { ok: false as const, error: "Unknown time zone" };
  await db.user.update({ where: { id: user.id }, data: { timezone: next, timezonePinned: tz !== null } });
  return done();
}

// ---- Goals

export async function createGoalAction(input: { title: string; horizon?: string; target?: string | null; owner?: string | null }) {
  const { actor } = await me();
  return attempt(async () => {
    const g = await createGoal(actor, { title: input.title, horizon: input.horizon, targetDate: dateOrNull(input.target), owner: input.owner ?? null });
    return { number: g.number };
  });
}

export async function updateGoalAction(ref: string, patch: Omit<GoalPatch, "targetDate"> & { target?: string | null }) {
  const { actor } = await me();
  const { target, ...rest } = patch;
  return attempt(async () => {
    await updateGoal(actor, ref, { ...rest, ...(target !== undefined ? { targetDate: dateOrNull(target) } : {}) });
  });
}

// ---- Company brief

export async function refreshBriefAction() {
  const { user } = await me();
  return attempt(() => refreshBriefWithKey(user.id));
}

export async function briefReviewedAction() {
  await me();
  return attempt(() => markBriefReviewed());
}

// ---- Notes

export async function toggleChecklistAction(blockId: string, index: number) {
  const { actor } = await me();
  return attempt(() => toggleChecklistItem(actor, blockId, index).then(() => undefined));
}

export async function createNoteAction(formData: FormData) {
  const { actor } = await me();
  const note = await createNote(actor, { title: String(formData.get("title") ?? "") || "Untitled" });
  redirect(`/notes/${note.id}`);
}

export async function appendBlockAction(noteId: string, content: string, afterBlockId?: string | null) {
  const { actor } = await me();
  return attempt(() => appendToNote(actor, noteId, content, afterBlockId).then((b) => b.map((x) => x.id)));
}

export async function editBlockAction(blockId: string, content: string) {
  const { actor } = await me();
  return attempt(() => editBlock(actor, blockId, content).then(() => undefined));
}

export async function deleteBlockAction(blockId: string) {
  const { actor } = await me();
  return attempt(() => deleteBlock(actor, blockId).then(() => undefined));
}

export async function moveBlockAction(blockId: string, direction: "up" | "down") {
  const { actor } = await me();
  return attempt(() => moveBlock(actor, blockId, direction));
}

export async function updateNoteAction(noteId: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) {
  const { actor } = await me();
  return attempt(() => updateNote(actor, noteId, patch).then(() => undefined));
}

// ---- Meetings

export async function createMeetingAction(formData: FormData) {
  const { user, actor } = await me();
  const m = await createMeeting(actor, {
    title: String(formData.get("title") ?? ""),
    date: formData.get("date") ? new Date(String(formData.get("date"))) : new Date(),
    transcript: String(formData.get("transcript") ?? ""),
  });
  after(() => autoSummarise(user.id, m.id));
  redirect(`/meetings/${m.id}`);
}

export async function updateMeetingAction(id: string, patch: { title?: string; date?: string; transcript?: string }) {
  const { user, actor } = await me();
  if (patch.transcript) after(() => autoSummarise(user.id, id));
  return attempt(() => updateMeeting(actor, id, { ...patch, date: patch.date ? new Date(patch.date) : undefined }).then(() => undefined));
}

export async function deleteMeetingAction(id: string) {
  const { actor } = await me();
  await deleteMeeting(actor, id);
  revalidatePath("/", "layout");
  redirect("/meetings");
}

// ---- Capture box

export async function captureAction(kind: "task" | "note" | "meeting", text: string) {
  const { user, actor } = await me();
  const body = text.trim();
  if (!body) return { ok: false as const, error: "Nothing to save" };
  const [first, ...rest] = body.split("\n");
  return attempt(async () => {
    if (kind === "task") {
      const t = await createTask(actor, { title: first.slice(0, 300), description: rest.join("\n").trim(), assignee: user.id });
      return { href: `/tasks/${t.number}`, label: `T-${t.number}` };
    }
    if (kind === "note") {
      const n = await createNote(actor, { title: first.replace(/^#+\s*/, "").slice(0, 200), content: rest.join("\n").trim() || undefined });
      return { href: `/notes/${n.id}`, label: "note" };
    }
    const today = new Date();
    const titled = !isSpeakerLine(first) && !/\d{1,2}:\d{2}/.test(first) && first.length <= 80 && rest.length > 0;
    const m = await createMeeting(actor, {
      title: titled ? first : `Meeting ${formatDate(today)}`,
      transcript: titled ? rest.join("\n") : body,
    });
    after(() => autoSummarise(user.id, m.id));
    return { href: `/meetings/${m.id}`, label: "meeting" };
  });
}


export async function processMeetingAction(id: string, provider?: Provider) {
  const { user } = await me();
  return attempt(async () => {
    const r = await processMeetingWithKey(user.id, id, provider);
    return { decisions: r.decisions.length, tasks: r.tasks.length };
  });
}

// ---- Decisions

export async function recordDecisionAction(input: { title: string; rationale?: string; date?: string; meetingId?: string | null; status?: "open" | "active" }) {
  const { actor } = await me();
  return attempt(() => recordDecision(actor, { ...input, decidedAt: input.date ? new Date(input.date) : undefined }).then(() => undefined));
}

export async function updateDecisionAction(ref: string, patch: { title?: string; rationale?: string; status?: string }) {
  const { actor } = await me();
  return attempt(() => updateDecision(actor, ref, patch).then(() => undefined));
}

// ---- Agenda

export async function addAgendaAction(text: string) {
  const { actor } = await me();
  return attempt(() => addAgendaItem(actor, text).then(() => undefined));
}

export async function agendaDoneAction(id: string, isDone: boolean) {
  const { actor } = await me();
  return attempt(() => setAgendaItemDone(actor, id, isDone).then(() => undefined));
}

export async function removeAgendaAction(id: string) {
  const { actor } = await me();
  return attempt(() => removeAgendaItem(actor, id));
}

// ---- Review

export async function resolveSuggestionAction(id: string, accept: boolean) {
  const { actor } = await me();
  return attempt(() => resolveSuggestion(actor, id, accept));
}

export async function revertAction(activityId: string) {
  const { actor } = await me();
  return attempt(() => revertActivity(actor, activityId));
}

/** Confirm (or drop) the tasks an AI proposed. */
export async function confirmTasksAction(refs: string[], accept: boolean) {
  const { actor } = await me();
  return attempt(async () => {
    for (const r of refs) await updateTask(actor, r, { status: accept ? "todo" : "dropped" });
  });
}

// ---- Weekly

export async function generateWeeklyAction(useAI: boolean) {
  const { user, actor } = await me();
  const note = await generateWeeklySummary(useAI ? user.id : null, useAI ? undefined : actor);
  redirect(`/notes/${note.id}`);
}

// ---- Drive

export async function linkDriveAction(fileIdOrUrl: string, target: { taskId?: string; noteId?: string; meetingId?: string }) {
  const { actor } = await me();
  const id = fileIdOrUrl.match(/[-\w]{25,}/)?.[0] ?? fileIdOrUrl.trim();
  return attempt(() => linkFile(actor, id, target).then(() => undefined));
}

type DriveTarget = { taskId?: string; noteId?: string; meetingId?: string };
type DriveEntry = { id: string; name: string; mimeType: string; modifiedTime: string };
const entry = (f: DriveEntry): DriveEntry => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime });

/** One level of the shared folder for the file picker. Read-only, so no revalidation. */
export async function browseDriveAction(folderId?: string): Promise<Result<{ root: { id: string; name: string } | null; files: DriveEntry[] }>> {
  await requireUser();
  try {
    const files = await listFolder(folderId);
    const s = folderId ? null : await driveStatus();
    return { ok: true, data: { root: s?.folderId ? { id: s.folderId, name: s.folderName ?? "Shared folder" } : null, files: files.map(entry) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function searchDriveAction(query: string): Promise<Result<DriveEntry[]>> {
  await requireUser();
  try {
    return { ok: true, data: query.trim() ? (await searchDrive(query)).map(entry) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create an empty Doc/Sheet/Slides (linked to the target right away) or a folder (returned to open). */
export async function createDriveFileAction(kind: NewKind, name: string, folderId: string | undefined, target: DriveTarget) {
  const { actor } = await me();
  if (!(kind in NEW_KINDS)) return { ok: false as const, error: "Unknown file type" };
  if (!name.trim()) return { ok: false as const, error: "Give it a name" };
  return attempt(async () => {
    const file = await createFile(actor, kind, name, folderId);
    if (kind !== "folder") await linkFile(actor, file.id, target);
    return entry(file);
  });
}

export async function unlinkDriveAction(linkId: string) {
  const { actor } = await me();
  return attempt(() => unlinkFile(actor, linkId));
}

export async function setDriveFolderAction(folderIdOrUrl: string) {
  await requireOwner();
  return attempt(async () => {
    const id = folderIdOrUrl.match(/folders\/([-\w]+)/)?.[1] ?? folderIdOrUrl.trim();
    const meta = await fileMeta(id);
    if (meta.mimeType !== "application/vnd.google-apps.folder") throw new Error(`"${meta.name}" is not a folder`);
    await setDriveFolder(meta.id, meta.name);
  });
}

export async function disconnectDriveAction() {
  await requireOwner();
  return attempt(() => disconnectDrive());
}

// ---- Settings

export async function updateProfileAction(input: { name?: string; color?: string }) {
  const { user } = await me();
  return attempt(async () => {
    await db.user.update({
      where: { id: user.id },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim().slice(0, 80) } : {}),
        ...(input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? { color: input.color } : {}),
      },
    });
  });
}

export async function addFounderAction(input: { email: string; name?: string; color?: string }) {
  await requireOwner();
  return attempt(async () => {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
    await db.user.create({ data: { email, name: input.name?.trim() || null, color: input.color ?? "#4a6fa5" } });
  });
}

export async function removeFounderAction(userId: string) {
  const owner = await requireOwner();
  return attempt(async () => {
    if (userId === owner.id) throw new Error("You cannot remove yourself");
    await db.user.delete({ where: { id: userId } });
  });
}

export async function saveAiKeyAction(input: { provider: Provider; key: string; model?: string }) {
  const { user } = await me();
  return attempt(async () => {
    if (!(input.provider in PROVIDERS)) throw new Error("Unknown provider");
    const key = input.key.trim();
    if (key.length < 20) throw new Error("That does not look like an API key");
    const model = input.model?.trim() || PROVIDERS[input.provider].defaultModel;
    await db.aiKey.upsert({
      where: { userId_provider: { userId: user.id, provider: input.provider } },
      update: { encrypted: encrypt(key), last4: key.slice(-4), model },
      create: { userId: user.id, provider: input.provider, encrypted: encrypt(key), last4: key.slice(-4), model },
    });
  });
}

export async function setAiModelAction(provider: Provider, model: string) {
  const { user } = await me();
  return attempt(async () => {
    await db.aiKey.update({ where: { userId_provider: { userId: user.id, provider } }, data: { model: model.trim() } });
  });
}

export async function deleteAiKeyAction(provider: Provider) {
  const { user } = await me();
  return attempt(async () => {
    await db.aiKey.deleteMany({ where: { userId: user.id, provider } });
  });
}

export async function createApiTokenAction(input: { name: string; agent: string }) {
  const { user } = await me();
  return attempt(async () => {
    const token = randomToken(API_TOKEN_PREFIX, 32);
    await db.apiToken.create({
      data: {
        userId: user.id,
        name: input.name.trim().slice(0, 80) || "Token",
        agent: input.agent.trim().slice(0, 40) || "AI",
        tokenHash: sha256(token),
        prefix: token.slice(0, 10),
      },
    });
    return { token };
  });
}

export async function revokeApiTokenAction(id: string) {
  const { user } = await me();
  return attempt(async () => {
    await db.apiToken.updateMany({ where: { id, userId: user.id }, data: { revokedAt: new Date() } });
  });
}

export async function revokeGrantAction(id: string) {
  const { user } = await me();
  return attempt(async () => {
    await db.oAuthGrant.updateMany({ where: { id, userId: user.id }, data: { revokedAt: new Date() } });
  });
}

export async function setAutoAIAction(on: boolean) {
  const { user } = await me();
  return attempt(async () => {
    await db.user.update({ where: { id: user.id }, data: { autoAI: on } });
  });
}

export async function setMeetingFormatAction(sections: string[]) {
  await me();
  return attempt(() => setMeetingFormat(sections));
}
