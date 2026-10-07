import { authServerMetadata, OAUTH_CORS } from "@/lib/oauth";

export function GET(req: Request) {
  return Response.json(authServerMetadata(req), { headers: OAUTH_CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
