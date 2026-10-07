"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { resolveSuggestionAction } from "@/app/actions";
import { Byline, type Founder } from "./people";
import { relative } from "./ui";
import { useAction } from "./use-action";

type Change = { label: string; before: string; after: string | null };

/** An AI's proposed change to text a person wrote: before, after, and the person's call. */
export function SuggestionCard({
  suggestion,
  changes,
  founders,
  context,
}: {
  suggestion: { id: string; byId: string | null; agent: string | null; reason: string; createdAt: Date };
  changes: Change[];
  founders: Founder[];
  context?: { label: string; href: string };
}) {
  const { pending, run } = useAction();
  const color = founders.find((f) => f.id === suggestion.byId)?.color ?? "#7b776f";
  return (
    <div className="rounded-lg border-2 border-dashed p-3 space-y-2" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Byline founders={founders} byId={suggestion.byId} agent={suggestion.agent} size="xs" />
        <span className="text-ink-2">suggests a change</span>
        {context && <Link href={context.href} className="underline text-ink-2">{context.label}</Link>}
        <span className="text-xs text-ink-3 ml-auto">{relative(suggestion.createdAt)}</span>
      </div>
      {suggestion.reason && <p className="text-sm text-ink-2 italic">“{suggestion.reason}”</p>}
      {changes.map((c, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-xs text-ink-3 mb-0.5">{c.label}, now</div>
            <div className="whitespace-pre-wrap rounded bg-sunken px-2 py-1.5 text-ink-2 max-h-48 overflow-auto">{c.before || <em>empty</em>}</div>
          </div>
          <div>
            <div className="text-xs text-ink-3 mb-0.5">{c.after === null ? "Proposed: remove it" : "Proposed"}</div>
            <div className="whitespace-pre-wrap rounded px-2 py-1.5 ai-tint max-h-48 overflow-auto" style={{ ["--who" as string]: color }}>
              {c.after === null ? <em>(removed)</em> : c.after}
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run(() => resolveSuggestionAction(suggestion.id, true), "Accepted")} className="h-8 px-3 rounded-md bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
          <Check className="w-3.5 h-3.5" /> Accept
        </button>
        <button disabled={pending} onClick={() => run(() => resolveSuggestionAction(suggestion.id, false))} className="h-8 px-3 rounded-md border border-line-strong text-sm inline-flex items-center gap-1.5 hover:bg-sunken disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> Keep mine
        </button>
      </div>
    </div>
  );
}
