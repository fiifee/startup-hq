import { appUrl } from "./auth";

export const OAUTH_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
};

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_DAYS = 90;

export function authServerMetadata(req: Request) {
  const base = appUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["mcp"],
  };
}

export function oauthError(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: { ...OAUTH_CORS, "cache-control": "no-store" } });
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Exact match, except loopback redirect URIs may use any port (RFC 8252 §7.3). */
export function redirectAllowed(registered: string[], uri: string) {
  if (registered.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (!LOOPBACK.has(u.hostname)) return false;
    return registered.some((r) => {
      const v = new URL(r);
      return LOOPBACK.has(v.hostname) && v.protocol === u.protocol && v.pathname === u.pathname;
    });
  } catch {
    return false;
  }
}
