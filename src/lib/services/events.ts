import type { Prisma } from "@prisma/client";
import { by, isAI, type Actor } from "../actor";
import { db } from "../db";
import { logActivity } from "./activity";
import { cleanLinks, type EventLink } from "../links";
import { DEFAULT_TZ, isValidTz } from "../time";
import { asksFromMentions } from "./asks";
import { resolveUser } from "./people";

export const EVENT_KINDS = ["event", "deadline", "opportunity"] as const;
export const IMPORTANCE = ["mandatory", "recommended", "optional"] as const;
export const ATTENDANCE = ["going", "maybe", "no"] as const;

const include = {
  attendance: true,
  _count: { select: { notes: true, tasks: true } },
} satisfies Prisma.EventInclude;

/** Accepts 4, "4", "E-4", "#4" or an event id. */
export async function findEvent(ref: string | number) {
  const s = String(ref).trim();
  const num = s.match(/^(?:e-?|#)?(\d+)$/i);
  const e = num
    ? await db.event.findUnique({ where: { number: Number(num[1]) }, include })
    : await db.event.findUnique({ where: { id: s }, include });
  if (!e) throw new Error(`Event ${s} not found`);
  return e;
}

export async function listEvents(f: { from?: Date; to?: Date; status?: string[]; kind?: string; importance?: string; limit?: number } = {}) {
  const where: Prisma.EventWhereInput = { status: { in: f.status ?? ["confirmed"] } };
  if (f.from || f.to) where.startsAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.kind) where.kind = f.kind;
  if (f.importance) where.importance = f.importance;
  return db.event.findMany({ where, include, orderBy: { startsAt: "asc" }, take: Math.min(f.limit ?? 200, 500) });
}

export async function getEventDetail(ref: string | number) {
  const e = await findEvent(ref);
  const [notes, tasks] = await Promise.all([
    db.eventNote.findMany({ where: { eventId: e.id }, orderBy: { createdAt: "asc" } }),
    db.task.findMany({ where: { eventId: e.id }, orderBy: { number: "asc" } }),
  ]);
  return { ...e, notes, tasks };
}

function check(value: string | undefined, allowed: readonly string[], name: string) {
  if (value !== undefined && !allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/**
 * An existing event on the same day with a similar title. Chats repeat the same
 * announcement, so a second mention should not become a second event.
 */
export async function findDuplicate(title: string, startsAt: Date) {
  const day = new Date(startsAt);
  day.setUTCHours(0, 0, 0, 0);
  const next = new Date(day.getTime() + 86_400_000);
  const sameDay = await db.event.findMany({ where: { startsAt: { gte: new Date(day.getTime() - 86_400_000), lt: new Date(next.getTime() + 86_400_000) } } });
  const a = words(title);
  return (
    sameDay.find((e) => {
      const b = words(e.title);
      const overlap = [...a].filter((w) => b.has(w)).length;
      return overlap / Math.max(1, Math.min(a.size, b.size)) >= 0.6;
    }) ?? null
  );
}

export type EventInput = {
  title: string;
  kind?: string;
  importance?: string;
  startsAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  timezone?: string;
  location?: string;
  url?: string;
  links?: { label?: string | null; url: string }[];
  description?: string;
  source?: string;
  sourceQuote?: string;
  proposed?: boolean;
};

/** Add an event. With `proposed`, it waits on Home for someone to confirm. Duplicates are returned, not re-added. */
export async function createEvent(actor: Actor, input: EventInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (Number.isNaN(input.startsAt.getTime())) throw new Error("A valid date is required");
  check(input.kind, EVENT_KINDS, "kind");
  check(input.importance, IMPORTANCE, "importance");
  if (input.timezone && !isValidTz(input.timezone)) throw new Error(`Unknown time zone ${input.timezone}`);
  const dup = await findDuplicate(title, input.startsAt);
  if (dup && dup.status !== "dismissed") return { event: dup, duplicate: true };
  return db.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        title: title.slice(0, 300),
        kind: input.kind ?? "event",
        importance: input.importance ?? "optional",
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        allDay: input.allDay ?? false,
        timezone: input.timezone ?? DEFAULT_TZ,
        location: input.location?.trim() ?? "",
        url: "",
        links: cleanLinks([...(input.links ?? []), ...(input.url?.trim() ? [{ url: input.url.trim() }] : [])]) as EventLink[],
        description: input.description?.trim() ?? "",
        source: input.source?.trim() ?? "",
        sourceQuote: input.sourceQuote?.trim().slice(0, 500) ?? "",
        status: input.proposed ? "proposed" : "confirmed",
        ...by(actor, "created"),
        ...by(actor, "text"),
      },
    });
    await logActivity(tx, actor, "event", e.id, "created", `${input.proposed ? "Proposed" : "Added"} E-${e.number} "${e.title}"`);
    return { event: e, duplicate: false };
  });
}

export type EventPatch = Partial<Omit<EventInput, "proposed">> & { status?: string };

