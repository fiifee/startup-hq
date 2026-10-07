import { actorFromRequest } from "@/lib/agent-auth";
import { runTool } from "@/lib/tools";

export const maxDuration = 60;

/** Plain HTTP access to any tool, for scripts: POST /api/v1/tools/create_task with JSON args. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/tools/[name]">) {
  const actor = await actorFromRequest(req);
  if (!actor) return Response.json({ error: "Bearer token required" }, { status: 401 });
  const { name } = await ctx.params;
  const args = await req.json().catch(() => ({}));
  try {
    return Response.json({ ok: true, result: await runTool(actor, name, args) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
