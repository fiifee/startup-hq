/**
 * Who made a change. `agent` null = the founder did it by hand; otherwise the
 * AI that acted for them ("Claude", "ChatGPT", "Gemini", "Hermes", ...).
 */
export type Actor = { userId: string | null; agent: string | null };

export const human = (userId: string): Actor => ({ userId, agent: null });
export const ai = (userId: string | null, agent: string): Actor => ({ userId, agent });

export const isAI = (a: { agent?: string | null }) => !!a.agent;

/** Column values for a row created by this actor, for the given field prefix. */
export function by(actor: Actor, prefix: "created" | "text" | "" = "") {
  if (prefix === "created") return { createdById: actor.userId, createdAgent: actor.agent };
  if (prefix === "text") return { textById: actor.userId, textAgent: actor.agent };
  return { byId: actor.userId, agent: actor.agent };
}

/** Normalise whatever a client calls itself into a short, recognisable label. */
export function agentLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("claude") || s.includes("anthropic")) return "Claude";
  if (s.includes("chatgpt") || s.includes("openai") || s.includes("gpt")) return "ChatGPT";
  if (s.includes("gemini") || s.includes("google")) return "Gemini";
  if (s.includes("hermes")) return "Hermes";
  if (s.includes("cursor")) return "Cursor";
  const trimmed = (raw ?? "").trim().slice(0, 40);
  return trimmed || "AI";
}
