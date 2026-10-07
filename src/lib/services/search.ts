import { db } from "../db";

/** One search box over everything the founders write. */
export async function searchAll(query: string, limit = 10) {
  const q = query.trim();
  if (!q) return { tasks: [], notes: [], meetings: [], decisions: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const [tasks, blocks, meetings, decisions] = await Promise.all([
    db.task.findMany({ where: { OR: [{ title: contains }, { description: contains }] }, take: limit, orderBy: { updatedAt: "desc" }, include: { assignee: true } }),
    db.block.findMany({ where: { content: contains, note: { archivedAt: null } }, take: limit * 2, orderBy: { updatedAt: "desc" }, include: { note: { select: { id: true, title: true, kind: true } } } }),
    db.meeting.findMany({ where: { OR: [{ title: contains }, { transcript: contains }] }, take: limit, orderBy: { date: "desc" }, select: { id: true, title: true, date: true, transcript: true } }),
    db.decision.findMany({ where: { OR: [{ title: contains }, { rationale: contains }] }, take: limit, orderBy: { decidedAt: "desc" } }),
  ]);
  const snippet = (text: string) => {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text.slice(0, 160);
    return (i > 60 ? "…" : "") + text.slice(Math.max(0, i - 60), i + q.length + 100) + "…";
  };
  const notesSeen = new Set<string>();
  return {
    tasks,
    notes: blocks
      .filter((b) => (notesSeen.has(b.noteId) ? false : (notesSeen.add(b.noteId), true)))
      .slice(0, limit)
      .map((b) => ({ noteId: b.note.id, title: b.note.title, kind: b.note.kind, blockId: b.id, snippet: snippet(b.content) })),
    meetings: meetings.map((m) => ({ id: m.id, title: m.title, date: m.date, snippet: snippet(m.transcript) })),
    decisions,
  };
}
