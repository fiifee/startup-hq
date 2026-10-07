import { actorFromRequest } from "@/lib/agent-auth";
import { appUrl } from "@/lib/auth";
import { processRpc } from "@/lib/mcp";

export const maxDuration = 60;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

function unauthorized(req: Request) {
  const base = appUrl(req);
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in required. Connect this server with OAuth or a personal token from Settings → AI connections." } },
    {
      status: 401,
      headers: { ...cors, "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"` },
    },
  );
}

export async function POST(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: cors });
  }
  const reply = await processRpc(actor, body);
  if (reply === null) return new Response(null, { status: 202, headers: cors });
  return Response.json(reply, { headers: cors });
}

// Stateless server: no server-to-client stream and no sessions to end.
export async function GET(req: Request) {
  if (!(await actorFromRequest(req))) return unauthorized(req);
  return new Response("This MCP server does not offer an SSE stream.", { status: 405, headers: { ...cors, allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { ...cors, allow: "POST" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
