/** Shared class strings and formatting. No "use client": server pages import this. */

export const inputCls =
  "w-full h-10 px-3 rounded-md border border-line-strong bg-surface text-ink text-[15px] placeholder:text-ink-3 hover:border-ink-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-sunken disabled:text-ink-3 transition-colors";
export const textareaCls =
  "w-full px-3 py-2 rounded-md border border-line-strong bg-surface text-ink text-[15px] leading-relaxed placeholder:text-ink-3 hover:border-ink-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors";
export const selectCls =
  "h-10 px-2.5 rounded-md border border-line-strong bg-surface text-ink text-sm hover:border-ink-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";
export const labelCls = "block text-sm font-medium text-ink mb-1.5";
export const hintCls = "mt-1.5 text-sm text-ink-2";

const btnBase =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
export const btnPrimary = `${btnBase} bg-ink text-canvas hover:bg-ink/85`;
export const btnSecondary = `${btnBase} border border-line-strong bg-surface text-ink hover:bg-sunken`;
export const btnGhost = `${btnBase} text-ink-2 hover:text-ink hover:bg-sunken`;
export const btnDanger = `${btnBase} border border-danger/40 bg-surface text-danger hover:bg-danger-soft`;
export const btnSmall = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm text-ink-2 hover:text-ink hover:bg-sunken cursor-pointer disabled:opacity-50";

export const cardCls = "rounded-lg border border-line bg-surface";
export const h1Cls = "text-2xl font-semibold tracking-tight";
export const h2Cls = "text-base font-semibold";

/** Founder colours. #1d5fa8 is Santorini blue, the blue of the Cycladic domes. */
export const FOUNDER_COLORS = ["#2c6e52", "#1d5fa8", "#4a6fa5", "#b5562b", "#8a4fa3", "#b3264f", "#3f8580", "#8a6d00"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "04.10.26" (or "04.10" without the year): day first, as the team writes dates. */
export function formatDate(date: Date | string | null | undefined, withYear = true): string {
  if (!date) return "";
  const d = new Date(date);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}${withYear ? `.${String(d.getFullYear()).slice(2)}` : ""}`;
}

/** "04.10.26 14:05", 24-hour clock. */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function relative(date: Date | string): string {
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(date);
}

/** Due-date wording relative to today. */
export function dueLabel(date: Date | string | null): { text: string; tone: "late" | "soon" | "normal" } | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "due yesterday" : `${-days} days late`, tone: "late" };
  if (days === 0) return { text: "due today", tone: "soon" };
  if (days === 1) return { text: "due tomorrow", tone: "soon" };
  if (days < 7) return { text: `due ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}`, tone: "normal" };
  return { text: `due ${formatDate(d, d.getFullYear() !== today.getFullYear())}`, tone: "normal" };
}

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "border-dashed border-line-strong text-ink-2 bg-transparent" },
  todo: { label: "To do", cls: "border-line text-ink-2 bg-sunken" },
  doing: { label: "Doing", cls: "border-[#cdd9ea] text-[#2a4a73] bg-[#e7edf6] dark:bg-[#1c2532] dark:text-[#a9c2e6] dark:border-[#2d3c52]" },
  blocked: { label: "Blocked", cls: "border-[#efcbc6] text-danger bg-danger-soft dark:border-[#55302b]" },
  done: { label: "Done", cls: "border-[#c3dccd] text-accent bg-accent-soft dark:border-[#2c4a3a]" },
  dropped: { label: "Dropped", cls: "border-line text-ink-3 bg-transparent line-through" },
};

export const HORIZON_META: Record<string, { label: string; hint: string }> = {
  now: { label: "Now", hint: "What we are working towards this month" },
  next: { label: "Next", hint: "Lined up after the current goals" },
  later: { label: "Later", hint: "Ideas and bigger bets" },
};

export const KIND_LABEL: Record<string, string> = { event: "Event", deadline: "Deadline", opportunity: "Opportunity" };
export const IMPORTANCE_META: Record<string, { label: string; cls: string }> = {
  mandatory: { label: "Mandatory", cls: "bg-danger-soft text-danger border-[#efcbc6] dark:border-[#55302b]" },
  recommended: { label: "Recommended", cls: "bg-warn-soft text-warn border-[#ead6a8] dark:border-[#4d3c1a]" },
  optional: { label: "Optional", cls: "bg-sunken text-ink-2 border-line" },
};

export const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "text-ink-3" },
  normal: { label: "Normal", cls: "text-ink-2" },
  high: { label: "High", cls: "text-warn font-medium" },
  urgent: { label: "Urgent", cls: "text-danger font-semibold" },
};
