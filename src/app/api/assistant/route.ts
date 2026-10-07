import { generateText, isStepCount, tool, type ModelMessage } from "ai";
import { ai } from "@/lib/actor";
import { getUser } from "@/lib/auth";
import { modelFor, type Provider } from "@/lib/llm";
import { MCP_INSTRUCTIONS } from "@/lib/mcp";
import { TOOLS } from "@/lib/tools";

export const maxDuration = 120;

/**
 * The in-app assistant. Runs on the signed-in founder's own key, with the same
 * tools the MCP server exposes, and acts as "<founder>'s <model>".
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[]; provider?: Provider; page?: string };
  const m = await modelFor(user.id, body.provider);
  if (!m) return Response.json({ error: "Add your own AI key in Settings → AI to use the assistant." }, { status: 400 });

  const actor = ai(user.id, m.agent);
  const actions: { tool: string; ok: boolean; summary: string }[] = [];
  const tools = Object.fromEntries(
    TOOLS.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: t.input,
        execute: async (args: Record<string, unknown>) => {
          try {
            const result = await t.run(actor, args);
            if (!t.readOnly) actions.push({ tool: t.title, ok: true, summary: JSON.stringify(args).slice(0, 140) });
            return result;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            actions.push({ tool: t.title, ok: false, summary: message });
            return { error: message };
          }
        },
      }),
    ]),
  );

  const messages: ModelMessage[] = body.messages.slice(-20).map((x) => ({ role: x.role, content: x.content }));
  try {
    const result = await generateText({
      model: m.model,
      system: `${MCP_INSTRUCTIONS}\nYou are talking with ${user.name ?? user.email} inside the Startup HQ web app. Today is ${new Date().toISOString().slice(0, 10)}.${body.page ? ` They are looking at ${body.page}.` : ""} Act, don't ask, when the request is clear: a short line is usually a task for them, a pasted transcript is a meeting (create_meeting, then save_meeting_outcome). Reply in the language of their latest message. Answer briefly; refer to tasks as T-<n> and decisions as D-<n>.`,
      messages,
      tools,
      stopWhen: isStepCount(15),
    });
    return Response.json({ text: result.text, actions, agent: m.agent });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), actions }, { status: 502 });
  }
}