/** Edit or confirm/dismiss. AI rewording a person's title/description becomes a suggestion. */
export async function updateEvent(actor: Actor, ref: string | number, patch: EventPatch, reason = "") {
  const current = await findEvent(ref);
  check(patch.kind, EVENT_KINDS, "kind");
  check(patch.importance, IMPORTANCE, "importance");
  check(patch.status, ["proposed", "confirmed", "dismissed"], "status");
  if (patch.timezone && !isValidTz(patch.timezone)) throw new Error(`Unknown time zone ${patch.timezone}`);
  const text: { title?: string; description?: string } = {};
  if (patch.title?.trim() && patch.title.trim() !== current.title) text.title = patch.title.trim().slice(0, 300);
  if (patch.description !== undefined && patch.description.trim() !== current.description) text.description = patch.description.trim();
  const protectedText = isAI(actor) && !current.textAgent && Object.keys(text).length > 0;

  const data: Prisma.EventUncheckedUpdateInput = {};
  if (!protectedText && Object.keys(text).length) Object.assign(data, text, by(actor, "text"));
  for (const k of ["kind", "importance", "status", "location", "allDay", "timezone"] as const) {
    if (patch[k] !== undefined && patch[k] !== current[k]) (data as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.startsAt && +patch.startsAt !== +current.startsAt) data.startsAt = patch.startsAt;
  if (patch.links !== undefined) {
    data.links = cleanLinks(patch.links) as EventLink[];
    data.url = "";
  }
  if (patch.endsAt !== undefined && +(patch.endsAt ?? 0) !== +(current.endsAt ?? 0)) data.endsAt = patch.endsAt;

  return db.$transaction(async (tx) => {
    let suggestionId: string | null = null;
    if (protectedText) {
      const s = await tx.suggestion.create({ data: { entityType: "event", entityId: current.id, proposed: text, reason, ...by(actor) } });
      suggestionId = s.id;
      await logActivity(tx, actor, "suggestion", s.id, "created", `Suggested new wording for E-${current.number}`);
    }
    let event = current;
    if (Object.keys(data).length) {
      const { attendance: _a, _count: _c, ...before } = current;
      void _a; void _c;
      event = await tx.event.update({ where: { id: current.id }, data, include });
      const what =
        data.status === "confirmed" ? "Confirmed" : data.status === "dismissed" ? "Dismissed" : "Updated";
      await logActivity(tx, actor, "event", event.id, "updated", `${what} E-${event.number} "${event.title}"`, before);
    }
    return { event, suggestionId };
  });
}

/**
 * Say who is going. People set their own; an AI may set its own user's answer
 * (or anyone's when that user asked it to, by naming them).
 */
export async function setAttendance(actor: Actor, ref: string | number, status: string, who: string = "me") {
  check(status, [...ATTENDANCE, "unset"], "status");
  const e = await findEvent(ref);
  const userId = await resolveUser(who, actor);
  if (!userId) throw new Error("Say whose attendance this is");
  if (!isAI(actor) && userId !== actor.userId) throw new Error("You can only answer for yourself");
  await db.$transaction(async (tx) => {
    if (status === "unset") await tx.eventAttendance.deleteMany({ where: { eventId: e.id, userId } });
    else {
      await tx.eventAttendance.upsert({
        where: { eventId_userId: { eventId: e.id, userId } },
        update: { status, byAgent: actor.agent },
        create: { eventId: e.id, userId, status, byAgent: actor.agent },
      });
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    const label = { going: "is going to", maybe: "might go to", no: "can't go to", unset: "cleared their answer for" }[status];
    await logActivity(tx, actor, "event", e.id, "attendance", `${user?.name?.split(" ")[0] ?? user?.email} ${label} E-${e.number} "${e.title}"`);
  });
}

export async function addEventNote(actor: Actor, ref: string | number, body: string) {
  const e = await findEvent(ref);
  const text = body.trim();
  if (!text) throw new Error("Note is empty");
  const n = await db.$transaction(async (tx) => {
    const n = await tx.eventNote.create({ data: { eventId: e.id, body: text, ...by(actor) } });
    await logActivity(tx, actor, "event", e.id, "noted", `Wrote about E-${e.number}: ${text.slice(0, 80)}`);
    return n;
  });
  await asksFromMentions(actor, "event", e.id, text);
  return n;
}

/** Anyone may fix a note an AI wrote; a person's own note is theirs alone. Empty text deletes it. */
export async function editEventNote(actor: Actor, noteId: string, body: string) {
  const n = await db.eventNote.findUniqueOrThrow({ where: { id: noteId } });
  if (isAI(actor)) throw new Error("AI cannot change notes");
  if (!n.agent && n.byId !== actor.userId) throw new Error("Only the person who wrote this note can change it");
  const text = body.trim();
  return db.$transaction(async (tx) => {
    if (!text) {
      await tx.eventNote.delete({ where: { id: noteId } });
      return null;
    }
    const updated = await tx.eventNote.update({ where: { id: noteId }, data: { body: text, editedById: actor.userId, editedAt: new Date() } });
    await logActivity(tx, actor, "event", n.eventId, "noted", `Edited a note: ${text.slice(0, 80)}`);
    return updated;
  });
}
