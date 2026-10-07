/**
 * Attribution, shown the same way everywhere: a person is their colour dot and
 * name; an AI is a tinted chip "✦ Raiko's Claude" in that founder's colour.
 */
import type { CSSProperties } from "react";

export type Founder = { id: string; name: string | null; email: string; color: string; image?: string | null };

export function firstName(u: Founder | undefined | null) {
  if (!u) return "Someone";
  return u.name?.split(" ")[0] ?? u.email.split("@")[0];
}

export function colorOf(founders: Founder[], id: string | null | undefined) {
  return founders.find((f) => f.id === id)?.color ?? "#7b776f";
}

export function whoStyle(founders: Founder[], id: string | null | undefined): CSSProperties {
  return { ["--who" as string]: colorOf(founders, id) };
}

export function Avatar({ user, size = 22 }: { user: Founder | null | undefined; size?: number }) {
  const color = user?.color ?? "#7b776f";
  const initial = firstName(user).slice(0, 1).toUpperCase();
  return (
    <span
      title={user ? (user.name ?? user.email) : "Unassigned"}
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none"
      style={{ width: size, height: size, background: user ? color : "transparent", fontSize: size * 0.48, border: user ? undefined : "1.5px dashed var(--line-strong)" }}
    >
      {user ? initial : ""}
    </span>
  );
}

export function AiMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`w-3 h-3 shrink-0 ${className}`} fill="currentColor">
      <path d="M8 0c.3 3.9 2.1 5.7 6 6-3.9.3-5.7 2.1-6 6-.3-3.9-2.1-5.7-6-6 3.9-.3 5.7-2.1 6-6Zm5 10c.15 1.9 1 2.85 3 3-2 .15-2.85 1.1-3 3-.15-1.9-1-2.85-3-3 2-.15 2.85-1.1 3-3Z" />
    </svg>
  );
}

/** "Raiko" or "✦ Raiko's Claude". */
export function Byline({ founders, byId, agent, size = "sm" }: { founders: Founder[]; byId: string | null; agent: string | null; size?: "sm" | "xs" }) {
  const user = founders.find((f) => f.id === byId);
  const color = user?.color ?? "#7b776f";
  const text = size === "xs" ? "text-xs" : "text-sm";
  if (!agent) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${text} text-ink-2`}>
        <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: color }} />
        {firstName(user)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 ${text} font-medium px-1.5 rounded`}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      title={`Written by ${user ? firstName(user) + "'s " : ""}${agent} (AI)`}
    >
      <AiMark />
      {user ? `${firstName(user)}'s ${agent}` : agent}
    </span>
  );
}
