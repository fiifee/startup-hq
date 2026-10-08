import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { Byline } from "@/components/people";
import { SuggestionCard } from "@/components/suggestions";
import { QuickAddTask, TaskList } from "@/components/tasks";
import { Attendees, EventEditor, EventNotes, ImportanceChip, ProposedEvent, RsvpButtons } from "@/components/timeline";
import { cardCls, h2Cls, KIND_LABEL } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { getEventDetail } from "@/lib/services/events";
import { listFounders } from "@/lib/services/people";
import { daysUntil, formatWhen, hm } from "@/lib/time";
import { feedItems } from "@/lib/view";

export default async function EventPage(props: PageProps<"/timeline/[number]">) {
  const user = await requireUser();
  const { number } = await props.params;
  const e = await getEventDetail(number).catch(() => null);
  if (!e) notFound();
  const [founders, activity, suggestions] = await Promise.all([
    listFounders(),
    recentActivity({ entityType: "event", entityId: e.id, limit: 30 }),
    db.suggestion.findMany({ where: { entityType: "event", entityId: e.id, status: "open" } }),
  ]);
  const tz = user.timezone;
  const when = formatWhen(e.startsAt, e.allDay, tz, e.timezone);
  const past = daysUntil(e.startsAt, tz, e.allDay) < 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href="/timeline" className="hover:text-ink">Timeline</Link>
        <span>/</span>
        <span className="tabular">E-{e.number}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          Added by <Byline founders={founders} byId={e.createdById} agent={e.createdAgent} size="xs" />
        </span>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ImportanceChip importance={e.importance} />
          <span className="text-sm text-ink-2">{KIND_LABEL[e.kind]}</span>
          {e.status === "dismissed" && <span className="text-sm text-ink-3">Dismissed</span>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{e.title}</h1>
        <p className="text-ink-2">
          {when.main}
          {e.endsAt && !e.allDay && ` – ${hm(e.endsAt, tz)}`}
          {when.local && <span className="text-ink-3"> · {when.local}</span>}
        </p>
      </header>

      {e.status === "proposed" && (
        <ul className={`${cardCls} border-dashed`}><ProposedEvent event={e} founders={founders} tz={tz} /></ul>
      )}

      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          founders={founders}
          suggestion={s}
          changes={Object.entries(s.proposed as Record<string, string>).map(([field, after]) => ({
            label: field === "title" ? "Title" : "Details",
            before: field === "title" ? e.title : e.description,
            after,
          }))}
        />
      ))}

      {e.status === "confirmed" && (
        <section className={`${cardCls} p-4 space-y-3`}>
          <h2 className={h2Cls}>Who&apos;s going</h2>
          <Attendees event={e} founders={founders} />
          {!past && <RsvpButtons event={e} me={user.id} />}
        </section>
      )}

      <section className={`${cardCls} p-4 space-y-3`}>
        <h2 className={h2Cls}>Details</h2>
        <EventEditor event={e} />
        {(e.source || e.sourceQuote) && (
          <div className="text-xs text-ink-2 border-l-2 border-line-strong pl-2">
            {e.sourceQuote && <p className="italic">“{e.sourceQuote}”</p>}
            <p className="text-ink-3">{e.source}</p>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Notes</h2>
        <EventNotes eventRef={String(e.number)} notes={e.notes} founders={founders} me={user.id} past={past} />
      </section>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Preparation</h2>
        <TaskList tasks={e.tasks} founders={founders} empty="No prep tasks." />
        <div className="p-3 border-t border-line"><QuickAddTask founders={founders} me={user.id} eventId={e.id} /></div>
      </section>

      <details className={cardCls}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">History</summary>
        <ActivityFeed items={feedItems(activity)} founders={founders} />
      </details>
    </div>
  );
}
