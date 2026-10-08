"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Link2, MapPin, Pencil, Video, X } from "lucide-react";
import { toast } from "sonner";
import {
  addEventNoteAction, confirmEventsAction, createEventAction, editEventNoteAction, setAttendanceAction, syncTimezoneAction, updateEventAction,
} from "@/app/actions";
import { cleanLinks, eventLinks, isJoinLink, type EventLink } from "@/lib/links";
import { COMMON_TZ, dayParts, daysUntil, formatWhen, hm, inputValues, tzCity } from "@/lib/time";
import { DateInput, TimeInput } from "./date-input";
import { Markdown } from "./markdown";
import { Avatar, Byline, firstName, type Founder } from "./people";
import { btnPrimary, btnSecondary, IMPORTANCE_META, inputCls, KIND_LABEL, labelCls, selectCls, textareaCls } from "./ui";
import { useAction } from "./use-action";

export type EventView = {
  id: string;
  number: number;
  title: string;
  kind: string;
  importance: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  timezone: string;
  location: string;
  url: string;
  links: unknown;
  description: string;
  source: string;
  sourceQuote: string;
  status: string;
  createdById: string | null;
  createdAgent: string | null;
  textById: string | null;
  textAgent: string | null;
  attendance: { userId: string; status: string }[];
  _count?: { notes: number; tasks: number };
};

const RSVP = [
  { id: "going", label: "Going" },
  { id: "maybe", label: "Maybe" },
  { id: "no", label: "Can't" },
] as const;

/** Sends the browser's time zone so times are shown where each person is. */
export function TimezoneSync({ current, pinned }: { current: string; pinned: boolean }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && !pinned && tz !== current) syncTimezoneAction(tz);
  }, [current, pinned]);
  return null;
}

export function ImportanceChip({ importance }: { importance: string }) {
  const m = IMPORTANCE_META[importance] ?? IMPORTANCE_META.optional;
  return <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}

function countdown(e: EventView, tz: string) {
  const n = daysUntil(e.startsAt, tz, e.allDay);
  const verb = e.kind === "event" ? "" : e.kind === "deadline" ? "due " : "closes ";
  if (n < 0) return { text: e.kind === "event" ? `${-n} days ago` : `${verb}${-n} days ago`, tone: "past" as const };
  if (n === 0) return { text: `${verb}today`, tone: "now" as const };
  if (n === 1) return { text: `${verb}tomorrow`, tone: "now" as const };
  return { text: `${verb}in ${n} days`, tone: n <= 7 ? ("soon" as const) : ("later" as const) };
}

