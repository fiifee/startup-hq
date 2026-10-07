import { appUrl } from "@/lib/auth";
import { OAUTH_CORS } from "@/lib/oauth";

export function GET(req: Request) {
  const base = appUrl(req);
  return Response.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_name: "Startup HQ",
    },
    { headers: OAUTH_CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
