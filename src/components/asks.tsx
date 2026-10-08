"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlarmClock, Check, HelpCircle, MessageSquare, X } from "lucide-react";
import { answerAskAction, askAction, cancelAskAction, seenAnswersAction, suggestDeadlineAction } from "@/app/actions";
import { parseDeadline } from "@/lib/deadline";
import { DateInput } from "./date-input";
import { Markdown } from "./markdown";
import { AiMark, Avatar, Byline, firstName, type Founder } from "./people";
import { btnPrimary, btnSecondary, btnSmall, dueLabel, relative, textareaCls } from "./ui";
import { useAction } from "./use-action";

export type AskView = {
  id: string;
  number: number;
  question: string;
  fromId: string | null;
  fromAgent: string | null;
  toId: string;
  dueDate: Date | null;
  status: string;
  answerKind: string | null;
  answer: string;
  answeredAt: Date | null;
  draft: string;
  draftAgent: string | null;
  createdAt: Date;
  target?: { href: string; label: string } | null;
};

type Target = "task" | "note" | "decision" | "event";

/** "Ask for input": pick teammates, say what to look at, optionally by when. */
export function AskButton({ entityType, entityId, founders, me, compact = false, startOpen = false, onClose }: { entityType: Target; entityId: string; founders: Founder[]; me: string; compact?: boolean; startOpen?: boolean; onClose?: () => void }) {
  const { pending, run } = useAction();
  const [open, setOpenState] = useState(startOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) onClose?.();
  };
  const [to, setTo] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [due, setDue] = useState("");
  // Where the date came from: read from the question (with the words) or set by hand.
  const [found, setFound] = useState<{ phrase: string; byAI: boolean } | null>(null);
  const manual = useRef(false);
  const others = founders.filter((f) => f.id !== me);

  // Read a deadline out of the question as it is typed: instantly with the built-in
  // reader, then (after a pause) with your AI if the wording is unusual.
  const todayHere = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const onQuestion = (text: string) => {
    setQuestion(text);
    if (manual.current) return;
    const local = parseDeadline(text, todayHere());
    setDue(local?.date ?? "");
    setFound(local ? { phrase: local.phrase, byAI: false } : null);
  };
  useEffect(() => {
    if (manual.current || question.trim().length < 8 || parseDeadline(question, todayHere())) return;
    const timer = setTimeout(async () => {
      const r = await suggestDeadlineAction(question);
      if (!manual.current && r.ok && r.data) {
        const d = r.data as { date: string; phrase: string; byAI: boolean };
        setDue(d.date);
        setFound({ phrase: d.phrase, byAI: d.byAI });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [question]);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={compact ? "p-1.5 rounded text-ink-2 hover:text-ink hover:bg-sunken" : btnSmall} title="Ask a teammate for input" aria-label="Ask for input">
        <HelpCircle className="w-4 h-4" /> {!compact && "Ask for input"}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => askAction({ entityType, entityId, to, question, due: due || null }), to.length > 1 ? `Asked ${to.length} people` : "Asked", () => {
          setOpen(false);
          setTo([]);
          setQuestion("");
          setDue("");
          setFound(null);
          manual.current = false;
        });
      }}
      className="w-full rounded-md border border-line-strong p-3 space-y-2 bg-surface"
    >
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-sm text-ink-2 mr-1">Ask</span>
        {others.map((f) => {
          const on = to.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setTo(on ? to.filter((x) => x !== f.id) : [...to, f.id])}
              className={`h-8 pl-1 pr-2.5 rounded-full border inline-flex items-center gap-1.5 text-sm ${on ? "border-ink bg-ink text-canvas" : "border-line-strong hover:bg-sunken"}`}
            >
              <Avatar user={f} size={22} /> {firstName(f)}
            </button>
          );
        })}
      </div>
      <textarea
        autoFocus
        value={question}
        onChange={(e) => onQuestion(e.target.value)}
        rows={3}
        placeholder="What should they look at? e.g. Can you check the questionnaire wording works for GPs?"
        aria-label="Question"
        className={textareaCls}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2 inline-flex items-center gap-1"><AlarmClock className="w-4 h-4" /> By</span>
        <DateInput
          value={due}
          onChange={(e) => {
            manual.current = true;
            setFound(null);
            setDue(e.target.value);
          }}
          aria-label="Answer by"
          className="h-9 px-2 rounded-md border border-line-strong bg-surface text-sm w-[120px]"
        />
        {found ? (
          <span className="text-xs text-accent inline-flex items-center gap-1">
            {found.byAI && <AiMark />} from “{found.phrase}”
            <button type="button" aria-label="Clear deadline" onClick={() => { manual.current = true; setFound(null); setDue(""); }} className="text-ink-3 hover:text-ink"><X className="w-3 h-3" /></button>
          </span>
        ) : (
          <span className="text-xs text-ink-3">{due ? "" : "(optional; or write it, e.g. “before Friday”)"}</span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>Cancel</button>
        <button disabled={pending || !to.length || !question.trim()} className={btnPrimary}>Send</button>
      </div>
    </form>
  );
}