/** Going / Maybe / Can't for the signed-in user. */
export function RsvpButtons({ event, me }: { event: EventView; me: string }) {
  const { pending, run } = useAction();
  const mine = event.attendance.find((a) => a.userId === me)?.status;
  return (
    <div className="inline-flex rounded-md border border-line-strong overflow-hidden" role="group" aria-label="Will you attend?">
      {RSVP.map((r) => (
        <button
          key={r.id}
          disabled={pending}
          aria-pressed={mine === r.id}
          onClick={() => run(() => setAttendanceAction(String(event.number), mine === r.id ? "unset" : r.id))}
          className={`h-7 px-2.5 text-xs border-l first:border-l-0 border-line-strong ${
            mine === r.id ? (r.id === "no" ? "bg-ink-2 text-canvas" : "bg-ink text-canvas") : "bg-surface text-ink-2 hover:text-ink hover:bg-sunken"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Avatars of who is going (solid), maybe (faded) and, for mandatory events, who hasn't answered. */
export function Attendees({ event, founders }: { event: EventView; founders: Founder[] }) {
  const by = (s: string) => event.attendance.filter((a) => a.status === s).map((a) => founders.find((f) => f.id === a.userId)).filter(Boolean) as Founder[];
  const going = by("going");
  const maybe = by("maybe");
  const unanswered = founders.filter((f) => !event.attendance.some((a) => a.userId === f.id));
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-2">
      {going.map((f) => <Avatar key={f.id} user={f} size={20} />)}
      {maybe.map((f) => <span key={f.id} className="opacity-45"><Avatar user={f} size={20} /></span>)}
      {going.length === 0 && maybe.length === 0 && <span className="text-ink-3">Nobody yet</span>}
      {event.importance === "mandatory" && unanswered.length > 0 && (
        <span className="text-danger">· waiting for {unanswered.map((f) => firstName(f)).join(", ")}</span>
      )}
    </div>
  );
}

/** Join button for the call (filled on the day), then the other links as chips. */
export function EventLinks({ links, today, compact = false }: { links: EventLink[]; today?: boolean; compact?: boolean }) {
  if (!links.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {links.map((l) =>
        isJoinLink(l.url) ? (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1.5 ${compact ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm"} rounded-md font-medium ${
              today ? "bg-accent text-surface hover:opacity-90" : "border border-accent/50 text-accent hover:bg-accent-soft"
            }`}
          >
            <Video className="w-3.5 h-3.5" /> {l.label}
          </a>
        ) : (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            title={l.url}
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 ${compact ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm"} rounded-md border border-line-strong text-ink-2 hover:text-ink hover:bg-sunken max-w-[220px]`}
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{l.label}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function EventRow({ event: e, founders, me, tz }: { event: EventView; founders: Founder[]; me: string; tz: string }) {
  const when = formatWhen(e.startsAt, e.allDay, tz, e.timezone);
  const cd = countdown(e, tz);
  const color = founders.find((f) => f.id === (e.textById ?? e.createdById))?.color;
  return (
    <li className={`flex gap-3 px-4 py-3 ${e.textAgent ? "ai-tint" : "human-mark"} ${e.importance === "mandatory" ? "border-l-danger!" : ""}`} style={{ ["--who" as string]: color }}>
      <div className="w-12 shrink-0 text-center leading-tight pt-0.5">
        {(() => {
          const p = dayParts(e.startsAt, tz, e.allDay);
          return (
            <>
              <div className="text-[11px] uppercase tracking-wide text-ink-3">{p.weekday}</div>
              <div className="text-lg font-semibold tabular">{p.day}.{p.month}</div>
              <div className="text-[11px] text-ink-3 tabular">{p.year}</div>
            </>
          );
        })()}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/timeline/${e.number}`} className="font-medium hover:underline">{e.title}</Link>
          <ImportanceChip importance={e.importance} />
          <span className="text-xs text-ink-3">{KIND_LABEL[e.kind]}</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-ink-2">
          <span>{e.allDay ? "All day" : hm(e.startsAt, tz)}{when.local && <span className="text-ink-3"> · {when.local}</span>}</span>
          <span className={cd.tone === "now" ? "text-danger font-medium" : cd.tone === "soon" ? "text-warn" : "text-ink-3"}>{cd.text}</span>
          {e.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
          {e.createdAgent && <Byline founders={founders} byId={e.createdById} agent={e.createdAgent} size="xs" />}
          {!!e._count?.notes && <span>{e._count.notes} note{e._count.notes === 1 ? "" : "s"}</span>}
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-0.5">
          <Attendees event={e} founders={founders} />
          {e.status === "confirmed" && cd.tone !== "past" && <RsvpButtons event={e} me={me} />}
        </div>
        {cd.tone !== "past" && <EventLinks links={eventLinks(e)} today={cd.tone === "now"} compact />}
      </div>
    </li>
  );
}

/** A proposed event: what Hermes saw, and Confirm / Dismiss. */
export function ProposedEvent({ event: e, founders, tz }: { event: EventView; founders: Founder[]; tz: string }) {
  const { pending, run } = useAction();
  const when = formatWhen(e.startsAt, e.allDay, tz, e.timezone);
  return (
    <li className="px-4 py-3 space-y-1.5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/timeline/${e.number}`} className="font-medium hover:underline">{e.title}</Link>
            <ImportanceChip importance={e.importance} />
            <span className="text-xs text-ink-3">{KIND_LABEL[e.kind]}</span>
          </div>
          <p className="text-sm text-ink-2">{when.main}{when.local && ` · ${when.local}`}{e.location && ` · ${e.location}`}</p>
          <div className="mt-1"><EventLinks links={eventLinks(e)} compact /></div>
        </div>
        <div className="flex gap-1">
          <button disabled={pending} onClick={() => run(() => confirmEventsAction([String(e.number)], true), "Added to the timeline")} className="h-8 px-2.5 rounded-md border border-line-strong text-sm hover:bg-sunken inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Confirm
          </button>
          <button disabled={pending} onClick={() => run(() => confirmEventsAction([String(e.number)], false))} aria-label="Dismiss" title="Dismiss" className="h-8 w-8 rounded-md text-ink-2 hover:bg-sunken inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {(e.source || e.sourceQuote) && (
        <div className="text-xs text-ink-2 border-l-2 border-line-strong pl-2">
          {e.sourceQuote && <p className="italic">“{e.sourceQuote}”</p>}
          <p className="text-ink-3 inline-flex items-center gap-1.5">
            {e.source}
            {e.createdAgent && <Byline founders={founders} byId={e.createdById} agent={e.createdAgent} size="xs" />}
          </p>
        </div>
      )}
    </li>
  );
}

export function ConfirmAllEvents({ refs }: { refs: string[] }) {
  const { pending, run } = useAction();
  if (refs.length < 2) return null;
  return (
    <button disabled={pending} onClick={() => run(() => confirmEventsAction(refs, true), `Added ${refs.length} events`)} className="h-8 px-3 rounded-md bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
      <Check className="w-3.5 h-3.5" /> Confirm all {refs.length}
    </button>
  );
}

function TzSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const options = [...new Set([value, ...COMMON_TZ])];
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${selectCls} w-full`}>
      {options.map((z) => <option key={z} value={z}>{tzCity(z)}{z.includes("/") ? ` (${z.split("/")[0]})` : ""}</option>)}
    </select>
  );
}

type FormState = { title: string; kind: string; importance: string; date: string; time: string; timezone: string; location: string; url: string; description: string; links?: EventLink[] };

function EventFields({ f, set }: { f: FormState; set: (k: keyof FormState) => (e: { target: { value: string } }) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <select value={f.kind} onChange={set("kind")} className={`${selectCls} w-full`}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Importance</label>
          <select value={f.importance} onChange={set("importance")} className={`${selectCls} w-full`}>
            {Object.entries(IMPORTANCE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <DateInput value={f.date} onChange={set("date")} required aria-label="Date" className={`${selectCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Time <span className="text-ink-3 font-normal">(optional)</span></label>
          <TimeInput value={f.time} onChange={set("time")} aria-label="Time" className={`${selectCls} w-full`} />
        </div>
      </div>
      {f.time && (
        <div className="max-w-xs">
          <label className={labelCls}>Time zone where it happens</label>
          <TzSelect value={f.timezone} onChange={(v) => set("timezone")({ target: { value: v } })} />
        </div>
      )}
    </>
  );
}

export function NewEvent({ defaultTz }: { defaultTz: string }) {
  const { pending, run } = useAction();
  const empty: FormState = { title: "", kind: "event", importance: "optional", date: "", time: "", timezone: defaultTz, location: "", url: "", description: "" };
  const [f, setF] = useState(empty);
  const [more, setMore] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createEventAction(f), undefined, (r) => {
          const d = (r as { data?: { number: number; duplicate: boolean } }).data;
          toast.success(d?.duplicate ? `Already on the timeline as E-${d.number}` : "Added to the timeline");
          setF(empty);
          setMore(false);
        });
      }}
      className="space-y-3"
    >
      <input value={f.title} onChange={set("title")} placeholder="Event, deadline or opportunity, e.g. HFE demo day" aria-label="Title" className={inputCls} />
      {f.title && (
        <>
          <EventFields f={f} set={set} />
          {more ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={f.location} onChange={set("location")} placeholder="Place (optional)" aria-label="Place" className={inputCls} />
              <input value={f.url} onChange={set("url")} placeholder="Zoom/Teams or other link (optional)" aria-label="Link" className={inputCls} />
              <textarea value={f.description} onChange={set("description")} rows={2} placeholder="What it is, what to prepare" aria-label="Description" className={`${textareaCls} sm:col-span-2`} />
            </div>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="text-sm text-ink-2 underline">Add place, link or details</button>
          )}
          <div><button disabled={pending || !f.date} className={btnPrimary}>Add to timeline</button></div>
        </>
      )}
    </form>
  );
}

