import type { Founder } from "./people";
import { SuggestionCard } from "./suggestions";

type Open = {
  id: string;
  byId: string | null;
  agent: string | null;
  reason: string;
  createdAt: Date;
  proposed: unknown;
  task: { number: number; title: string; description: string } | null;
  goal: { number: number; title: string; description: string } | null;
  decision?: { number: number; title: string; rationale: string } | null;
  block: { content: string; note: { id: string; title: string; kind: string } } | null;
};

/** Every open AI suggestion, each with a link to where it applies. */
export function SuggestionList({ suggestions, founders, flat = false }: { suggestions: Open[]; founders: Founder[]; flat?: boolean }) {
  return (
    <>
      {suggestions.map((s) => {
        const p = s.proposed as Record<string, unknown>;
        const target = s.task ?? s.goal;
        if (target) {
          const isTask = !!s.task;
          return (
            <SuggestionCard
              key={s.id}
              founders={founders}
              flat={flat}
              suggestion={s}
              context={{ label: `${isTask ? "T" : "G"}-${target.number}`, href: `/${isTask ? "tasks" : "goals"}/${target.number}` }}
              changes={Object.entries(p).map(([field, after]) => ({
                label: field === "title" ? (isTask ? "Title" : "Goal") : "Description",
                before: field === "title" ? target.title : target.description,
                after: String(after),
              }))}
            />
          );
        }
        if (s.decision) {
          const d = s.decision;
          return (
            <SuggestionCard
              key={s.id}
              founders={founders}
              flat={flat}
              suggestion={s}
              context={{ label: `D-${d.number}`, href: "/brief#decisions" }}
              changes={Object.entries(p).map(([field, after]) => ({
                label: field === "title" ? "Decision" : "Why",
                before: field === "title" ? d.title : d.rationale,
                after: String(after),
              }))}
            />
          );
        }
        if (s.block) {
          const n = s.block.note;
          return (
            <SuggestionCard
              key={s.id}
              founders={founders}
              flat={flat}
              suggestion={s}
              context={{ label: n.title, href: n.kind === "brief" ? "/brief" : `/notes/${n.id}` }}
              changes={[{ label: "Paragraph", before: s.block.content, after: p.delete ? null : String(p.content ?? "") }]}
            />
          );
        }
        return null;
      })}
    </>
  );
}
