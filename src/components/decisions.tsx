"use client";

import Link from "next/link";
import { useState } from "react";
import { recordDecisionAction, updateDecisionAction } from "@/app/actions";
import { Markdown } from "./markdown";
import { Byline, type Founder } from "./people";
import { btnPrimary, formatDate, inputCls, textareaCls } from "./ui";
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
  meeting: { id: string; title: string } | null;
};

const STATUS: Record<string, string> = {
  active: "",
  reversed: "Reversed",
  superseded: "Superseded",
};

export function DecisionRow({ decision: d, founders }: { decision: Decision; founders: Founder[] }) {
  const { pending, run } = useAction();
  return (
    <li className={`px-4 py-3 ${d.createdAgent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: founders.find((f) => f.id === d.createdById)?.color }}>
      <div className="flex items-start gap-3">
        <span className="text-sm text-ink-3 tabular pt-0.5 w-10 shrink-0">D-{d.number}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${d.status !== "active" ? "line-through text-ink-3" : ""}`}>{d.title}</p>
          {d.rationale && <Markdown className="text-sm text-ink-2 mt-0.5">{d.rationale}</Markdown>}
          <div className="flex items-center gap-2 flex-wrap text-xs text-ink-3 mt-1">
            <span>{formatDate(d.decidedAt)}</span>
            {d.meeting && <Link href={`/meetings/${d.meeting.id}`} className="underline">{d.meeting.title}</Link>}
            <Byline founders={founders} byId={d.createdById} agent={d.createdAgent} size="xs" />
            {STATUS[d.status] && <span className="font-medium text-warn">{STATUS[d.status]}</span>}
          </div>
        </div>
        <select
          aria-label="Decision status"
          value={d.status}
          disabled={pending}
          onChange={(e) => run(() => updateDecisionAction(String(d.number), { status: e.target.value }))}
          className="h-8 px-1.5 rounded border border-line text-xs bg-surface"
        >
          <option value="active">Active</option>
          <option value="reversed">Reversed</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>
    </li>
  );
}

export function NewDecision() {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordDecisionAction({ title, rationale }), "Recorded", () => {
          setTitle("");
          setRationale("");
        });
      }}
      className="space-y-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you decide?" aria-label="Decision" className={inputCls} />
      {title && <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} placeholder="Why? (the reasoning you'll want in six months)" aria-label="Rationale" className={textareaCls} />}
      {title && <button disabled={pending} className={btnPrimary}>Record decision</button>}
    </form>
  );
}
