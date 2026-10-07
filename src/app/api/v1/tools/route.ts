import { z } from "zod";
import { actorFromRequest } from "@/lib/agent-auth";
import { TOOLS } from "@/lib/tools";

export async function GET(req: Request) {
  if (!(await actorFromRequest(req))) return Response.json({ error: "Bearer token required" }, { status: 401 });
  return Response.json(
    TOOLS.map((t) => ({ name: t.name, description: t.description, readOnly: !!t.readOnly, input: z.toJSONSchema(t.input, { io: "input" }) })),
  );
}
