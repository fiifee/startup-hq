"use client";

import { Undo2 } from "lucide-react";
import { revertAction } from "@/app/actions";
import { Byline, type Founder } from "./people";
import { relative } from "./ui";
import { useAction } from "./use-action";

export type ActivityItem = { id: string; summary: string; byId: string | null; agent: string | null; createdAt: Date; revertedAt: Date | null; revertible: boolean };

function RevertButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button
      disabled={pending}
      onClick={() => run(() => revertAction(id), "Undone")}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-7 px-2 rounded text-xs text-ink-2 hover:text-ink hover:bg-sunken inline-flex items-center gap-1"
      title="Undo this change"
    >
      <Undo2 className="w-3.5 h-3.5" /> Undo
    </button>
  );
}

export function ActivityFeed({ items, founders }: { items: ActivityItem[]; founders: Founder[] }) {
  if (!items.length) return <p className="text-sm text-ink-3 px-3 py-4">No activity yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className={`arrive group flex items-start gap-3 pl-4 pr-3 py-2 text-sm [--mark-top:0.8rem] ${a.agent ? "ai-tint" : ""}`} style={{ ["--who" as string]: founders.find((f) => f.id === a.byId)?.color ?? "#7b776f" }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Byline founders={founders} byId={a.byId} agent={a.agent} size="xs" />
              <span className="text-xs text-ink-3">{relative(a.createdAt)}</span>
            </div>
            <p className={`mt-0.5 ${a.revertedAt ? "line-through text-ink-3" : ""}`}>{a.summary}</p>
          </div>
          {a.revertible && <RevertButton id={a.id} />}
        </li>
      ))}
    </ul>
  );
}
