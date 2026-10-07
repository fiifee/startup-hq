import Link from "next/link";
import { AgendaItems } from "@/components/agenda";
import { ConfirmAll, TaskList } from "@/components/tasks";
import { btnPrimary, cardCls, formatDate, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAgenda } from "@/lib/services/agenda";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Next agenda" };

export default async function AgendaPage() {
  await requireUser();
  const [g, founders] = await Promise.all([getAgenda(), listFounders()]);
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className={h1Cls}>Next meeting</h1>
          <p className="text-ink-2 mt-1">
            Built from the state of the work.{g.lastMeeting && <> Last meeting: <Link href={`/meetings/${g.lastMeeting.id}`} className="underline">{g.lastMeeting.title}</Link>, {formatDate(g.lastMeeting.date)}.</>}
          </p>
        </div>
        <Link href="/meetings/new" className={btnPrimary}>Add the meeting</Link>
      </div>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Topics</h2>
        <AgendaItems items={g.items} founders={founders} />
      </section>

      {g.overdue.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Overdue <span className="text-ink-3 font-normal">{g.overdue.length}</span></h2>
          <TaskList tasks={g.overdue} founders={founders} />
        </section>
      )}
      {g.blocked.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Blocked <span className="text-ink-3 font-normal">{g.blocked.length}</span></h2>
          <TaskList tasks={g.blocked} founders={founders} />
        </section>
      )}
      {g.proposed.length > 0 && (
        <section className={cardCls}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <h2 className={h2Cls}>Proposed, not confirmed <span className="text-ink-3 font-normal">{g.proposed.length}</span></h2>
            <ConfirmAll refs={g.proposed.map((t) => String(t.number))} />
          </div>
          <TaskList tasks={g.proposed} founders={founders} />
        </section>
      )}
      {g.openSuggestions > 0 && (
        <p className="text-sm"><Link href="/review" className="underline">{g.openSuggestions} AI suggestion{g.openSuggestions === 1 ? "" : "s"} waiting for review</Link></p>
      )}
      {!g.items.length && !g.overdue.length && !g.blocked.length && !g.proposed.length && (
        <p className="text-sm text-ink-3">Nothing pressing. Add topics above, or let your AI add follow-ups after the next meeting.</p>
      )}
    </div>
  );
}
