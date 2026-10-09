"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { createGoalAction, updateGoalAction } from "@/app/actions";
import { DateInput } from "./date-input";
import { shortName } from "@/lib/names";
import { DndColumns } from "./dnd-columns";
import { Avatar, Byline, type Founder } from "./people";
import { btnPrimary, formatDate, HORIZON_META, inputCls, labelCls, selectCls, textareaCls } from "./ui";
import { useAction } from "./use-action";

export type GoalCardData = {
  id: string;
  number: number;
  title: string;
  status: string;
  horizon: string;
  targetDate: Date | null;
  ownerId: string | null;
  createdById: string | null;
  createdAgent: string | null;
  progress: { total: number; done: number; open: number };
};


export function ProgressBar({ done, total, color = "var(--accent)" }: { done: number; total: number; color?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2" title={`${done} of ${total} tasks done`}>
      <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-ink-2 tabular w-12 text-right">{total ? `${done}/${total}` : "no tasks"}</span>
    </div>
  );
}

export function GoalCard({ goal, founders }: { goal: GoalCardData; founders: Founder[] }) {
  const owner = founders.find((f) => f.id === goal.ownerId);
  const color = founders.find((f) => f.id === goal.createdById)?.color ?? "#7b776f";
  return (
    <article className={`rounded-md border border-line bg-surface p-3 space-y-2 ${goal.createdAgent ? "ai-tint" : ""}`} style={{ ["--who" as string]: color }}>
      <div className="flex items-start gap-2">
        <Link href={`/goals/${goal.number}`} className="flex-1 text-sm font-medium leading-snug hover:underline">
          <span className="text-ink-3 tabular mr-1 font-normal">G-{goal.number}</span>
          {goal.title}
        </Link>
        <Avatar user={owner} size={20} />
      </div>
      <ProgressBar done={goal.progress.done} total={goal.progress.total} color={owner?.color} />
      <div className="flex items-center gap-2 flex-wrap text-xs text-ink-2">
        {goal.targetDate && <span>by {formatDate(goal.targetDate, false)}</span>}
        {goal.createdAgent && <Byline founders={founders} byId={goal.createdById} agent={goal.createdAgent} size="xs" />}
      </div>
    </article>
  );
}

/** Now / Next / Later. Drag a goal to re-plan it. */
export function Roadmap({ goals, founders }: { goals: GoalCardData[]; founders: Founder[] }) {
  return (
    <DndColumns
      columns={Object.entries(HORIZON_META).map(([id, m]) => ({ id, label: m.label, hint: m.hint }))}
      items={goals}
      columnOf={(g) => g.horizon}
      onMove={async (g, horizon) => {
        const r = await updateGoalAction(String(g.number), { horizon });
        if (!r.ok) toast.error(r.error);
        return r.ok;
      }}
      renderCard={(g) => <GoalCard goal={g} founders={founders} />}
      empty="Drag a goal here"
    />
  );
}

export function NewGoal({ founders, me }: { founders: Founder[]; me: string }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState("now");
  const [target, setTarget] = useState("");
  const [owner, setOwner] = useState(me);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createGoalAction({ title, horizon, target: target || null, owner: owner || null }), "Goal added", () => {
          setTitle("");
          setTarget("");
        });
      }}
      className="flex flex-wrap gap-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New goal, e.g. 10 pilot clinics signed" aria-label="Goal" className={`${inputCls} flex-1 min-w-[220px]`} />
      <select value={horizon} onChange={(e) => setHorizon(e.target.value)} aria-label="When" className={selectCls}>
        {Object.entries(HORIZON_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
      </select>
      <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className={selectCls}>
        <option value="">No owner</option>
        {founders.map((f) => <option key={f.id} value={f.id}>{shortName(f, founders)}</option>)}
      </select>
      <DateInput value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target date" className={`${selectCls} w-[130px]`} />
      <button disabled={pending || !title.trim()} className="h-10 px-4 rounded-md bg-ink text-canvas text-sm font-medium disabled:opacity-50">Add goal</button>
    </form>
  );
}

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function GoalEditor({ goal, founders }: { goal: GoalCardData & { description: string; textById: string | null; textAgent: string | null }; founders: Founder[] }) {
  const { pending, run } = useAction();
  const initial = { title: goal.title, description: goal.description, status: goal.status, horizon: goal.horizon, target: ymd(goal.targetDate), owner: goal.ownerId ?? "" };
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateGoalAction(String(goal.number), { title: f.title, description: f.description, status: f.status, horizon: f.horizon, target: f.target || null, owner: f.owner || "none" }), "Saved");
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="g-title" className={labelCls}>Goal</label>
        <input id="g-title" value={f.title} onChange={set("title")} className={`${inputCls} text-lg font-medium`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="g-status" className={labelCls}>Status</label>
          <select id="g-status" value={f.status} onChange={set("status")} className={`${selectCls} w-full`}>
            <option value="active">Active</option>
            <option value="achieved">Achieved</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
        <div>
          <label htmlFor="g-horizon" className={labelCls}>When</label>
          <select id="g-horizon" value={f.horizon} onChange={set("horizon")} className={`${selectCls} w-full`}>
            {Object.entries(HORIZON_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="g-owner" className={labelCls}>Owner</label>
          <select id="g-owner" value={f.owner} onChange={set("owner")} className={`${selectCls} w-full`}>
            <option value="">No owner</option>
            {founders.map((u) => <option key={u.id} value={u.id}>{shortName(u, founders)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="g-target" className={labelCls}>Target date</label>
          <DateInput id="g-target" value={f.target} onChange={set("target")} className={`${selectCls} w-full`} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="g-desc" className="text-sm font-medium">Why it matters, and what done looks like</label>
          <span className="text-xs text-ink-3 inline-flex items-center gap-1.5">Text by <Byline founders={founders} byId={goal.textById} agent={goal.textAgent} size="xs" /></span>
        </div>
        <textarea id="g-desc" value={f.description} onChange={set("description")} rows={4} className={textareaCls} />
      </div>
      <div className="flex items-center gap-2">
        <button disabled={!dirty || pending} className={btnPrimary}>Save</button>
        {dirty && <span className="text-sm text-ink-2">Unsaved changes</span>}
      </div>
    </form>
  );
}
