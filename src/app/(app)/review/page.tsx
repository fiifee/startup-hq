import { SuggestionCard } from "@/components/suggestions";
import { ConfirmAll, TaskList } from "@/components/tasks";
import { cardCls, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";
import { listOpenSuggestions } from "@/lib/services/suggestions";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  await requireUser();
  const [founders, suggestions, proposed] = await Promise.all([
    listFounders(),
    listOpenSuggestions(),
    db.task.findMany({ where: { status: "proposed" }, orderBy: { number: "asc" } }),
  ]);
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className={h1Cls}>Review</h1>
        <p className="text-ink-2 mt-1">AI never overwrites what a person wrote, and never makes inferred tasks final. Those land here.</p>
      </div>

      <section className={cardCls}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h2 className={h2Cls}>Proposed tasks <span className="text-ink-3 font-normal">{proposed.length}</span></h2>
          <ConfirmAll refs={proposed.map((t) => String(t.number))} />
        </div>
        <TaskList tasks={proposed} founders={founders} empty="Nothing to confirm." />
      </section>

      <section className="space-y-3">
        <h2 className={h2Cls}>Suggested edits <span className="text-ink-3 font-normal">{suggestions.length}</span></h2>
        {suggestions.length === 0 && <p className="text-sm text-ink-3">None.</p>}
        {suggestions.map((s) => {
          const p = s.proposed as Record<string, unknown>;
          if (s.task) {
            return (
              <SuggestionCard
                key={s.id}
                founders={founders}
                suggestion={s}
                context={{ label: `T-${s.task.number}`, href: `/tasks/${s.task.number}` }}
                changes={Object.entries(p).map(([field, after]) => ({
                  label: field === "title" ? "Title" : "Description",
                  before: field === "title" ? s.task!.title : s.task!.description,
                  after: String(after),
                }))}
              />
            );
          }
          if (s.goal) {
            return (
              <SuggestionCard
                key={s.id}
                founders={founders}
                suggestion={s}
                context={{ label: `G-${s.goal.number}`, href: `/goals/${s.goal.number}` }}
                changes={Object.entries(p).map(([field, after]) => ({
                  label: field === "title" ? "Goal" : "Description",
                  before: field === "title" ? s.goal!.title : s.goal!.description,
                  after: String(after),
                }))}
              />
            );
          }
          if (s.block) {
            return (
              <SuggestionCard
                key={s.id}
                founders={founders}
                suggestion={s}
                context={{ label: s.block.note.title, href: s.block.note.kind === "brief" ? "/brief" : `/notes/${s.block.note.id}` }}
                changes={[{ label: "Paragraph", before: s.block.content, after: p.delete ? null : String(p.content ?? "") }]}
              />
            );
          }
          return null;
        })}
      </section>
    </div>
  );
}
