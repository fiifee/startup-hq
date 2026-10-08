import Link from "next/link";
import { ConfirmAllEvents, EventRow, NewEvent, ProposedEvent } from "@/components/timeline";
import { cardCls, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";
import { daysUntil, tzCity } from "@/lib/time";
import { daysAgo } from "@/lib/view";

export const metadata = { title: "Timeline" };

const include = { attendance: true, _count: { select: { notes: true, tasks: true } } } as const;

/** Events, deadlines and opportunities: what's proposed, what's coming, what's past. */
export default async function TimelinePage(props: PageProps<"/timeline">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filter = typeof sp.show === "string" ? sp.show : "all";
  const tz = user.timezone;
  const importance = filter === "mandatory" ? { importance: "mandatory" } : {};
  const [founders, proposed, upcoming, past] = await Promise.all([
    listFounders(),
    db.event.findMany({ where: { status: "proposed" }, include, orderBy: { startsAt: "asc" } }),
    db.event.findMany({ where: { status: "confirmed", startsAt: { gte: daysAgo(1) }, ...importance }, include, orderBy: { startsAt: "asc" } }),
    db.event.findMany({ where: { status: "confirmed", startsAt: { lt: daysAgo(1), gte: daysAgo(120) }, ...importance }, include, orderBy: { startsAt: "desc" }, take: 40 }),
  ]);
  const ahead = upcoming.filter((e) => daysUntil(e.startsAt, tz, e.allDay) >= 0);
  const recent = [...upcoming.filter((e) => daysUntil(e.startsAt, tz, e.allDay) < 0).reverse(), ...past];
  const groups = [
    { label: "This week", items: ahead.filter((e) => daysUntil(e.startsAt, tz, e.allDay) < 7) },
    { label: "Next week", items: ahead.filter((e) => { const n = daysUntil(e.startsAt, tz, e.allDay); return n >= 7 && n < 14; }) },
    { label: "Later", items: ahead.filter((e) => daysUntil(e.startsAt, tz, e.allDay) >= 14) },
  ];
  const chip = (active: boolean) => `h-8 px-3 rounded-full text-sm inline-flex items-center border ${active ? "bg-ink text-canvas border-ink" : "border-line-strong text-ink-2 hover:text-ink hover:bg-sunken"}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={h1Cls}>Timeline</h1>
          <p className="text-ink-2 mt-1">Events, deadlines and opportunities. Times in your zone: {tzCity(tz)}.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/timeline" className={chip(filter === "all")}>All</Link>
          <Link href="/timeline?show=mandatory" className={chip(filter === "mandatory")}>Mandatory</Link>
        </div>
      </div>

      <div className={`${cardCls} p-3`}><NewEvent defaultTz={tz} /></div>

      {proposed.length > 0 && (
        <section className={`${cardCls} border-dashed`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div>
              <h2 className={h2Cls}>Found in chats</h2>
              <p className="text-sm text-ink-2">Proposed by AI. Confirm to put them on the timeline.</p>
            </div>
            <ConfirmAllEvents refs={proposed.map((e) => String(e.number))} />
          </div>
          <ul className="divide-y divide-line">
            {proposed.map((e) => <ProposedEvent key={e.id} event={e} founders={founders} tz={tz} />)}
          </ul>
        </section>
      )}

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.label} className="space-y-1.5">
            <h2 className="text-sm font-semibold">{g.label} <span className="text-ink-3 font-normal">{g.items.length}</span></h2>
            <ul className={`${cardCls} divide-y divide-line`}>
              {g.items.map((e) => <EventRow key={e.id} event={e} founders={founders} me={user.id} tz={tz} />)}
            </ul>
          </section>
        ) : null,
      )}
      {ahead.length === 0 && <p className="text-sm text-ink-3">Nothing coming up. Add something above, or let Hermes pick dates up from your chats.</p>}

      {recent.length > 0 && (
        <details className={cardCls}>
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">Past <span className="text-ink-3 font-normal">{recent.length}</span></summary>
          <ul className="divide-y divide-line border-t border-line">
            {recent.map((e) => <EventRow key={e.id} event={e} founders={founders} me={user.id} tz={tz} />)}
          </ul>
        </details>
      )}
    </div>
  );
}
