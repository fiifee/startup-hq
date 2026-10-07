import Link from "next/link";
import { BlockEditor, type BlockSuggestion } from "@/components/block-editor";
import { BriefFreshness } from "@/components/brief";
import { ProgressBar } from "@/components/goals";
import { firstName } from "@/components/people";
import { cardCls, formatDate, h1Cls, h2Cls, HORIZON_META, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { briefStaleness, briefState, getBrief } from "@/lib/services/brief";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Company brief" };

const STARTER = `Start the brief, or press "Update with my AI" to draft it from your tasks, goals and meetings.
Good sections: ## What we're building · ## For whom · ## Where we are · ## What matters now · ## People`;

export default async function BriefPage() {
  const user = await requireUser();
  const note = await getBrief();
  const [founders, state, staleness, suggestions, keys] = await Promise.all([
    listFounders(),
    briefState(),
    briefStaleness(note.id),
    db.suggestion.findMany({ where: { entityType: "block", entityId: { in: note.blocks.map((b) => b.id) }, status: "open" } }),
    db.aiKey.count({ where: { userId: user.id } }),
  ]);
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
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-ink-2">Goals</h3>
                {state.goals.length === 0 && <p className="text-ink-3"><Link href="/goals" className="underline">Add your first goal</Link></p>}
                {state.goals.map((g) => (
                  <div key={g.id}>
                    <Link href={`/goals/${g.number}`} className="hover:underline">{g.title}</Link>
                    <span className="text-xs text-ink-3"> · {HORIZON_META[g.horizon]?.label}{g.targetDate ? `, by ${formatDate(g.targetDate, false)}` : ""}</span>
                    <ProgressBar done={g.progress.done} total={g.progress.total} color={founders.find((f) => f.id === g.ownerId)?.color} />
                  </div>
                ))}
              </div>
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
              {state.decisions.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink-2">Standing decisions</h3>
                  {state.decisions.map((d) => (
                    <p key={d.id} className="truncate"><span className="text-ink-3 tabular">D-{d.number}</span> {d.title}</p>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
