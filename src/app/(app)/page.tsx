import Link from "next/link";
import { ActivityFeed } from "@/components/activity";
import { Markdown } from "@/components/markdown";
import { Avatar, Byline, firstName } from "@/components/people";
import { AnsweredList, AskCard, AskThread } from "@/components/asks";
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
import { shortName } from "@/lib/names";
import { daysAgo, feedItems } from "@/lib/view";

/**
 * Home is the inbox: what needs you, your tasks, the week's summary, and
 * everything that changed (with Undo).
 */
export default async function Home() {
  const user = await requireUser();
  const brief = await briefNote();
  const [founders, mine, proposed, suggestions, activity, openByPerson, agenda, lastMeeting, staleness, weekly, proposedEvents, comingUp, asksToMe, answered, myAsks] = await Promise.all([
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
    db.task.groupBy({ by: ["assigneeId", "status"], _count: true, where: { status: { in: ["todo", "doing", "blocked"] } } }),
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
    listAsks({ fromId: user.id, unseenAnswered: true }),
    listAsks({ involving: user.id, since: daysAgo(14), status: ["open", "answered", "declined"], limit: 30 }),
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const count = (id: string, status?: string) =>
    openByPerson.filter((g) => g.assigneeId === id && (!status || g.status === status)).reduce((s, g) => s + g._count, 0);
  // Recent requests either way, minus what already shows above: open ones to me (Needs you) and unread answers (AnsweredList).
  const pastAsks = myAsks
    .filter((a) => !(a.status === "open" && a.toId === user.id) && !(a.fromId === user.id && a.status !== "open" && !a.seenByAsker))
    .sort((a, b) => +(b.answeredAt ?? b.createdAt) - +(a.answeredAt ?? a.createdAt));
  const needsYou = proposed.length + suggestions.length + proposedEvents.length + asksToMe.length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className={h1Cls}>{greeting}, {firstName(user)}</h1>
        <p className="text-ink-2 mt-1">
          {needsYou ? `${needsYou} thing${needsYou === 1 ? "" : "s"} need${needsYou === 1 ? "s" : ""} you. ` : "Nothing waiting for you. "}
          {mine.length ? `${mine.length} open task${mine.length === 1 ? "" : "s"} on you.` : ""}
        </p>
      </header>

      {weekly && (
        <section className={`${cardCls} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <h2 className={h2Cls}>{weekly.title}</h2>
            <span className="inline-flex items-center gap-3 text-sm">
              <Byline founders={founders} byId={weekly.createdById} agent={weekly.createdAgent} size="xs" />
              <Link href={`/notes/${weekly.id}`} className="text-ink-2 hover:text-ink">Read →</Link>
            </span>
          </div>
          <Link href={`/notes/${weekly.id}`} className="block px-4 py-3 max-h-40 overflow-hidden relative hover:bg-sunken/50">
            <Markdown className="text-sm">{weekly.blocks.map((b) => b.content).join("\n\n")}</Markdown>
            <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
          </Link>
        </section>
      )}

      {needsYou > 0 && (
        <section className="space-y-3">
          <h2 className={h2Cls}>Needs you</h2>
          {asksToMe.length > 0 && (
            <div className={cardCls}>
              <p className="px-4 py-3 border-b border-line text-sm text-ink-2">Your teammates asked for your input.</p>
              <ul className="divide-y divide-line">{asksToMe.map((a) => <AskCard key={a.id} ask={a} founders={founders} />)}</ul>
            </div>
          )}
          {proposed.length > 0 && (
            <div className={`${cardCls} border-dashed`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                <p className="text-sm text-ink-2">AI proposed these tasks. Nothing is final until someone confirms it.</p>
                <ConfirmAll refs={proposed.map((t) => String(t.number))} />
              </div>
              <TaskList tasks={proposed} founders={founders} />
            </div>
          )}
          {proposedEvents.length > 0 && (
            <div className={`${cardCls} border-dashed`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                <p className="text-sm text-ink-2">Dates found in chats. Confirm to put them on the timeline.</p>
                <ConfirmAllEvents refs={proposedEvents.map((e) => String(e.number))} />
              </div>
              <ul className="divide-y divide-line">
                {proposedEvents.map((e) => <ProposedEvent key={e.id} event={e} founders={founders} tz={user.timezone} />)}
              </ul>
            </div>
          )}
          <SuggestionList suggestions={suggestions} founders={founders} />
        </section>
      )}

      <AnsweredList asks={answered} founders={founders} />

      {pastAsks.length > 0 && (
        <section className="space-y-3">
          <h2 className={h2Cls}>Requests</h2>
          <AskThread asks={pastAsks} founders={founders} me={user.id} withTarget />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8 min-w-0">
          <section className={cardCls}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h2 className={h2Cls}>Your tasks</h2>
              <Link href="/tasks?who=me" className="text-sm text-ink-2 hover:text-ink">All →</Link>
            </div>
            <div className="p-3 border-b border-line"><QuickAddTask founders={founders} me={user.id} /></div>
            <TaskList tasks={mine} founders={founders} empty="No open tasks. Add one above, or press Capture." />
          </section>
          <section className={cardCls}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h2 className={h2Cls}>What changed</h2>
              <Link href="/activity" className="text-sm text-ink-2 hover:text-ink">Full history →</Link>
            </div>
            <ActivityFeed items={feedItems(activity)} founders={founders} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${cardCls} p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <h2 className={h2Cls}>Coming up</h2>
              <Link href="/timeline" className="text-sm text-ink-2 hover:text-ink">Timeline →</Link>
            </div>
            {comingUp.length === 0 && <p className="text-sm text-ink-3">Nothing on the timeline.</p>}
            <ul className="space-y-2">
              {comingUp.map((e) => {
                const mine = e.attendance.find((a) => a.userId === user.id)?.status;
                return (
                  <li key={e.id} className="text-sm">
                    <Link href={`/timeline/${e.number}`} className="hover:underline font-medium">{e.title}</Link>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-ink-2 mt-0.5">
                      <span>{formatWhen(e.startsAt, e.allDay, user.timezone, e.timezone).main}</span>
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
          <section className={`${cardCls} p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <h2 className={h2Cls}>Next meeting</h2>
              <Link href="/meetings" className="text-sm text-ink-2 hover:text-ink">Agenda →</Link>
            </div>
            {agenda.length ? (
              <ul className="text-sm list-disc pl-5 space-y-0.5">{agenda.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
            ) : (
              <p className="text-sm text-ink-3">No topics yet.</p>
            )}
            {lastMeeting && (
              <p className="text-xs text-ink-3">
                Last: <Link href={`/meetings/${lastMeeting.id}`} className="underline">{lastMeeting.title}</Link>, {formatDate(lastMeeting.date, false)}
              </p>
            )}
          </section>
          <section className={`${cardCls} p-4 space-y-1`}>
            <div className="flex items-center justify-between">
              <h2 className={h2Cls}>Company brief</h2>
              <Link href="/brief" className="text-sm text-ink-2 hover:text-ink">Open →</Link>
            </div>
            <p className="text-sm text-ink-2">
              {staleness.changes.length
                ? `${staleness.changes.length} change${staleness.changes.length === 1 ? "" : "s"} since the story was updated.`
                : "Up to date."}
            </p>
          </section>
          <section className={cardCls}>
            <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Team</h2>
            <ul className="divide-y divide-line">
              {founders.map((f) => (
                <li key={f.id}>
                  <Link href={`/tasks?who=${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <Avatar user={f} size={28} />
                    <span className="flex-1 text-sm">
                      {shortName(f, founders)}
                      {!f.joinedAt && <span className="text-ink-3"> · invited</span>}
                    </span>
                    <span className="text-sm text-ink-2 tabular">{count(f.id)} open{count(f.id, "blocked") ? `, ${count(f.id, "blocked")} blocked` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-ink-3 px-1">Colours show who did what. A tinted row with ✦ was written by that user&apos;s AI.</p>
        </aside>
      </div>
    </div>
  );
}
