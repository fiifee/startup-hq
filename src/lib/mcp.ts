import { z } from "zod";
import type { Actor } from "./actor";
import { TOOL_MAP, TOOLS, runTool } from "./tools";

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const MCP_INSTRUCTIONS = `Startup HQ is the shared workspace of a three-person startup team: a company brief, goals and roadmap, tasks, meeting notes, a decision log, the next meeting's agenda, weekly summaries and their shared Google Drive folder.
Call get_overview first: it includes the company brief, which says what the company is and where it stands. Everything you write is labelled as written by you on behalf of the user who connected you, and shown in their colour.
Language: write in the language the user is writing to you in (Estonian or English, usually). When you work from source material without a user message, such as a meeting transcript, use the language of that material. Keep names and terms as they are.
Rules: you cannot overwrite text a person wrote (such edits become suggestions they accept); use status "proposed" for tasks you inferred rather than were asked to create; link tasks to the goal they serve; check list_decisions before re-opening something already decided.
Meeting summaries follow the team's fixed format, returned by get_meeting as summaryFormat.
Keep the company brief current: after work that changes the picture (a goal achieved, a key task done, a decision, a meeting), call get_brief and update its narrative with edit_block / append_to_note, or call brief_reviewed if nothing needs to change.`;

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const toolList = TOOLS.map((t) => {
  const { $schema: _s, ...inputSchema } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  void _s;
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema,
    annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: false, openWorldHint: t.name.startsWith("drive_") },
  };
});

async function handle(actor: Actor, msg: RpcRequest) {
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return {
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "startup-hq", title: "Startup HQ", version: "1.0.0" },
        instructions: MCP_INSTRUCTIONS,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: toolList };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!TOOL_MAP.has(name)) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
      try {
        const result = await runTool(actor, name, msg.params?.arguments ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false };
      } catch (e) {
        // Tool errors go back to the model as results so it can correct itself.
        return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
    case "resources/list":
      return { resources: [] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

/** Process one JSON-RPC message or a batch. Returns null when nothing needs a reply. */
export async function processRpc(actor: Actor, body: unknown) {
  const messages = (Array.isArray(body) ? body : [body]) as RpcRequest[];
  const replies = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      // A response from the client (we never send requests), or garbage.
      if (msg && typeof msg === "object" && ("result" in msg || "error" in msg)) continue;
      replies.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      continue;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    try {
      const result = await handle(actor, msg);
      if (!isNotification) replies.push({ jsonrpc: "2.0", id: msg.id, result });
    } catch (e) {
      if (isNotification) continue;
      const code = (e as { code?: number }).code ?? -32603;
      replies.push({ jsonrpc: "2.0", id: msg.id, error: { code, message: e instanceof Error ? e.message : String(e) } });
    }
  }
  if (!replies.length) return null;
  return Array.isArray(body) ? replies : replies[0];
}
