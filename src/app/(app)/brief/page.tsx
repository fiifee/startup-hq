import Link from "next/link";
import { BlockEditor, type BlockSuggestion } from "@/components/block-editor";
import { BriefFreshness } from "@/components/brief";
import { DecisionRow, NewDecision } from "@/components/decisions";
import { NewGoal, ProgressBar, Roadmap } from "@/components/goals";
import { firstName } from "@/components/people";
import { cardCls, formatDate, h1Cls, h2Cls, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { briefStaleness, briefState, getBrief } from "@/lib/services/brief";
import { listDecisions } from "@/lib/services/decisions";
import { listGoals } from "@/lib/services/goals";
import { listFounders } from "@/lib/services/people";
import { formatDay } from "@/lib/time";

export const metadata = { title: "Company brief" };

const STARTER = `Start the brief, or press "Update with my AI" to draft it from your tasks, goals and meetings.
Good sections: ## What we're building · ## For whom · ## Where we are · ## What matters now · ## People`;

export default async function BriefPage() {
  const user = await requireUser();
  const note = await getBrief();
  const [founders, state, staleness, suggestions, keys, allGoals, decisions, decisionCount] = await Promise.all([
    listFounders(),
    briefState(),
    briefStaleness(note.id),
    db.suggestion.findMany({ where: { entityType: "block", entityId: { in: note.blocks.map((b) => b.id) }, status: "open" } }),
    db.aiKey.count({ where: { userId: user.id } }),
    listGoals({ includeClosed: true }),
    listDecisions({ limit: 30 }),
    db.decision.count(),
  ]);
  const finished = allGoals.filter((g) => g.status !== "active");
  const toDecide = decisions.filter((d) => d.status === "open");
  const decided = decisions.filter((d) => d.status !== "open").slice(0, 8);
  const who = (id: string | null) => firstName(founders.find((f) => f.id === id));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className={h1Cls}>Company brief</h1>
        <p className="text-ink-2 mt-1">
          What we do and where we stand. Every connected AI reads this first.
          {staleness.since && <> Story last updated {relative(staleness.since)}.</>}
        </p>
      </div>
      <BriefFreshness changes={staleness.changes.length} hasKey={keys > 0} empty={note.blocks.length === 0} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <section className="min-w-0 space-y-2">
          <h2 className={h2Cls}>The story</h2>
          <BlockEditor
            noteId={note.id}
            blocks={note.blocks}
            suggestions={suggestions.map((s) => ({ ...s, proposed: s.proposed as BlockSuggestion["proposed"] }))}
            founders={founders}
            placeholder={STARTER}
          />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className={cardCls}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h2 className={h2Cls}>Right now</h2>
              <span className="text-xs text-ink-3">live</span>
            </div>
            <div className="p-4 space-y-4 text-sm">
              {!state.upcoming.length && !state.doing.length && !state.blocked.length && !state.done.length && <p className="text-ink-3">Nothing in progress or recently done yet.</p>}
              {state.upcoming.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink-2">Coming up</h3>
                  {state.upcoming.map((e) => (
                    <Link key={e.id} href={`/timeline/${e.number}`} className="block truncate hover:underline">
                      {e.title} <span className="text-ink-3">· {formatDay(e.startsAt, user.timezone, e.allDay)}{e.importance === "mandatory" ? " · mandatory" : ""}</span>
                    </Link>
                  ))}
                </div>
              )}
              {state.doing.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink-2">In progress</h3>
                  {state.doing.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.number}`} className="block truncate hover:underline">{t.title} <span className="text-ink-3">· {who(t.assigneeId)}</span></Link>
                  ))}
                </div>
              )}
              {state.blocked.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-danger">Blocked</h3>
                  {state.blocked.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.number}`} className="block truncate hover:underline">{t.title} <span className="text-ink-3">· {who(t.assigneeId)}</span></Link>
                  ))}
                </div>
              )}
              {state.done.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink-2">Done in the last two weeks</h3>
                  {state.done.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.number}`} className="block truncate hover:underline text-ink-2">✓ {t.title}</Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section id="roadmap" className="space-y-3 scroll-mt-6">
        <div>
          <h2 className={h2Cls}>Roadmap</h2>
          <p className="text-sm text-ink-2">Goals fill up as their tasks get done. Drag a goal to re-plan it.</p>
        </div>
        <div className={`${cardCls} p-3`}><NewGoal founders={founders} me={user.id} /></div>
        <Roadmap goals={state.goals} founders={founders} />
        {finished.length > 0 && (
          <details className={cardCls}>
            <summary className="px-4 py-2.5 text-sm cursor-pointer">{finished.length} achieved or dropped</summary>
            <ul className="divide-y divide-line border-t border-line">
              {finished.map((g) => (
                <li key={g.id}>
                  <Link href={`/goals/${g.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken text-sm">
                    <span className={`flex-1 ${g.status === "dropped" ? "line-through text-ink-3" : ""}`}>{g.title}</span>
                    <span className="w-32"><ProgressBar done={g.progress.done} total={g.progress.total} /></span>
                    <span className={`text-xs w-28 text-right ${g.status === "achieved" ? "text-accent font-medium" : "text-ink-3"}`}>
                      {g.status === "achieved" ? `Achieved ${g.achievedAt ? formatDate(g.achievedAt, false) : ""}` : "Dropped"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section id="decisions" className="space-y-3 scroll-mt-6 max-w-3xl">
        <div>
          <h2 className={h2Cls}>Decisions</h2>
          <p className="text-sm text-ink-2">What we agreed and why, and what we still have to decide. Click the pencil to edit any decision.</p>
        </div>
        <div className={`${cardCls} p-3`}><NewDecision /></div>
        {toDecide.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">To decide <span className="text-ink-3 font-normal">{toDecide.length}</span></h3>
            <ul className={`${cardCls} divide-y divide-line border-dashed`}>
              {toDecide.map((d) => <DecisionRow key={d.id} decision={d} founders={founders} />)}
            </ul>
          </div>
        )}
        {decided.length > 0 && (
          <div className="space-y-1.5">
            {toDecide.length > 0 && <h3 className="text-sm font-semibold">Decided</h3>}
            <ul className={`${cardCls} divide-y divide-line`}>
              {decided.map((d) => <DecisionRow key={d.id} decision={d} founders={founders} />)}
            </ul>
          </div>
        )}
        {decisionCount > toDecide.length + decided.length && (
          <Link href="/decisions" className="inline-block text-sm underline">All {decisionCount} decisions, with search →</Link>
        )}
      </section>
    </div>
  );
}
