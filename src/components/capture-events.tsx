"use client";

import { AlertTriangle } from "lucide-react";
import { COMMON_TZ, formatWhen, parseWhen, tzCity } from "@/lib/time";
import { IMPORTANCE_META, KIND_LABEL } from "./ui";

export type DraftEvent = {
  include: boolean;
  title: string;
  kind: string;
  importance: string;
  date: string;
  time: string;
  endTime: string;
  timezone: string;
  location: string;
  url: string;
  description: string;
  dateText: string;
  warnings: string[];
};

const field = "h-8 px-2 rounded border border-line-strong bg-surface text-sm focus:outline-none focus:border-accent";

/** What the time means for the reader, recomputed as the fields change. */
function yourTime(e: DraftEvent, userTz: string) {
  try {
    if (!e.date) return null;
    const w = parseWhen(e.time ? `${e.date} ${e.time}` : e.date, e.timezone);
    const f = formatWhen(w.date, w.allDay, userTz, e.timezone);
    return f.local ? `${f.main} your time · ${f.local}` : f.main;
  } catch {
    return null;
  }
}

/**
 * Review events read from pasted text. Every field can be corrected before
 * anything is saved; the line under each shows the result in the reader's zone.
 */
export function EventDrafts({ drafts, setDrafts, userTz }: { drafts: DraftEvent[]; setDrafts: (d: DraftEvent[]) => void; userTz: string }) {
  const update = (i: number, patch: Partial<DraftEvent>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-2 max-h-[50dvh] overflow-y-auto pr-1">
      {drafts.length === 0 && <p className="text-sm text-ink-2">No dated events found in this text.</p>}
      {drafts.map((d, i) => {
        const zones = [...new Set([d.timezone, userTz, ...COMMON_TZ])];
        const yours = yourTime(d, userTz);
        return (
          <div key={i} className={`rounded-md border p-2.5 space-y-2 ${d.include ? "border-line-strong" : "border-line opacity-60"}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label="Include" className="w-4 h-4 accent-[var(--accent)]" />
              <input value={d.title} onChange={(e) => update(i, { title: e.target.value })} aria-label="Title" className={`${field} flex-1 font-medium`} />
            </div>
            <div className="flex flex-wrap gap-1.5 items-center pl-6">
              <input type="date" value={d.date} onChange={(e) => update(i, { date: e.target.value })} aria-label="Date" className={field} />
              <input type="time" value={d.time} onChange={(e) => update(i, { time: e.target.value })} aria-label="Start time" className={field} />
              {d.time && (
                <>
                  <span className="text-ink-3 text-sm">–</span>
                  <input type="time" value={d.endTime} onChange={(e) => update(i, { endTime: e.target.value })} aria-label="End time" className={field} />
                  <select value={d.timezone} onChange={(e) => update(i, { timezone: e.target.value })} aria-label="Time zone" className={field}>
                    {zones.map((z) => <option key={z} value={z}>{tzCity(z)}</option>)}
                  </select>
                </>
              )}
              <select value={d.kind} onChange={(e) => update(i, { kind: e.target.value })} aria-label="Type" className={field}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={d.importance} onChange={(e) => update(i, { importance: e.target.value })} aria-label="Importance" className={field}>
                {Object.entries(IMPORTANCE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="pl-6 text-xs space-y-0.5">
              {yours ? <p className="text-ink">= {yours}</p> : <p className="text-warn">Fill in the date (and time, if it has one).</p>}
              {d.dateText && <p className="text-ink-3">Read from: “{d.dateText}”</p>}
              {d.location && <p className="text-ink-3">{d.location}</p>}
              {d.warnings.map((w) => (
                <p key={w} className="text-warn inline-flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{w}</p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
