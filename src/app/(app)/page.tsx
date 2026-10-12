import Link from "next/link";
import { ActivityFeed } from "@/components/activity";
import { Markdown } from "@/components/markdown";
import { Byline, firstName } from "@/components/people";
import { AskCard, AskThread } from "@/components/asks";
import { SuggestionList } from "@/components/suggestion-list";
import { ConfirmAll, QuickAddTask, TaskList } from "@/components/tasks";
import { ConfirmAllEvents, EventLinks, ImportanceChip, ProposedEvent } from "@/components/timeline";
import { cardCls, formatDate, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { briefStaleness, briefNote } from "@/lib/services/brief";
import { listFounders } from "@/lib/services/people";
import { listAsks } from "@/lib/services/asks";
import { listOpenSuggestions } from "@/lib/services/suggestions";
import { eventLinks, isJoinLink } from "@/lib/links";
import { daysUntil, formatWhen } from "@/lib/time";
import { daysAgo, feedItems } from "@/lib/view";

/**
 * Home is the inbox: what needs you, your tasks, the week's summary, and
 * everything that changed (with Undo).
 */
export default async function Home() {
  const user = await requireUser();
  const brief = await briefNote();
  const [founders, mine, proposed, suggestions, activity, agenda, lastMeeting, staleness, weekly, proposedEvents, comingUp, asksToMe, myAsks] = await Promise.all([
    listFounders(),
    db.task.findMany({
      where: { assigneeId: user.id, status: { in: ["todo", "doing", "blocked"] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      take: 30,
      include: { goal: { select: { number: true, title: true } } },
    }),
    db.task.findMany({ where: { status: "proposed" }, orderBy: { number: "asc" }, include: { goal: { select: { number: true, title: true } } } }),
    listOpenSuggestions(),
    recentActivity({ limit: 20 }),
    db.agendaItem.findMany({ where: { meetingId: null, done: false }, orderBy: { createdAt: "asc" }, take: 4 }),
    db.meeting.findFirst({ orderBy: { date: "desc" } }),
    briefStaleness(brief.id),
    db.note.findFirst({
      where: { kind: "weekly", archivedAt: null, createdAt: { gte: daysAgo(7) } },
      orderBy: { createdAt: "desc" },
      include: { blocks: { orderBy: { position: "asc" }, take: 3 } },
    }),
    db.event.findMany({ where: { status: "proposed" }, include: { attendance: true }, orderBy: { startsAt: "asc" } }),
    db.event.findMany({
      where: { status: "confirmed", startsAt: { gte: daysAgo(0.5) } },
      include: { attendance: true },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    listAsks({ toId: user.id, status: ["open"] }),
    listAsks({ involving: user.id, since: daysAgo(14), status: ["open", "answered", "declined"], limit: 30 }),
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Recent requests either way, minus open ones to me (those are under Needs you).
  const pastAsks = myAsks
    .filter((a) => !(a.status === "open" && a.toId === user.id))
    .sort((a, b) => +(b.answeredAt ?? b.createdAt) - +(a.answeredAt ?? a.createdAt));
  const needsYou = proposed.length + suggestions.length + proposedEvents.length + asksToMe.length;

  const groupHead = "flex items-center justify-between gap-3 px-4 pt-3 pb-1";
  const groupLabel = "text-sm font-medium text-ink-2";
  const link = "text-sm text-ink-2 hover:text-ink";

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header>
        <h1 className={h1Cls}>{greeting}, {firstName(user)}</h1>
        <p className="text-ink-2 mt-1">
          {needsYou ? `${needsYou} thing${needsYou === 1 ? "" : "s"} need${needsYou === 1 ? "s" : ""} you. ` : "Nothing waiting for you. "}
          {mine.length ? `${mine.length} open task${mine.length === 1 ? "" : "s"} on you.` : ""}
        </p>
      </header>

      {weekly && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className={h2Cls}>{weekly.title}</h2>
            <span className="inline-flex items-center gap-3">
              <Byline founders={founders} byId={weekly.createdById} agent={weekly.createdAgent} size="xs" />
              <Link href={`/notes/${weekly.id}`} className={link}>Read →</Link>
            </span>
          </div>
          <Link href={`/notes/${weekly.id}`} className="block max-h-32 overflow-hidden relative [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
            <Markdown className="text-sm text-ink-2">{weekly.blocks.map((b) => b.content).join("\n\n")}</Markdown>
          </Link>
        </section>
      )}

      {needsYou > 0 && (
        <section className="space-y-3">
          <h2 className={h2Cls}>Needs you</h2>
          <div className={`${cardCls} divide-y divide-line overflow-hidden`}>
            {asksToMe.length > 0 && (
              <div>
                <h3 className={`${groupHead} ${groupLabel}`}>Asked of you</h3>
                <ul className="divide-y divide-line">{asksToMe.map((a) => <AskCard key={a.id} ask={a} founders={founders} />)}</ul>
              </div>
            )}
            {proposed.length > 0 && (
              <div>
                <div className={groupHead}>
                  <h3 className={groupLabel}>Proposed tasks</h3>
                  <ConfirmAll refs={proposed.map((t) => String(t.number))} />
                </div>
                <TaskList tasks={proposed} founders={founders} />
              </div>
            )}
            {proposedEvents.length > 0 && (
              <div>
                <div className={groupHead}>
                  <h3 className={groupLabel}>Dates found in chats</h3>
                  <ConfirmAllEvents refs={proposedEvents.map((e) => String(e.number))} />
                </div>
                <ul className="divide-y divide-line">
                  {proposedEvents.map((e) => <ProposedEvent key={e.id} event={e} founders={founders} tz={user.timezone} />)}
                </ul>
              </div>
            )}
            {suggestions.length > 0 && (
              <div>
                <h3 className={`${groupHead} ${groupLabel}`}>Suggested edits to your text</h3>
                <div className="divide-y divide-line"><SuggestionList suggestions={suggestions} founders={founders} flat /></div>
              </div>
            )}
          </div>
        </section>
      )}

      {pastAsks.length > 0 && (
        <section>
          <AskThread asks={pastAsks} founders={founders} me={user.id} withTarget title="Requests" />
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="space-y-10 min-w-0">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className={h2Cls}>Your tasks</h2>
              <Link href="/tasks?who=me" className={link}>All tasks →</Link>
            </div>
            <div className={cardCls}>
              <div className="p-3 border-b border-line"><QuickAddTask founders={founders} me={user.id} /></div>
              <TaskList tasks={mine} founders={founders} empty="No open tasks. Add one above, or press Capture." />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className={h2Cls}>What changed</h2>
              <Link href="/activity" className={link}>Full history →</Link>
            </div>
            <div className={cardCls}>
              <ActivityFeed items={feedItems(activity).slice(0, 8)} founders={founders} />
            </div>
          </section>
        </div>

        <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className={h2Cls}>Coming up</h2>
              <Link href="/timeline" className={link}>Timeline →</Link>
            </div>
            {comingUp.length === 0 && <p className="text-sm text-ink-3">Nothing on the timeline.</p>}
            <ul className="space-y-3">
              {comingUp.map((e) => {
                const mine = e.attendance.find((a) => a.userId === user.id)?.status;
                return (
                  <li key={e.id} className="text-sm">
                    <Link href={`/timeline/${e.number}`} className="hover:underline font-medium">{e.title}</Link>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-ink-2 mt-0.5">
                      <span className="ref text-ink-2">{formatWhen(e.startsAt, e.allDay, user.timezone, e.timezone).main}</span>
                      {e.importance === "mandatory" && <ImportanceChip importance="mandatory" />}
                      <span className={mine ? "text-ink-3" : e.importance === "mandatory" ? "text-danger" : "text-ink-3"}>
                        {mine === "going" ? "You're going" : mine === "maybe" ? "Maybe" : mine === "no" ? "Not going" : "No answer yet"}
                      </span>
                    </div>
                    <div className="mt-1">
                      <EventLinks links={eventLinks(e).filter((l) => isJoinLink(l.url))} today={daysUntil(e.startsAt, user.timezone, e.allDay) === 0} compact />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className={h2Cls}>Next meeting</h2>
              <Link href="/meetings" className={link}>Agenda →</Link>
            </div>
            {agenda.length ? (
              <ul className="text-sm list-disc pl-5 space-y-0.5 marker:text-ink-3">{agenda.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
            ) : (
              <p className="text-sm text-ink-3">No topics yet.</p>
            )}
            {lastMeeting && (
              <p className="text-xs text-ink-3">
                Last: <Link href={`/meetings/${lastMeeting.id}`} className="underline underline-offset-2">{lastMeeting.title}</Link>, <span className="ref">{formatDate(lastMeeting.date, false)}</span>
              </p>
            )}
          </section>
          <section className="space-y-1">
            <div className="flex items-baseline justify-between">
              <h2 className={h2Cls}>Company brief</h2>
              <Link href="/brief" className={link}>Open →</Link>
            </div>
            <p className="text-sm text-ink-2">
              {staleness.changes.length
                ? `${staleness.changes.length} change${staleness.changes.length === 1 ? "" : "s"} since the story was updated.`
                : "Up to date."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
