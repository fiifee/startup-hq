import { generateText, Output } from "ai";
import { z } from "zod";
import { ai } from "./actor";
import { modelFor, type Provider } from "./llm";
import { formatInstruction, getMeetingFormat } from "./services/format";
import { getMeeting, saveMeetingOutcome } from "./services/meetings";
import { actorName, listFounders } from "./services/people";

const outcomeSchema = z.object({
  summary: z.string().describe("Markdown in the team's summary format (see instructions), bullet points over prose."),
  decisions: z.array(z.object({ title: z.string(), rationale: z.string() })).describe("Only things that were actually agreed."),
  actionItems: z.array(
    z.object({
      title: z.string().describe("Imperative, specific: 'Send pitch deck to Tera Ventures'"),
      description: z.string(),
      assignee: z.string().nullable().describe("Email of the user who took it on, or null if unclear"),
      dueDate: z.string().nullable().describe("YYYY-MM-DD if a deadline was mentioned, else null"),
      priority: z.enum(["low", "normal", "high", "urgent"]),
    }),
  ),
  followUps: z.array(z.string()).describe("Open questions or topics left for the next meeting"),
});

/** Summarise a meeting with the user's own AI key and file the results. */
export async function processMeetingWithKey(userId: string, meetingId: string, provider?: Provider) {
  const m = await modelFor(userId, provider);
  if (!m) throw new Error("Add your own AI key in Settings first, so this runs on your credits.");
  const meeting = await getMeeting(meetingId);
  if (!meeting.transcript.trim()) throw new Error("This meeting has no transcript yet.");
  const [founders, format] = await Promise.all([listFounders(), getMeetingFormat()]);

  const { output } = await generateText({
    model: m.model,
    output: Output.object({ schema: outcomeSchema }),
    system: [
      "You turn startup team meeting transcripts into notes. Write everything in the language of the transcript, keeping names, company names and terms as they are.",
      "Be faithful to the transcript: do not invent decisions, owners or deadlines. Transcription errors are likely; infer sensibly and do not quote garbled text.",
      `Users: ${founders.map((f) => `${f.name ?? f.email} <${f.email}>`).join(", ")}.`,
      `Meeting date: ${meeting.date.toISOString().slice(0, 10)}. Resolve relative deadlines ("next Friday") against that date.`,
      formatInstruction(format),
    ].join("\n"),
    prompt: `Meeting: ${meeting.title}\n\nTranscript:\n${meeting.transcript.slice(0, 400_000)}`,
  });

  const actor = ai(userId, m.agent);
  return saveMeetingOutcome(
    actor,
    meetingId,
    {
      summary: output.summary,
      decisions: output.decisions,
      actionItems: output.actionItems.map((a) => ({ ...a, dueDate: a.dueDate ? new Date(a.dueDate) : null })),
      followUps: output.followUps,
    },
    actorName(founders, userId, m.agent),
  );
}
