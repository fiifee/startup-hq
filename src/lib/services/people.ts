import type { Actor } from "../actor";
import { matchUsers, shortName } from "../names";
import { db } from "../db";

/** A user's time zone (Tallinn when unknown or for the system). */
export async function userTz(userId: string | null) {
  if (!userId) return "Europe/Tallinn";
  const u = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return u?.timezone ?? "Europe/Tallinn";
}

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
  const byId = users.find((u) => u.id === ref);
  if (byId) return byId.id;
  // First names are enough: "Anna", "ann", "mark", "@Liis".
  const found = matchUsers(r, users);
  if (found.length === 1) return found[0].id;
  const options = users.map((u) => `${shortName(u, users)} <${u.email}>`).join(", ");
  if (found.length > 1) throw new Error(`"${ref}" could be ${found.map((u) => shortName(u, users)).join(" or ")}. Use one of: ${options}.`);
  throw new Error(`Unknown user "${ref}". Use one of: ${options}, or "me".`);
}

/** "Raiko" / "Raiko's Claude" for a stored actor. */
export function actorName(users: { id: string; name: string | null; email: string }[], byId: string | null, agent: string | null) {
  const u = users.find((x) => x.id === byId);
  const person = u ? shortName(u, users) : null;
  if (!agent) return person ?? "Someone";
  return person ? `${person}'s ${agent}` : agent;
}
