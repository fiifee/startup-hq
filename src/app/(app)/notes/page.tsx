import Link from "next/link";
import { Pin } from "lucide-react";
import { createNoteAction } from "@/app/actions";
import { Byline } from "@/components/people";
import { btnPrimary, cardCls, h1Cls, inputCls, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listNotes } from "@/lib/services/notes";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Notes" };

const KINDS = [
  { key: "", label: "All" },
  { key: "note", label: "Notes" },
  { key: "meeting", label: "Meeting notes" },
  { key: "weekly", label: "Weekly" },
];

export default async function NotesPage(props: PageProps<"/notes">) {
  await requireUser();
  const sp = await props.searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const [notes, founders] = await Promise.all([listNotes({ kind: kind || undefined, search: q || undefined, limit: 200 }), listFounders()]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className={h1Cls}>Notes</h1>
      <form action={createNoteAction} className="flex gap-2">
        <input name="title" placeholder="New note title" aria-label="New note title" className={inputCls} />
        <button className={btnPrimary}>Create</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1 p-1 rounded-lg bg-sunken">
          {KINDS.map((k) => (
            <Link key={k.key} href={`/notes?kind=${k.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`h-8 px-3 rounded-md text-sm inline-flex items-center ${kind === k.key ? "bg-surface shadow-sm font-medium" : "text-ink-2 hover:text-ink"}`}>
              {k.label}
            </Link>
          ))}
        </div>
        <form>
          <input type="hidden" name="kind" value={kind} />
          <input name="q" defaultValue={q} placeholder="Search notes…" aria-label="Search notes" className="h-9 px-3 rounded-md border border-line bg-surface text-sm w-56 focus:outline-none focus:border-accent" />
        </form>
      </div>
      <ul className={`${cardCls} divide-y divide-line`}>
        {notes.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id}>
            <Link href={n.kind === "brief" ? "/brief" : n.meeting ? `/meetings/${n.meeting.id}` : `/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
              {n.pinned && <Pin className="w-3.5 h-3.5 text-ink-3" aria-label="Pinned" />}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{n.title}</span>
                <span className="text-xs text-ink-3">
                  {n.kind === "meeting" ? "Meeting · " : n.kind === "weekly" ? "Weekly · " : ""}
                  {n._count.blocks} block{n._count.blocks === 1 ? "" : "s"} · updated {relative(n.updatedAt)}
                </span>
              </span>
              <Byline founders={founders} byId={n.createdById} agent={n.createdAgent} size="xs" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