/** Reply / Looks good / Can't right now, for the person who was asked. */
function AnswerBox({ ask }: { ask: AskView }) {
  const { pending, run } = useAction();
  const [text, setText] = useState(ask.draft);
  return (
    <div className="space-y-2">
      {ask.draft && (
        <p className="text-xs text-ink-2 inline-flex items-center gap-1"><AiMark /> Draft by your {ask.draftAgent ?? "AI"}: check it, change it, then send.</p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Your answer…" aria-label="Your answer" className={textareaCls} />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || !text.trim()} onClick={() => run(() => answerAskAction(ask.id, "reply", text), "Answer sent")} className="h-8 px-3 rounded-md bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
          <MessageSquare className="w-3.5 h-3.5" /> Reply
        </button>
        <button disabled={pending} onClick={() => run(() => answerAskAction(ask.id, "approve", text), "Sent")} className="h-8 px-3 rounded-md border border-line-strong text-sm inline-flex items-center gap-1.5 hover:bg-sunken">
          <Check className="w-3.5 h-3.5" /> Looks good
        </button>
        <button disabled={pending} onClick={() => run(() => answerAskAction(ask.id, "decline", text), "Sent")} className="h-8 px-3 rounded-md text-sm text-ink-2 inline-flex items-center gap-1.5 hover:bg-sunken">
          <X className="w-3.5 h-3.5" /> Can&apos;t right now
        </button>
      </div>
    </div>
  );
}

function Due({ date }: { date: Date | null }) {
  const d = dueLabel(date);
  if (!d) return null;
  return <span className={d.tone === "late" ? "text-danger font-medium" : d.tone === "soon" ? "text-warn" : "text-ink-3"}>{d.text.replace(/^due/, "by")}</span>;
}

/** A request on Home: who asks what about which thing, and the answer box. */
export function AskCard({ ask, founders }: { ask: AskView; founders: Founder[] }) {
  const color = founders.find((f) => f.id === ask.fromId)?.color;
  return (
    <li className="px-4 py-3 space-y-2 human-mark" style={{ ["--who" as string]: color }}>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Byline founders={founders} byId={ask.fromId} agent={ask.fromAgent} size="xs" />
        <span className="text-ink-2">asks you</span>
        {ask.target && <Link href={ask.target.href} className="underline truncate max-w-[320px]">{ask.target.label}</Link>}
        <span className="text-xs ml-auto"><Due date={ask.dueDate} /> <span className="text-ink-3">{relative(ask.createdAt)}</span></span>
      </div>
      <Markdown className="text-sm">{ask.question}</Markdown>
      <AnswerBox ask={ask} />
    </li>
  );
}

/** Answers to what I asked, until I mark them read. */
export function AnsweredList({ asks, founders }: { asks: AskView[]; founders: Founder[] }) {
  const { pending, run } = useAction();
  if (!asks.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <p className="text-sm text-ink-2">Answers to what you asked</p>
        <button disabled={pending} onClick={() => run(() => seenAnswersAction(asks.map((a) => a.id)))} className={btnSmall}>Got it</button>
      </div>
      <ul className="divide-y divide-line">
        {asks.map((a) => (
          <li key={a.id} className="px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <Byline founders={founders} byId={a.toId} agent={null} size="xs" />
              <span className={a.status === "declined" ? "text-ink-3" : a.answerKind === "approve" ? "text-accent font-medium" : "text-ink-2"}>
                {a.status === "declined" ? "can't right now" : a.answerKind === "approve" ? "says it looks good" : "answered"}
              </span>
              {a.target && <Link href={a.target.href} className="underline truncate max-w-[320px]">{a.target.label}</Link>}
            </div>
            <p className="text-xs text-ink-3 truncate">You asked: {a.question}</p>
            {a.answer && <Markdown className="text-sm">{a.answer}</Markdown>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Requests about one thing, shown on its page: who was asked, what they said. */
export function AskThread({ asks, founders, me }: { asks: AskView[]; founders: Founder[]; me: string }) {
  const { pending, run } = useAction();
  if (!asks.length) return null;
  return (
    <ul className="space-y-2">
      {asks.map((a) => {
        const asked = founders.find((f) => f.id === a.toId);
        return (
          <li key={a.id} className={`rounded-md border p-3 space-y-1.5 ${a.status === "open" ? "border-dashed border-line-strong" : "border-line"}`}>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <Byline founders={founders} byId={a.fromId} agent={a.fromAgent} size="xs" />
              <span className="text-ink-2">asked</span>
              <span className="inline-flex items-center gap-1"><Avatar user={asked} size={18} /> {firstName(asked)}</span>
              <span className="text-xs text-ink-3">{relative(a.createdAt)}</span>
              <span className="text-xs ml-auto">
                {a.status === "open" ? <><span className="text-warn">Waiting</span> <Due date={a.dueDate} /></> : a.status === "cancelled" ? <span className="text-ink-3">Withdrawn</span> : a.status === "declined" ? <span className="text-ink-3">Can&apos;t right now</span> : a.answerKind === "approve" ? <span className="text-accent font-medium">Looks good</span> : <span className="text-ink-2">Answered</span>}
              </span>
            </div>
            <Markdown className="text-sm text-ink-2">{a.question}</Markdown>
            {a.answer && a.status !== "open" && (
              <div className="rounded px-2 py-1.5 bg-accent-soft/60 text-sm"><Markdown>{a.answer}</Markdown></div>
            )}
            {a.status === "open" && a.toId === me && <AnswerBox ask={a} />}
            {a.status === "open" && a.fromId === me && (
              <button disabled={pending} onClick={() => run(() => cancelAskAction(a.id), "Withdrawn")} className="text-xs text-ink-3 hover:text-ink underline">Withdraw</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
