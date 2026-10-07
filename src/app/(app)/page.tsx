import Link from "next/link";
import { ActivityFeed } from "@/components/activity";
import { Avatar, firstName } from "@/components/people";
import { ConfirmAll, QuickAddTask, TaskList } from "@/components/tasks";
import { cardCls, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentActivity } from "@/lib/services/activity";
import { listFounders } from "@/lib/services/people";
import { feedItems } from "@/lib/view";

export default async function Home() {
  const user = await requireUser();
  const [founders, mine, proposed, suggestions, activity, openByPerson, agendaCount, lastMeeting] = await Promise.all([
    listFounders(),
    db.task.findMany({ where: { assigneeId: user.id, status: { in: ["todo", "doing", "blocked"] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }], take: 30 }),
    db.task.findMany({ where: { status: "proposed" }, orderBy: { number: "asc" } }),
    db.suggestion.count({ where: { status: "open" } }),
    recentActivity({ limit: 25 }),
    db.task.groupBy({ by: ["assigneeId", "status"], _count: true, where: { status: { in: ["todo", "doing", "blocked"] } } }),
    db.agendaItem.count({ where: { meetingId: null, done: false } }),
    db.meeting.findFirst({ orderBy: { date: "desc" } }),
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const count = (id: string, status?: string) => openByPerson.filter((g) => g.assigneeId === id && (!status || g.status === status)).reduce((s, g) => s + g._count, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className={h1Cls}>{greeting}, {firstName(user)}</h1>
        <p className="text-ink-2 mt-1">
          {mine.length ? `${mine.length} open task${mine.length === 1 ? "" : "s"} on you.` : "Nothing on your plate."}{" "}
          {agendaCount > 0 && <Link href="/agenda" className="underline">{agendaCount} topic{agendaCount === 1 ? "" : "s"} for the next meeting.</Link>}
        </p>
      </header>

      {(proposed.length > 0 || suggestions > 0) && (
        <section className={`${cardCls} border-dashed`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div>
              <h2 className={h2Cls}>Waiting for a person</h2>
              <p className="text-sm text-ink-2">AI proposed these. Nothing is final until someone confirms it.</p>
            </div>
            <ConfirmAll refs={proposed.map((t) => String(t.number))} />
          </div>
          <TaskList tasks={proposed} founders={founders} />
          {suggestions > 0 && (
            <Link href="/review" className="block px-4 py-2.5 border-t border-line text-sm underline">
              {suggestions} suggested edit{suggestions === 1 ? "" : "s"} to text you wrote →
            </Link>
          )}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8 min-w-0">
          <section className={cardCls}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h2 className={h2Cls}>Your tasks</h2>
              <Link href="/tasks?who=me" className="text-sm text-ink-2 hover:text-ink">All →</Link>
            </div>
            <div className="p-3 border-b border-line"><QuickAddTask founders={founders} me={user.id} /></div>
            <TaskList tasks={mine} founders={founders} empty="No open tasks. Add one above, or ask your AI." />
          </section>
          <section className={cardCls}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h2 className={h2Cls}>Recent activity</h2>
              <Link href="/activity" className="text-sm text-ink-2 hover:text-ink">All →</Link>
            </div>
            <ActivityFeed items={feedItems(activity)} founders={founders} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className={cardCls}>
            <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Team</h2>
            <ul className="divide-y divide-line">
              {founders.map((f) => (
                <li key={f.id}>
                  <Link href={`/tasks?who=${f.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <Avatar user={f} size={28} />
                    <span className="flex-1 text-sm">
                      {f.name ?? f.email}
                      {!f.joinedAt && <span className="text-ink-3"> · invited</span>}
                    </span>
                    <span className="text-sm text-ink-2 tabular">{count(f.id)} open{count(f.id, "blocked") ? `, ${count(f.id, "blocked")} blocked` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${cardCls} p-4 space-y-2`}>
            <h2 className={h2Cls}>Last meeting</h2>
            {lastMeeting ? (
              <Link href={`/meetings/${lastMeeting.id}`} className="block hover:underline text-sm">
                {lastMeeting.title} · {lastMeeting.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {!lastMeeting.processedAt && <span className="text-warn"> · not summarised</span>}
              </Link>
            ) : (
              <p className="text-sm text-ink-2">None yet.</p>
            )}
            <Link href="/meetings/new" className="inline-block text-sm underline">Add a meeting transcript</Link>
          </section>
          <section className="text-xs text-ink-3 px-1 space-y-1">
            <p>Colours show who did what. A tinted row with ✦ was written by that founder&apos;s AI.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
