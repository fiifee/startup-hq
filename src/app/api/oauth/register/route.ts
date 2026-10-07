import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { OAUTH_CORS, oauthError } from "@/lib/oauth";

/** Dynamic client registration (RFC 7591), used by Claude, ChatGPT and Gemini CLI. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!redirectUris.length) return oauthError("invalid_redirect_uri", "redirect_uris is required");
  for (const u of redirectUris) {
    try {
      const url = new URL(u);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback) && !/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) throw 0;
      if (url.protocol === "javascript:" || url.protocol === "data:") throw 0;
    } catch {
      return oauthError("invalid_redirect_uri", `Not allowed: ${u}`);
    }
  }
  const authMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const confidential = authMethod === "client_secret_post" || authMethod === "client_secret_basic";
  const clientId = randomToken("hqc_", 16);
  const secret = confidential ? randomToken("hqs_", 32) : null;
  const name = (typeof body.client_name === "string" && body.client_name.trim()) || "AI client";

  await db.oAuthClient.create({
    data: { id: clientId, name: name.slice(0, 100), redirectUris, secretHash: secret ? sha256(secret) : null },
  });

  return Response.json(
    {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: confidential ? authMethod : "none",
    },
    { status: 201, headers: OAUTH_CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
