import type { Actor } from "../actor";
import { db } from "../db";

export async function listFounders() {
  return db.user.findMany({ orderBy: { createdAt: "asc" } });
}

/** Resolve "me", an email, a name or an id to a founder. Throws with the options if ambiguous. */
export async function resolveUser(ref: string | null | undefined, actor: Actor): Promise<string | null> {
  if (ref === undefined || ref === null || ref === "") return null;
  const r = ref.trim().toLowerCase();
  if (r === "me" || r === "myself") {
    if (!actor.userId) throw new Error("'me' has no meaning for this caller");
    return actor.userId;
  }
  if (r === "none" || r === "nobody" || r === "unassigned") return null;
  const users = await listFounders();
  const exact = users.find((u) => u.id === ref || u.email === r || u.name?.toLowerCase() === r);
  if (exact) return exact.id;
  const partial = users.filter((u) => u.name?.toLowerCase().split(/\s+/).some((p) => p.startsWith(r)) || u.email.startsWith(r));
  if (partial.length === 1) return partial[0].id;
  const options = users.map((u) => `${u.name ?? u.email} <${u.email}>`).join(", ");
  throw new Error(`Unknown founder "${ref}". Use one of: ${options}, or "me".`);
}

/** "Raiko" / "Raiko's Claude" for a stored actor. */
export function actorName(users: { id: string; name: string | null; email: string }[], byId: string | null, agent: string | null) {
  const u = users.find((x) => x.id === byId);
  const person = u ? (u.name?.split(" ")[0] ?? u.email.split("@")[0]) : null;
  if (!agent) return person ?? "Someone";
  return person ? `${person}'s ${agent}` : agent;
}
