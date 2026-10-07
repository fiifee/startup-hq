import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { BlockEditor, type BlockSuggestion } from "@/components/block-editor";
import { NoteActions, NoteTitle } from "@/components/note-header";
import { Byline } from "@/components/people";
import { DriveLinks } from "@/components/task-editor";
import { cardCls, formatDate, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNote } from "@/lib/services/notes";
import { listFounders } from "@/lib/services/people";
import { feedItems } from "@/lib/view";

export default async function NotePage(props: PageProps<"/notes/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const note = await getNote(id).catch(() => null);
  if (!note) notFound();
  if (note.meeting) redirect(`/meetings/${note.meeting.id}`);
  if (note.kind === "brief") redirect("/brief");
  const blockIds = note.blocks.map((b) => b.id);
  const [founders, suggestions, links, activity] = await Promise.all([
    listFounders(),
    db.suggestion.findMany({ where: { entityType: "block", entityId: { in: blockIds }, status: "open" } }),
    db.driveLink.findMany({ where: { noteId: note.id } }),
    db.activity.findMany({
      where: { OR: [{ entityType: "note", entityId: note.id }, { entityType: "block", entityId: { in: blockIds } }] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href={`/docs${note.kind === "weekly" ? "?kind=weekly" : ""}`} className="hover:text-ink">{note.kind === "weekly" ? "Weekly" : "Notes"}</Link>
        <span>/</span>
        <span className="inline-flex items-center gap-1.5">
          by <Byline founders={founders} byId={note.createdById} agent={note.createdAgent} size="xs" /> · {formatDate(note.createdAt)}
        </span>
        <span className="ml-auto"><NoteActions noteId={note.id} pinned={note.pinned} /></span>
      </div>
      <NoteTitle noteId={note.id} title={note.title} />
      <BlockEditor
        noteId={note.id}
        blocks={note.blocks}
        suggestions={suggestions.map((s) => ({ ...s, proposed: s.proposed as BlockSuggestion["proposed"] }))}
        founders={founders}
      />
      <section className={`${cardCls} p-4 space-y-3`}>
        <h2 className={h2Cls}>Drive files</h2>
        <DriveLinks links={links} target={{ noteId: note.id }} founders={founders} />
      </section>
      <details className={cardCls}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">History</summary>
        <ActivityFeed items={feedItems(activity)} founders={founders} />
      </details>
    </div>
  );
}
