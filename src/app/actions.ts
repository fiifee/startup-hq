"use server";

/**
 * Everything a user does by hand in the UI. Each action runs as that user
 * (no agent), through the same services the AI uses.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { human } from "@/lib/actor";
import { autoSummarise, maybeRefreshBrief } from "@/lib/auto";
import { isSpeakerLine } from "@/lib/capture";
import { API_TOKEN_PREFIX } from "@/lib/agent-auth";
import { requireOwner, requireUser } from "@/lib/auth";
import { encrypt, randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { disconnectDrive, setDriveFolder } from "@/lib/google";
import { PROVIDERS, type Provider } from "@/lib/llm";
import { processMeetingWithKey } from "@/lib/process-meeting";
import { revertActivity } from "@/lib/services/activity";
import { markBriefReviewed, refreshBriefWithKey } from "@/lib/services/brief";
import { createGoal, updateGoal, type GoalPatch } from "@/lib/services/goals";
import { addAgendaItem, removeAgendaItem, setAgendaItemDone } from "@/lib/services/agenda";
import { recordDecision, updateDecision } from "@/lib/services/decisions";
import { fileMeta, linkFile, unlinkFile } from "@/lib/services/drive";
import { setMeetingFormat } from "@/lib/services/format";
import { createMeeting, updateMeeting } from "@/lib/services/meetings";
import { appendToNote, createNote, deleteBlock, editBlock, moveBlock, toggleChecklistItem, updateNote } from "@/lib/services/notes";
import { resolveSuggestion } from "@/lib/services/suggestions";
import { addTaskComment, createTask, deleteTask, updateTask, type TaskPatch } from "@/lib/services/tasks";
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

export async function createTaskAction(input: { title: string; description?: string; assignee?: string | null; due?: string | null; priority?: string; status?: string; meetingId?: string | null; goal?: string | null }) {
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

export async function commentAction(ref: string, body: string) {
  const { actor } = await me();
  return attempt(() => addTaskComment(actor, ref, body).then(() => undefined));
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
      title: titled ? first : `Meeting ${today.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
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