export function EventEditor({ event: e }: { event: EventView }) {
  const { pending, run } = useAction();
  const v = inputValues(e.startsAt, e.allDay, e.timezone);
  const initial: FormState = { title: e.title, kind: e.kind, importance: e.importance, date: v.date, time: v.time, timezone: e.timezone, location: e.location, url: "", description: e.description, links: eventLinks(e) };
  const [f, setF] = useState(initial);
  const [editing, setEditing] = useState(false);
  const set = (k: keyof FormState) => (ev: { target: { value: string } }) => setF((s) => ({ ...s, [k]: ev.target.value }));
  if (!editing) {
    return (
      <div className="space-y-2">
        {e.description ? <Markdown className="text-sm">{e.description}</Markdown> : <p className="text-sm text-ink-3">No details yet.</p>}
        {e.location && <p className="text-sm text-ink-2 inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{e.location}</p>}
        <EventLinks links={eventLinks(e)} today={daysUntil(e.startsAt, e.timezone, e.allDay) === 0} />
        <button onClick={() => setEditing(true)} className={btnSecondary}><Pencil className="w-4 h-4" /> Edit</button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        run(() => updateEventAction(String(e.number), { ...f, url: undefined }), "Saved", () => setEditing(false));
      }}
      className="space-y-3"
    >
      <div>
        <label className={labelCls}>Title</label>
        <input value={f.title} onChange={set("title")} className={inputCls} />
      </div>
      <EventFields f={f} set={set} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Place</label>
          <input value={f.location} onChange={set("location")} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Links</label>
        <LinksField links={f.links ?? []} onChange={(links) => setF((s) => ({ ...s, links }))} />
      </div>
      <div>
        <label className={labelCls}>Details</label>
        <textarea value={f.description} onChange={set("description")} rows={4} className={textareaCls} />
      </div>
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>Save</button>
        <button type="button" onClick={() => { setF(initial); setEditing(false); }} className={btnSecondary}>Cancel</button>
      </div>
    </form>
  );
}

