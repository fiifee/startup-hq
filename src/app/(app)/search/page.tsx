import Link from "next/link";
import { TaskList } from "@/components/tasks";
import { cardCls, formatDate, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listFounders } from "@/lib/services/people";
import { searchAll } from "@/lib/services/search";

export const metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [r, founders] = await Promise.all([searchAll(q, 20), listFounders()]);
  const total = r.tasks.length + r.notes.length + r.meetings.length + r.decisions.length;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <form>
        <input name="q" defaultValue={q} autoFocus placeholder="Search tasks, notes, transcripts, decisions" aria-label="Search" className="w-full h-11 px-4 rounded-md border border-line-strong bg-surface text-base focus:outline-none focus:border-accent" />
      </form>
      {q && <h1 className={h1Cls}>{total} result{total === 1 ? "" : "s"} for “{q}”</h1>}
      {r.tasks.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Tasks</h2>
          <TaskList tasks={r.tasks} founders={founders} />
        </section>
      )}
      {r.decisions.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Decisions</h2>
          <ul className="divide-y divide-line">
            {r.decisions.map((d) => (
              <li key={d.id} className="px-4 py-2.5 text-sm">
                <Link href={`/decisions?q=${encodeURIComponent(q)}`} className="hover:underline"><span className="text-ink-3 mr-2">D-{d.number}</span>{d.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.notes.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Notes</h2>
          <ul className="divide-y divide-line">
            {r.notes.map((n) => (
              <li key={n.blockId}>
                <Link href={`/notes/${n.noteId}`} className="block px-4 py-2.5 hover:bg-sunken">
                  <span className="font-medium text-sm">{n.title}</span>
                  <span className="block text-sm text-ink-2 truncate">{n.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.meetings.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Meeting transcripts</h2>
          <ul className="divide-y divide-line">
            {r.meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="block px-4 py-2.5 hover:bg-sunken">
                  <span className="font-medium text-sm">{m.title}</span> <span className="text-xs text-ink-3">{formatDate(m.date)}</span>
                  <span className="block text-sm text-ink-2 truncate">{m.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
