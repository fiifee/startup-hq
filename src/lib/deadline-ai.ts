import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "./db";
import { hintsAtDeadline, parseDeadline, type Deadline } from "./deadline";
import { modelFor } from "./llm";
import { ymd } from "./time";

/**
 * Find the deadline in a request: the built-in reader first (instant, free), then
 * the writer's own AI for wording it can't read ("before the board meeting next
 * Thursday"). Returns the calendar date and the words it came from.
 */
export async function suggestDeadline(userId: string, tz: string, text: string): Promise<(Deadline & { byAI: boolean }) | null> {
  const today = ymd(new Date(), tz);
  const local = parseDeadline(text, today);
  if (local) return { ...local, byAI: false };
  if (!hintsAtDeadline(text)) return null;
  const m = await modelFor(userId);
  if (!m) return null;
  try {
    const { output } = await generateText({
      model: m.model,
      output: Output.object({
        schema: z.object({
          date: z.string().nullable().describe("YYYY-MM-DD by which the answer is needed, or null if the text sets no deadline"),
          phrase: z.string().nullable().describe("The exact words that give the deadline"),
        }),
      }),
      system: `Find the deadline in a short request between teammates, in any language. Today is ${today} (${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(new Date())}). "By/before Friday" means the coming Friday. Return null when no deadline is stated; never guess one.`,
      prompt: text.slice(0, 2000),
    });
    if (!output.date || !/^\d{4}-\d{2}-\d{2}$/.test(output.date) || output.date < today) return null;
    return { date: output.date, phrase: output.phrase ?? "", byAI: true };
  } catch {
    return null;
  }
}

/**
 * After someone @mentions teammates, give the new requests a deadline when the
 * built-in reader found none and the wording hints at one. Runs after the response.
 */
export async function fillMissingDeadlines(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const recent = await db.ask.findMany({
    where: { fromId: userId, fromAgent: null, dueDate: null, status: "open", createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
  });
  const byQuestion = new Map<string, typeof recent>();
  for (const a of recent) byQuestion.set(a.question, [...(byQuestion.get(a.question) ?? []), a]);
  for (const [question, asks] of byQuestion) {
    const d = await suggestDeadline(userId, user?.timezone ?? "Europe/Tallinn", question);
    if (d) await db.ask.updateMany({ where: { id: { in: asks.map((a) => a.id) }, dueDate: null }, data: { dueDate: new Date(`${d.date}T00:00:00Z`) } });
  }
}
