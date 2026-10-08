"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { recordDecisionAction, updateDecisionAction } from "@/app/actions";
import { Markdown } from "./markdown";
import { Byline, type Founder } from "./people";
import { btnPrimary, btnSecondary, formatDate, inputCls, labelCls, textareaCls } from "./ui";
import { useAction } from "./use-action";

type Decision = {
  id: string;
  number: number;
  title: string;
  rationale: string;
  status: string;
  decidedAt: Date;
  createdById: string | null;
  createdAgent: string | null;
  textById: string | null;
  textAgent: string | null;
  meeting: { id: string; title: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "To decide",
  active: "Decided",
  reversed: "Reversed",
  superseded: "Superseded",
};

function DecisionForm({
  initial,
  deciding,
  onSave,
  onCancel,
  pending,
}: {
  initial: { title: string; rationale: string };
  deciding: boolean;
  onSave: (v: { title: string; rationale: string }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [rationale, setRationale] = useState(initial.rationale);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave({ title, rationale });
      }}
      className="space-y-2"
    >
      <div>
        <label className={labelCls}>{deciding ? "What did you decide?" : "Decision"}</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{deciding ? "Why (and what you ruled out)" : "Why"}</label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} className={textareaCls} />
      </div>
      <div className="flex gap-2">
        <button disabled={pending || !title.trim()} className={btnPrimary}>{deciding ? "Mark decided" : "Save"}</button>
        <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
      </div>
    </form>
  );
}

/**
 * One decision. Anyone can edit the wording; an open one ("to decide") gets a
 * Decide button that turns the question into the outcome.
 */
export function DecisionRow({ decision: d, founders }: { decision: Decision; founders: Founder[] }) {
  const { pending, run } = useAction();
  const [mode, setMode] = useState<"view" | "edit" | "decide">("view");
  const open = d.status === "open";
  const color = founders.find((f) => f.id === (d.textById ?? d.createdById))?.color;

  if (mode !== "view") {
    return (
      <li className="px-4 py-3 bg-sunken/40">
        <DecisionForm
          initial={{ title: d.title, rationale: d.rationale }}
          deciding={mode === "decide"}
          pending={pending}
          onCancel={() => setMode("view")}
          onSave={(v) =>
            run(
              () => updateDecisionAction(String(d.number), { ...v, ...(mode === "decide" ? { status: "active" } : {}) }),
              mode === "decide" ? "Decided" : "Saved",
              () => setMode("view"),
            )
          }
        />
      </li>
    );
  }

  return (
    <li className={`group px-4 py-3 ${d.textAgent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: color }}>
      <div className="flex items-start gap-3">
        <span className="text-sm text-ink-3 tabular pt-0.5 w-10 shrink-0">D-{d.number}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${d.status === "reversed" || d.status === "superseded" ? "line-through text-ink-3" : ""}`}>
            {open && <span className="text-xs font-semibold text-warn mr-2 align-middle">TO DECIDE</span>}
            {d.title}
          </p>
          {d.rationale && <Markdown className="text-sm text-ink-2 mt-0.5">{d.rationale}</Markdown>}
          <div className="flex items-center gap-2 flex-wrap text-xs text-ink-3 mt-1">
            {!open && <span>{formatDate(d.decidedAt)}</span>}
            {d.meeting && <Link href={`/meetings/${d.meeting.id}`} className="underline">{d.meeting.title}</Link>}
            <Byline founders={founders} byId={d.textById ?? d.createdById} agent={d.textById || d.textAgent ? d.textAgent : d.createdAgent} size="xs" />
            {(d.status === "reversed" || d.status === "superseded") && <span className="font-medium text-warn">{STATUS_LABEL[d.status]}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {open ? (
            <button disabled={pending} onClick={() => setMode("decide")} className="h-8 px-3 rounded-md bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Decide
            </button>
          ) : null}
          <button aria-label={`Edit D-${d.number}`} title="Edit" onClick={() => setMode("edit")} className="h-8 w-8 rounded-md text-ink-2 hover:text-ink hover:bg-sunken inline-flex items-center justify-center">
            <Pencil className="w-4 h-4" />
          </button>
          <select
            aria-label="Decision status"
            value={d.status}
            disabled={pending}
            onChange={(e) => run(() => updateDecisionAction(String(d.number), { status: e.target.value }))}
            className="h-8 px-1.5 rounded border border-line text-xs bg-surface"
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
    </li>
  );
}

/** Add a decision you made, or one the team still has to make. */
export function NewDecision({ meetingId }: { meetingId?: string }) {
  const { pending, run } = useAction();
  const [kind, setKind] = useState<"active" | "open">("active");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordDecisionAction({ title, rationale, status: kind, meetingId }), kind === "open" ? "Added to To decide" : "Decision recorded", () => {
          setTitle("");
          setRationale("");
        });
      }}
      className="space-y-2"
    >
      <div className="flex gap-1 p-1 rounded-lg bg-sunken w-fit" role="radiogroup" aria-label="Kind of decision">
        {([["active", "We decided"], ["open", "We need to decide"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`h-8 px-3 rounded-md text-sm ${kind === k ? "bg-surface shadow-sm font-medium" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === "open" ? "The question, e.g. Which payment provider do we use?" : "What did you decide?"}
        aria-label={kind === "open" ? "Question to decide" : "Decision"}
        className={inputCls}
      />
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        placeholder={kind === "open" ? "Context and options (optional)" : "Why? The reasoning you'll want in six months (optional)"}
        aria-label={kind === "open" ? "Context" : "Rationale"}
        className={textareaCls}
      />
      <button disabled={pending || !title.trim()} className={btnPrimary}>{kind === "open" ? "Add to To decide" : "Record decision"}</button>
    </form>
  );
}
