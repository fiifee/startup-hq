import Link from "next/link";
import { Markdown } from "./markdown";
import { Byline, type Founder } from "./people";
import { cardCls, h2Cls, relative } from "./ui";

type Connected = {
  id: string;
  body: string;
  byId: string | null;
  agent: string | null;
  createdAt: Date;
  task: { number: number; title: string };
};

/** Task comments someone connected to this meeting or event, each linking back to its task. */
export function FromTasks({ comments, founders }: { comments: Connected[]; founders: Founder[] }) {
  if (!comments.length) return null;
  return (
    <section className={cardCls}>
      <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>From tasks</h2>
      <ul className="divide-y divide-line">
        {comments.map((c) => (
          <li key={c.id} className={`arrive px-4 py-3 space-y-1 [--mark-top:1.1rem] ${c.agent ? "ai-tint" : ""}`} style={{ ["--who" as string]: founders.find((f) => f.id === c.byId)?.color }}>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <Link href={`/tasks/${c.task.number}`} className="hover:underline font-medium min-w-0 truncate">
                <span className="ref mr-1.5">T-{c.task.number}</span>
                {c.task.title}
              </Link>
              <span className="ml-auto inline-flex items-center gap-2 text-xs text-ink-3">
                <Byline founders={founders} byId={c.byId} agent={c.agent} size="xs" />
                {relative(c.createdAt)}
              </span>
            </div>
            <Markdown className="text-sm">{c.body}</Markdown>
          </li>
        ))}
      </ul>
    </section>
  );
}
