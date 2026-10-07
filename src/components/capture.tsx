"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckSquare, FileText, Loader2, Search, X } from "lucide-react";
import { captureAction } from "@/app/actions";
import { looksLikeTranscript } from "@/lib/capture";
import { Markdown } from "./markdown";
import { AiMark } from "./people";
import { useShortcut } from "./shortcut";

const OPEN_EVENT = "hq:capture";
const STORE = "hq-assistant";

/** Open the capture box from anywhere. */
export function openCapture() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Msg = { role: "user" | "assistant"; content: string; actions?: { tool: string; ok: boolean; summary: string }[]; error?: boolean };
type ActionId = "ai" | "task" | "note" | "meeting" | "search";

/**
 * One box for everything: type a task, paste a transcript, jot a note, search, or
 * ask your AI. It picks the likely action; you can choose another. With an AI key
 * the default is to let your AI decide, and the conversation continues here.
 */
export function Capture({ hasKey, autoAI, color, firstName }: { hasKey: boolean; autoAI: boolean; color: string; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const restored = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  const hint = useShortcut("K");
  const enterHint = useShortcut("Enter");

  const show = useCallback(() => {
    if (!restored.current) {
      restored.current = true;
      try {
        const saved = sessionStorage.getItem(STORE);
        if (saved) setMsgs(JSON.parse(saved));
      } catch {}
    }
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (k === "k" || k === "j")) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [show]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {}
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const value = text.trim();
  const transcript = looksLikeTranscript(value);
  const singleLine = !value.includes("\n");
  const fallback: ActionId = transcript ? "meeting" : hasKey ? "ai" : "task";

  const options: { id: ActionId; label: string; icon: React.ReactNode }[] = [
    ...(hasKey ? [{ id: "ai" as const, label: msgs.length ? "Send to my AI" : "Let my AI handle it", icon: <AiMark className="w-4 h-4" /> }] : []),
    { id: "task", label: "Add as my task", icon: <CheckSquare className="w-4 h-4" /> },
    { id: "meeting", label: autoAI && hasKey ? "Add as meeting transcript, summarised by my AI" : "Add as meeting transcript", icon: <CalendarDays className="w-4 h-4" /> },
    { id: "note", label: "Save as a note", icon: <FileText className="w-4 h-4" /> },
    ...(singleLine ? [{ id: "search" as const, label: `Search for “${value.slice(0, 40)}”`, icon: <Search className="w-4 h-4" /> }] : []),
  ];
  const ordered = [...options].sort((a, b) => Number(b.id === fallback) - Number(a.id === fallback));

  async function ask(content: string) {
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), page: path }),
      });
      const data = await res.json();
      if (!res.ok) setMsgs([...next, { role: "assistant", content: data.error ?? "Something went wrong.", error: true, actions: data.actions }]);
      else {
        setMsgs([...next, { role: "assistant", content: data.text || "Done.", actions: data.actions }]);
        if (data.actions?.length) router.refresh();
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "Network error. Try again.", error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  async function run(id: ActionId) {
    if (!value || busy) return;
    if (id === "ai") return ask(value);
    if (id === "search") {
      setOpen(false);
      setText("");
      router.push(`/search?q=${encodeURIComponent(value)}`);
      return;
    }
    setBusy(true);
    const r = await captureAction(id, value);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const { href, label } = r.data as { href: string; label: string };
    setText("");
    if (id === "task") {
      toast.success(`Added ${label}`, { action: { label: "Open", onClick: () => router.push(href) } });
      router.refresh();
      return;
    }
    setOpen(false);
    toast.success(id === "meeting" ? (autoAI && hasKey ? "Meeting added. Your AI is summarising it." : "Meeting added") : "Note saved");
    router.push(href);
  }

  return (
    <>
      {!open && (
        <button
          onClick={show}
          className="fixed z-30 bottom-5 right-5 inline-flex items-center gap-2 h-11 px-4 rounded-full shadow-lg text-sm font-medium text-white cursor-pointer"
          style={{ background: color }}
          title={hint ? `Capture or ask (${hint})` : "Capture or ask"}
        >
          <AiMark className="w-4 h-4" /> Capture
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-start justify-center md:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Capture">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full md:max-w-2xl max-h-[85dvh] flex flex-col bg-surface border border-line-strong rounded-t-xl md:rounded-xl shadow-2xl">
            {msgs.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-3 text-sm border-b border-line">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <span style={{ color }}><AiMark /></span> {firstName}&apos;s AI
                  <button onClick={() => setMsgs([])} className="ml-auto hover:text-ink">Clear conversation</button>
                </div>
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ml-10 px-3 py-2 rounded-lg bg-sunken whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div key={i} className="mr-6 space-y-1.5">
                      {m.actions?.map((a, j) => (
                        <div key={j} className={`text-xs ${a.ok ? "text-ink-2" : "text-danger"}`}>{a.ok ? "✓" : "✕"} {a.tool}{!a.ok && `: ${a.summary}`}</div>
                      ))}
                      <div className={`px-3 py-2 rounded-lg ai-tint ${m.error ? "text-danger" : ""}`} style={{ ["--who" as string]: color }}>
                        <Markdown>{m.content}</Markdown>
                      </div>
                    </div>
                  ),
                )}
                {busy && <div className="flex items-center gap-2 text-ink-2"><Loader2 className="w-4 h-4 animate-spin" /> Working…</div>}
                <div ref={end} />
              </div>
            )}
            <div className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                    if (e.key === "Enter" && ((e.metaKey || e.ctrlKey) || (!e.shiftKey && !text.includes("\n")))) {
                      e.preventDefault();
                      run(fallback);
                    }
                  }}
                  rows={value.length > 200 || !singleLine ? 6 : 2}
                  placeholder={msgs.length ? "Reply…" : "A task, a note, a pasted transcript, or a question…"}
                  aria-label="Capture"
                  className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed placeholder:text-ink-3 focus:outline-none focus-visible:outline-none px-1 py-1"
                />
                <button aria-label="Close" onClick={() => setOpen(false)} className="p-1.5 rounded-md text-ink-3 hover:text-ink hover:bg-sunken"><X className="w-4 h-4" /></button>
              </div>
              {value ? (
                <div className="flex flex-wrap gap-1.5">
                  {ordered.map((o, i) => (
                    <button
                      key={o.id}
                      disabled={busy}
                      onClick={() => run(o.id)}
                      className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 disabled:opacity-50 ${
                        i === 0 ? "bg-ink text-canvas font-medium" : "border border-line-strong text-ink-2 hover:text-ink hover:bg-sunken"
                      }`}
                    >
                      {busy && i === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : o.icon}
                      {o.label}
                      {i === 0 && enterHint && <kbd className="ml-1 text-xs opacity-70 font-sans">{singleLine ? "Enter" : enterHint}</kbd>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-3 px-1">
                  {hasKey
                    ? "Your AI can create tasks, update the brief, answer questions and more."
                    : <>Without an AI key this adds tasks, notes and meetings. <Link href="/settings#ai-keys" className="underline" onClick={() => setOpen(false)}>Add a key</Link> to let your AI handle it.</>}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
