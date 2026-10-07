import Link from "next/link";
import { Plus } from "lucide-react";
import { AgendaItems } from "@/components/agenda";
import { Byline } from "@/components/people";
import { ConfirmAll, TaskList } from "@/components/tasks";
import { btnPrimary, cardCls, formatDate, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAgenda } from "@/lib/services/agenda";
import { listMeetings } from "@/lib/services/meetings";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Meetings" };

/** The next meeting's agenda on top, past meetings below. */
export default async function MeetingsPage() {
  await requireUser();
  const [meetings, founders, g] = await Promise.all([listMeetings(200), listFounders(), getAgenda()]);
  const extra = g.overdue.length + g.blocked.length + g.proposed.length;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className={h1Cls}>Meetings</h1>
        <Link href="/meetings/new" className={btnPrimary}><Plus className="w-4 h-4" /> Add meeting</Link>
      </div>

      <section className={cardCls}>
        <div className="px-4 py-3 border-b border-line">
          <h2 className={h2Cls}>Next meeting</h2>
          <p className="text-sm text-ink-2">Topics anyone added. When you add the meeting, these are attached to it.</p>
        </div>
        <AgendaItems items={g.items} founders={founders} />
        {extra > 0 && (
          <details className="border-t border-line">
            <summary className="px-4 py-2.5 text-sm cursor-pointer">
              Also worth covering:{" "}
              {[
                g.overdue.length && `${g.overdue.length} overdue`,
                g.blocked.length && `${g.blocked.length} blocked`,
                g.proposed.length && `${g.proposed.length} unconfirmed`,
              ].filter(Boolean).join(", ")}
            </summary>
            {g.overdue.length > 0 && (<><h3 className="px-4 pt-2 text-xs font-semibold text-danger">Overdue</h3><TaskList tasks={g.overdue} founders={founders} /></>)}
            {g.blocked.length > 0 && (<><h3 className="px-4 pt-2 text-xs font-semibold text-ink-2">Blocked</h3><TaskList tasks={g.blocked} founders={founders} /></>)}
            {g.proposed.length > 0 && (
              <>
                <div className="flex items-center justify-between px-4 pt-2">
                  <h3 className="text-xs font-semibold text-ink-2">Proposed, not confirmed</h3>
                  <ConfirmAll refs={g.proposed.map((t) => String(t.number))} />
                </div>
                <TaskList tasks={g.proposed} founders={founders} />
              </>
            )}
          </details>
        )}
      </section>

      <section className="space-y-2">
        <h2 className={h2Cls}>Past meetings</h2>
        <ul className={`${cardCls} divide-y divide-line`}>
          {meetings.length === 0 && (
            <li className="px-4 py-8 text-sm text-ink-2 text-center">
              No meetings yet. Paste a transcript into Capture, or <Link href="/meetings/new" className="underline">add one here</Link>.
            </li>
          )}
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-sunken">
                <span className="w-16 shrink-0 text-sm text-ink-2 tabular">{formatDate(m.date, false)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-ink-3">
                    {m._count.decisions} decision{m._count.decisions === 1 ? "" : "s"} · {m._count.tasks} task{m._count.tasks === 1 ? "" : "s"}
                  </span>
                </span>
                {m.processedAt ? <span className="text-xs text-ink-2">Summarised</span> : <span className="text-xs text-warn">Not summarised</span>}
                <Byline founders={founders} byId={m.createdById} agent={m.createdAgent} size="xs" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
