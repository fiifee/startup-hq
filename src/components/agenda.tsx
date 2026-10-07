"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { addAgendaAction, agendaDoneAction, removeAgendaAction } from "@/app/actions";
import { Byline, type Founder } from "./people";
import { btnPrimary, inputCls } from "./ui";
import { useAction } from "./use-action";

export function AgendaItems({ items, founders }: { items: { id: string; text: string; byId: string | null; agent: string | null }[]; founders: Founder[] }) {
  const { pending, run } = useAction();
  const [text, setText] = useState("");
  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className={`group flex items-center gap-3 px-4 py-2.5 ${i.agent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: founders.find((f) => f.id === i.byId)?.color }}>
            <button aria-label="Mark handled" disabled={pending} onClick={() => run(() => agendaDoneAction(i.id, true))} className="w-5 h-5 rounded border border-line-strong hover:bg-sunken inline-flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50" />
            </button>
            <span className="flex-1">{i.text}</span>
            <Byline founders={founders} byId={i.byId} agent={i.agent} size="xs" />
            <button aria-label="Remove" disabled={pending} onClick={() => run(() => removeAgendaAction(i.id))} className="p-1 rounded text-ink-3 hover:text-ink hover:bg-sunken opacity-0 group-hover:opacity-100 focus:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addAgendaAction(text), undefined, () => setText(""));
        }}
        className="flex gap-2 p-3 border-t border-line"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a topic for the next meeting…" aria-label="New agenda topic" className={inputCls} />
        <button disabled={pending || !text.trim()} className={btnPrimary}>Add</button>
      </form>
    </div>
  );
}
