"use client";

import { AlertTriangle, Link2, Video, X } from "lucide-react";
import { cleanLinks, isJoinLink, type EventLink } from "@/lib/links";
import { COMMON_TZ, formatWhen, parseWhen, tzCity } from "@/lib/time";
import { DateInput, TimeInput } from "./date-input";
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
  links: EventLink[];
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
              <DateInput value={d.date} onChange={(e) => update(i, { date: e.target.value })} aria-label="Date" className={`${field} w-[110px]`} />
              <TimeInput value={d.time} onChange={(e) => update(i, { time: e.target.value })} aria-label="Start time" className={`${field} w-[64px]`} />
              {d.time && (
                <>
                  <span className="text-ink-3 text-sm">–</span>
                  <TimeInput value={d.endTime} onChange={(e) => update(i, { endTime: e.target.value })} aria-label="End time" className={`${field} w-[64px]`} />
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
              <LinkEditor links={d.links} onChange={(links) => update(i, { links })} />
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

/** The links that will be saved with the event: rename, remove, or add one. */
function LinkEditor({ links, onChange }: { links: EventLink[]; onChange: (l: EventLink[]) => void }) {
  return (
    <div className="space-y-1 pt-1">
      {links.map((l, i) => (
        <div key={l.url} className="flex items-center gap-1.5">
          {isJoinLink(l.url) ? <Video className="w-3.5 h-3.5 text-accent shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-ink-3 shrink-0" />}
          <input
            value={l.label}
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            aria-label="Link name"
            className="h-7 px-1.5 rounded border border-line bg-surface text-xs w-44"
          />
          <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline truncate flex-1" title={l.url}>{l.url}</a>
          <button type="button" aria-label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))} className="p-0.5 rounded text-ink-3 hover:text-danger"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <input
        placeholder="+ paste a link and press Enter"
        aria-label="Add link"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const url = e.currentTarget.value.trim();
          if (url) onChange(cleanLinks([...links, { label: "", url }]));
          e.currentTarget.value = "";
        }}
        className="h-7 px-1.5 rounded border border-dashed border-line-strong bg-transparent text-xs w-64"
      />
    </div>
  );
}
