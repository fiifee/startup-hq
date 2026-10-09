"use client";

import { useRef, useState } from "react";
import { matchUsers, mentionHandle, shortName } from "@/lib/names";
import { Avatar, type Founder } from "./people";

/**
 * A textarea that suggests teammates after "@": type "@a", pick Anna with
 * Enter, Tab or a click, and "@Anna " is filled in.
 */
export function MentionTextarea({
  value,
  onChange,
  founders,
  me,
  className = "",
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
  founders: Founder[];
  me?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const others = founders.filter((f) => f.id !== me);
  // While typing, one letter is enough to narrow the list ("@l" → Liis).
  const options = query ? (query.text ? matchUsers(query.text, others, 1) : others).slice(0, 6) : [];

  /** Find an "@word" right before the caret. */
  function detect(text: string, caret: number) {
    const m = text.slice(0, caret).match(/(^|[\s(])@([\p{L}0-9._-]*)$/u);
    setQuery(m ? { text: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  }

  function pick(f: Founder) {
    if (!query || !ref.current) return;
    const caret = ref.current.selectionStart;
    const handle = `@${mentionHandle(f, founders)} `;
    const next = value.slice(0, query.start) + handle + value.slice(caret);
    onChange(next);
    setQuery(null);
    const pos = query.start + handle.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative w-full">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[active]); return; }
            if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
          }
          rest.onKeyDown?.(e);
        }}
        onBlur={(e) => {
          setTimeout(() => setQuery(null), 150);
          rest.onBlur?.(e);
        }}
        className={className}
      />
      {options.length > 0 && (
        <ul role="listbox" aria-label="Mention a teammate" className="absolute z-20 left-2 top-full mt-1 min-w-48 rounded-md border border-line-strong bg-surface shadow-lg py-1">
          {options.map((f, i) => (
            <li key={f.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(f); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left ${i === active ? "bg-sunken" : ""}`}
              >
                <Avatar user={f} size={20} /> {shortName(f, founders)}
                <span className="text-xs text-ink-3 ml-auto">{f.name?.split(" ").slice(1).join(" ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
