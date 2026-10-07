import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity, type Tx } from "./activity";

export const NOTE_KINDS = ["note", "meeting", "weekly"] as const;

/**
 * Split markdown into paragraph-sized blocks on blank lines, keeping fenced code
 * blocks whole. Lists written without blank lines stay one block.
 */
export function splitBlocks(markdown: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (buf.length) out.push(buf.join("\n"));
      buf = [];
    } else buf.push(line);
  }
  if (buf.length) out.push(buf.join("\n"));
  return out.map((b) => b.replace(/\s+$/, "")).filter((b) => b.trim());
}

export async function listNotes(f: { kind?: string; search?: string; limit?: number; includeArchived?: boolean } = {}) {
  const where: Prisma.NoteWhereInput = {};
  if (f.kind) where.kind = f.kind;
  if (!f.includeArchived) where.archivedAt = null;
  if (f.search) {
    where.OR = [
      { title: { contains: f.search, mode: "insensitive" } },
      { blocks: { some: { content: { contains: f.search, mode: "insensitive" } } } },
    ];
  }
  return db.note.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: Math.min(f.limit ?? 50, 200),
    include: { meeting: { select: { id: true, date: true } }, _count: { select: { blocks: true } } },
  });
}

export async function getNote(id: string) {
  const note = await db.note.findUnique({
    where: { id },
    include: { blocks: { orderBy: { position: "asc" } }, meeting: { select: { id: true, title: true, date: true } } },
  });
  if (!note) throw new Error(`Note ${id} not found`);
  return note;
}

async function insertBlocks(tx: Tx, actor: Actor, noteId: string, contents: string[], afterBlockId?: string | null) {
  const blocks = await tx.block.findMany({ where: { noteId }, orderBy: { position: "asc" }, select: { id: true, position: true } });
  let lo: number;
  let hi: number;
  if (afterBlockId) {
    const i = blocks.findIndex((b) => b.id === afterBlockId);
    if (i < 0) throw new Error(`Block ${afterBlockId} is not in this note`);
    lo = blocks[i].position;
    hi = blocks[i + 1]?.position ?? lo + contents.length + 1;
  } else {
    lo = blocks.at(-1)?.position ?? 0;
    hi = lo + contents.length + 1;
  }
  const step = (hi - lo) / (contents.length + 1);
  const created = [];
  for (let i = 0; i < contents.length; i++) {
    const b = await tx.block.create({ data: { noteId, position: lo + step * (i + 1), content: contents[i], ...by(actor) } });
    await logActivity(tx, actor, "block", b.id, "created", `Added to note: ${contents[i].slice(0, 80)}`);
    created.push(b);
  }
  await tx.note.update({ where: { id: noteId }, data: { updatedAt: new Date() } });
  return created;
}

export async function createNote(actor: Actor, input: { title: string; content?: string; kind?: string }) {
  const title = input.title.trim() || "Untitled";
  return db.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { title: title.slice(0, 200), kind: input.kind ?? "note", ...by(actor, "created") } });
    await logActivity(tx, actor, "note", note.id, "created", `Created note "${note.title}"`);
    if (input.content?.trim()) await insertBlocks(tx, actor, note.id, splitBlocks(input.content), null);
    return note;
  });
}

export async function appendToNote(actor: Actor, noteId: string, content: string, afterBlockId?: string | null) {
  const parts = splitBlocks(content);
  if (!parts.length) throw new Error("Nothing to add");
  return db.$transaction((tx) => insertBlocks(tx, actor, noteId, parts, afterBlockId));
}

/**
 * Change a block. People can edit anything (the block becomes theirs). An AI
 * editing a block a person wrote files a Suggestion instead of overwriting it.
 */
export async function editBlock(actor: Actor, blockId: string, content: string, reason = "") {
  const block = await db.block.findUnique({ where: { id: blockId } });
  if (!block) throw new Error(`Block ${blockId} not found`);
  const text = content.replace(/\s+$/, "");
  if (text === block.content) return { block, suggestionId: null };
  if (!text.trim()) return deleteBlock(actor, blockId, reason);

  return db.$transaction(async (tx) => {
    if (isAI(actor) && !block.agent) {
      const s = await tx.suggestion.create({ data: { entityType: "block", entityId: block.id, proposed: { content: text }, reason, ...by(actor) } });
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested an edit: ${text.slice(0, 80)}`);
      return { block, suggestionId: s.id };
    }
    const updated = await tx.block.update({ where: { id: blockId }, data: { content: text, ...by(actor) } });
    await logActivity(tx, actor, "block", blockId, "updated", `Edited: ${text.slice(0, 80)}`, block);
    await tx.note.update({ where: { id: block.noteId }, data: { updatedAt: new Date() } });
    return { block: updated, suggestionId: null };
  });
}

export async function deleteBlock(actor: Actor, blockId: string, reason = "") {
  const block = await db.block.findUnique({ where: { id: blockId } });
  if (!block) throw new Error(`Block ${blockId} not found`);
  return db.$transaction(async (tx) => {
    if (isAI(actor) && !block.agent) {
      const s = await tx.suggestion.create({ data: { entityType: "block", entityId: block.id, proposed: { delete: true }, reason, ...by(actor) } });
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested removing: ${block.content.slice(0, 80)}`);
      return { block, suggestionId: s.id };
    }
    await tx.block.delete({ where: { id: blockId } });
    await logActivity(tx, actor, "block", blockId, "deleted", `Removed: ${block.content.slice(0, 80)}`, block);
    return { block: null, suggestionId: null };
  });
}

export async function moveBlock(actor: Actor, blockId: string, direction: "up" | "down") {
  const block = await db.block.findUniqueOrThrow({ where: { id: blockId } });
  const blocks = await db.block.findMany({ where: { noteId: block.noteId }, orderBy: { position: "asc" } });
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= blocks.length) return;
  await db.$transaction([
    db.block.update({ where: { id: blocks[i].id }, data: { position: blocks[j].position } }),
    db.block.update({ where: { id: blocks[j].id }, data: { position: blocks[i].position } }),
  ]);
  void actor;
}

export async function updateNote(actor: Actor, noteId: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) {
  const note = await getNote(noteId);
  if (isAI(actor) && patch.archived) throw new Error("AI cannot archive notes");
  return db.$transaction(async (tx) => {
    const updated = await tx.note.update({
      where: { id: noteId },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) || note.title } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}),
      },
    });
    await logActivity(tx, actor, "note", noteId, "updated", `Updated note "${updated.title}"`, { title: note.title, pinned: note.pinned });
    return updated;
  });
}

/** Note as markdown, each block tagged with its id and author so an AI can cite and edit it. */
export function noteForAI(
  note: Awaited<ReturnType<typeof getNote>>,
  nameOf: (byId: string | null, agent: string | null) => string,
) {
  return {
    id: note.id,
    title: note.title,
    kind: note.kind,
    meeting: note.meeting,
    updatedAt: note.updatedAt,
    blocks: note.blocks.map((b) => ({
      id: b.id,
      author: nameOf(b.byId, b.agent),
      writtenBy: b.agent ? "ai" : "human",
      content: b.content,
    })),
  };
}
