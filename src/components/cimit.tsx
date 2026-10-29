"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { setCimitItemAction, setCimitSheetAction } from "@/app/actions";
import type { CimitItem } from "@/lib/services/cimit";
import { btnPrimary, inputCls, labelCls } from "./ui";
import { useAction } from "./use-action";

/** One checklist item. The tick shows at once and is written to the sheet behind it. */
export function CimitCheck({ item }: { item: CimitItem }) {
  const [done, setDone] = useOptimistic(item.done);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      onClick={() =>
        start(async () => {
          setDone(!done);
          const r = await setCimitItemAction(item.cell, !done);
          if (!r.ok) toast.error(r.error);
        })
      }
      className="group w-full flex items-start gap-2.5 px-2 py-1.5 -mx-2 rounded-md text-left text-sm hover:bg-sunken"
    >
      <span
        aria-hidden
        className={`mt-[3px] w-4 h-4 shrink-0 rounded-[4px] border inline-flex items-center justify-center transition-colors duration-150 ${done ? "bg-ok border-ok text-surface" : "border-line-strong bg-surface group-hover:border-ink-3"}`}
      >
        {done && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      <span className={`min-w-0 [overflow-wrap:anywhere] ${done ? "text-ink-2" : "text-ink"}`}>{item.text}</span>
    </button>
  );
}

export function CimitSheetForm({ change }: { change?: boolean }) {
  const { pending, run } = useAction();
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setCimitSheetAction(value), "Checklist connected", () => setValue(""));
      }}
    >
      <label htmlFor="cimit-sheet" className={labelCls}>{change ? "Use a different sheet" : "Connect the CIMIT checklist"}</label>
      <div className="flex gap-2">
        <input id="cimit-sheet" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the Google Sheet's link" className={inputCls} />
        <button disabled={pending || !value.trim()} className={btnPrimary}>Connect</button>
      </div>
    </form>
  );
}
