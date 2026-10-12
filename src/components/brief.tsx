"use client";

import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { briefReviewedAction, refreshBriefAction } from "@/app/actions";
import { AiMark } from "./people";
import { btnPrimary, btnSecondary } from "./ui";
import { useAction } from "./use-action";

/** "N changes since the brief was last updated" with the two ways to clear it. */
export function BriefFreshness({ changes, hasKey, empty }: { changes: number; hasKey: boolean; empty: boolean }) {
  const { pending, run } = useAction();
  if (changes === 0 && !empty) return <p className="text-sm text-ink-2 inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-ok" /> Up to date with everything that has happened.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-ink-2 mr-1">
        {empty ? (
          "The brief is empty. Write it below, or let your AI draft it from what you have done so far."
        ) : (
          <><strong className="text-ink">{changes}</strong> change{changes === 1 ? "" : "s"} since the story below was last updated.</>
        )}
      </p>
      <button
        disabled={pending || !hasKey}
        title={hasKey ? "" : "Add an AI key in Settings"}
        onClick={() =>
          run(() => refreshBriefAction(), undefined, (r) => {
            const d = (r as { data?: { applied: number; suggested: number } }).data;
            if (!d) return;
            if (!d.applied && !d.suggested) toast.success("Your AI found nothing that needs changing.");
            else toast.success(`Updated ${d.applied} part${d.applied === 1 ? "" : "s"}${d.suggested ? `, ${d.suggested} suggestion${d.suggested === 1 ? "" : "s"} to review below` : ""}.`);
          })
        }
        className={btnPrimary}
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AiMark className="w-4 h-4" />}
        {pending ? "Reading what changed…" : empty ? "Draft it with my AI" : "Update with my AI"}
      </button>
      {!empty && (
        <button disabled={pending} onClick={() => run(() => briefReviewedAction(), "Marked as up to date")} className={btnSecondary}>
          Still accurate
        </button>
      )}
    </div>
  );
}
