"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { AiMark } from "./people";
import { Markdown } from "./markdown";
import { useShortcut } from "./shortcut";

type Msg = { role: "user" | "assistant"; content: string; actions?: { tool: string; ok: boolean; summary: string }[]; error?: boolean };

const STORE = "hq-assistant";

/**
 * Ask your own AI from any page. It runs on your key, can do anything the MCP
 * tools allow, and everything it changes is marked as your AI's work.
 */
export function Assistant({ hasKey, color, firstName }: { hasKey: boolean; color: string; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const openHint = useShortcut("J");

  const restored = useRef(false);

  // The conversation survives page navigation within the tab; restore it on first open.
  const restore = useCallback(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMsgs(JSON.parse(saved));
    } catch {}
  }, []);
  function toggle(next: boolean) {
    if (next) restore();
    setOpen(next);
  }

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {}
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        restore();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restore]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
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
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => toggle(true)}
          className="fixed z-30 bottom-5 right-5 inline-flex items-center gap-2 h-11 px-4 rounded-full shadow-lg text-sm font-medium text-white cursor-pointer"
          style={{ background: color }}
          title={openHint ? `Ask your AI (${openHint})` : "Ask your AI"}
        >
          <AiMark className="w-4 h-4" /> Ask AI
        </button>
      )}
      {open && (
        <section
          aria-label="AI assistant"
          className="fixed z-40 inset-x-0 bottom-0 md:inset-auto md:bottom-5 md:right-5 md:w-[420px] h-[75dvh] md:h-[600px] md:max-h-[calc(100dvh-40px)] flex flex-col bg-surface border border-line-strong md:rounded-xl rounded-t-xl shadow-2xl"
        >
          <header className="flex items-center gap-2 px-4 h-12 border-b border-line">
            <span style={{ color }}><AiMark className="w-4 h-4" /></span>
            <span className="text-sm font-medium flex-1">{firstName}&apos;s AI</span>
            {msgs.length > 0 && (
              <button onClick={() => setMsgs([])} className="text-xs text-ink-2 hover:text-ink px-2 h-7 rounded hover:bg-sunken">Clear</button>
            )}
            <button aria-label="Close" onClick={() => toggle(false)} className="p-1.5 rounded-md hover:bg-sunken"><X className="w-4 h-4" /></button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {!hasKey && (
              <p className="text-ink-2">
                The assistant runs on your own API key, so it never uses anyone else&apos;s credits.{" "}
                <Link href="/settings#ai-keys" className="text-accent underline" onClick={() => setOpen(false)}>Add a key in Settings</Link>.
                You can also connect Claude, ChatGPT or Gemini directly; see Settings → Connect your AI.
              </p>
            )}
            {hasKey && msgs.length === 0 && (
              <div className="text-ink-2 space-y-2">
                <p>Ask anything about the startup, or tell it what to do. Try:</p>
                {["What's overdue and who owns it?", "Create a task for me to call the bank on Friday", "Summarise the last meeting and propose action items", "What did we decide about pricing?"].map((s) => (
                  <button key={s} onClick={() => setInput(s)} className="block w-full text-left px-3 py-2 rounded-md border border-line hover:bg-sunken text-ink">{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 px-3 py-2 rounded-lg bg-sunken whitespace-pre-wrap">{m.content}</div>
              ) : (
                <div key={i} className="mr-4 space-y-1.5">
                  {m.actions?.map((a, j) => (
                    <div key={j} className={`text-xs ${a.ok ? "text-ink-2" : "text-danger"}`}>
                      {a.ok ? "✓" : "✕"} {a.tool}{!a.ok && `: ${a.summary}`}
                    </div>
                  ))}
                  <div className={`px-3 py-2 rounded-lg ai-tint ${m.error ? "text-danger" : ""}`} style={{ ["--who" as string]: color }}>
                    <Markdown>{m.content}</Markdown>
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 text-ink-2"><Loader2 className="w-4 h-4 animate-spin" /> Working…</div>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-3 border-t border-line flex gap-2 items-end"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              disabled={!hasKey}
              placeholder={hasKey ? "Message your AI…" : "Add a key in Settings first"}
              className="flex-1 resize-none px-3 py-2 rounded-md border border-line-strong bg-surface text-sm focus:outline-none focus:border-accent"
              autoFocus
            />
            <button type="submit" disabled={!hasKey || busy || !input.trim()} aria-label="Send" className="h-10 w-10 inline-flex items-center justify-center rounded-md bg-ink text-canvas disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
