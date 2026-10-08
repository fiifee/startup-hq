"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

/**
 * Date and time fields that always read DD.MM.YY and 24-hour HH:MM, whatever
 * language the browser runs in (native pickers follow the browser and show
 * MM/DD/YYYY and AM/PM in an American browser). Values in and out stay
 * ISO ("2026-10-24", "14:00"), so callers and the server are unchanged.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-24" → "24.10.26". */
export function isoToDmy(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : "";
}

/** "24.10.26", "24/10/2026", "24-10", "24.10", "2026-10-24" → "2026-10-24", or null. */
export function dmyToIso(text: string, now = new Date()): string | null {
  const t = text.trim();
  if (!t) return "";
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let d: number, mo: number, y: number;
  if (iso) [y, mo, d] = [+iso[1], +iso[2], +iso[3]];
  else {
    const m = t.match(/^(\d{1,2})[./\-\s](\d{1,2})(?:[./\-\s](\d{2}|\d{4}))?\.?$/);
    if (!m) return null;
    d = +m[1];
    mo = +m[2];
    y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "1400", "14", "14.00", "9:5", "2pm", "2:30 pm" → "14:00"-style, or null. */
export function normalizeTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return "";
  const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm)?$/) ?? t.match(/^(\d{1,2})[:.](\d{1,2})(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

type Common = {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  id?: string;
  name?: string;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function DateInput({ value, onChange, id, name, required, className = "", ...rest }: Common) {
  const [draft, setDraft] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const invalid = draft !== null && dmyToIso(draft) === null;
  const commit = (text: string) => {
    const iso = dmyToIso(text);
    if (iso !== null) {
      onChange({ target: { value: iso } });
      setDraft(null);
    }
  };
  return (
    <span className={`relative inline-flex items-center focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD.MM.YY"
        required={required}
        aria-label={rest["aria-label"]}
        aria-invalid={invalid || undefined}
        value={draft ?? isoToDmy(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const iso = dmyToIso(e.target.value);
          if (iso !== null && /\d{1,2}[./\-\s]\d{1,2}[./\-\s]\d{2,4}$|^\d{4}-/.test(e.target.value.trim())) onChange({ target: { value: iso } });
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
        className={`w-full h-full bg-transparent pr-6 tabular focus:outline-none ${invalid ? "text-danger" : ""}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Pick a date"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className="absolute right-1 p-1 rounded text-ink-3 hover:text-ink"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
      {/* The browser's calendar for picking; its text never shows. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => {
          setDraft(null);
          onChange({ target: { value: e.target.value } });
        }}
        className="absolute right-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      />
      {name && <input type="hidden" name={name} value={value} />}
    </span>
  );
}

export function TimeInput({ value, onChange, id, name, required, className = "", ...rest }: Common) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && normalizeTime(draft) === null;
  const commit = (text: string) => {
    const t = normalizeTime(text);
    if (t !== null) {
      onChange({ target: { value: t } });
      setDraft(null);
    }
  };
  return (
    <span className={`inline-flex items-center focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        required={required}
        aria-label={rest["aria-label"]}
        aria-invalid={invalid || undefined}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          if (/^\d{1,2}[:.]\d{2}$/.test(e.target.value.trim())) {
            const t = normalizeTime(e.target.value);
            if (t) onChange({ target: { value: t } });
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
        className={`w-full h-full bg-transparent tabular focus:outline-none ${invalid ? "text-danger" : ""}`}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </span>
  );
}

/** Uncontrolled date field for plain forms (posts ISO under `name`). */
export function DateField({ name, defaultValue = "", id, className }: { name: string; defaultValue?: string; id?: string; className?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <DateInput id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} className={className} />;
}