function NoteItem({ note, founders, me }: { note: { id: string; body: string; byId: string | null; agent: string | null }; founders: Founder[]; me: string }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const color = founders.find((f) => f.id === note.byId)?.color;
  return (
    <li className={`px-4 py-3 ${note.agent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: color }}>
      <div className="flex items-center gap-2 mb-1">
        <Byline founders={founders} byId={note.byId} agent={note.agent} size="xs" />
        {note.byId === me && !editing && (
          <button onClick={() => setEditing(true)} aria-label="Edit note" className="ml-auto p-1 rounded text-ink-3 hover:text-ink hover:bg-sunken"><Pencil className="w-3.5 h-3.5" /></button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editEventNoteAction(note.id, body), body.trim() ? "Saved" : "Deleted", () => setEditing(false));
          }}
          className="space-y-2"
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={textareaCls} />
          <div className="flex gap-2">
            <button disabled={pending} className={btnPrimary}>Save</button>
            <button type="button" onClick={() => { setBody(note.body); setEditing(false); }} className={btnSecondary}>Cancel</button>
            <span className="text-xs text-ink-3 self-center">Empty saves as delete.</span>
          </div>
        </form>
      ) : (
        <Markdown className="text-sm">{note.body}</Markdown>
      )}
    </li>
  );
}

/** Each person's notes about the event, after (or before) it. */
export function EventNotes({ eventRef, notes, founders, me, past }: { eventRef: string; notes: { id: string; body: string; byId: string | null; agent: string | null }[]; founders: Founder[]; me: string; past: boolean }) {
  const { pending, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <div>
      <ul className="divide-y divide-line">
        {notes.map((n) => <NoteItem key={n.id} note={n} founders={founders} me={me} />)}
        {notes.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">{past ? "Nobody has written about it yet." : "Notes appear here; write yours after the event."}</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addEventNoteAction(eventRef, body), undefined, () => setBody(""));
        }}
        className="p-3 border-t border-line flex gap-2 items-end"
      >
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={past ? "What did you take away? Who did you meet? Follow-ups?" : "Notes, questions to ask, what to prepare…"} aria-label="Your note" className={textareaCls} />
        <button disabled={pending || !body.trim()} className={btnPrimary}>Add</button>
      </form>
    </div>
  );
}

/** Edit the list of links: name, address, remove; join links get a Join button. */
function LinksField({ links, onChange }: { links: EventLink[]; onChange: (l: EventLink[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-1.5">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          {isJoinLink(l.url) ? <Video className="w-4 h-4 text-accent shrink-0" /> : <Link2 className="w-4 h-4 text-ink-3 shrink-0" />}
          <input value={l.label} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Link name" className={`${selectCls} w-48`} />
          <input value={l.url} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} aria-label="Address" className={`${selectCls} flex-1 min-w-0`} />
          <button type="button" aria-label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))} className="p-1.5 rounded text-ink-3 hover:text-danger hover:bg-sunken"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://…" aria-label="New link" className={`${selectCls} flex-1`} />
        <button type="button" disabled={!draft.trim()} onClick={() => { onChange(cleanLinks([...links, { label: "", url: draft.trim() }])); setDraft(""); }} className={btnSecondary}>Add link</button>
      </div>
    </div>
  );
}
