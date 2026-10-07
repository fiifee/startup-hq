import { ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { pkceMatches, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { ACCESS_TTL_S, OAUTH_CORS, oauthError, REFRESH_TTL_DAYS } from "@/lib/oauth";

async function readParams(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return new URLSearchParams(Object.entries(await req.json()).map(([k, v]) => [k, String(v)]));
  return new URLSearchParams(await req.text());
}

/** client_id/secret from the body or HTTP Basic. */
function clientCredentials(req: Request, p: URLSearchParams) {
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":");
    return { id: decodeURIComponent(id ?? ""), secret: decodeURIComponent(secret ?? "") };
  }
  return { id: p.get("client_id") ?? "", secret: p.get("client_secret") ?? "" };
}

function issue() {
  const access = randomToken(ACCESS_TOKEN_PREFIX, 32);
  const refresh = randomToken(REFRESH_TOKEN_PREFIX, 32);
  return {
    access,
    refresh,
    data: {
      accessTokenHash: sha256(access),
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
      refreshTokenHash: sha256(refresh),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    },
  };
}

function tokenResponse(access: string, refresh: string) {
  return Response.json(
    { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "mcp" },
    { headers: { ...OAUTH_CORS, "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const p = await readParams(req);
  const creds = clientCredentials(req, p);
  const client = creds.id ? await db.oAuthClient.findUnique({ where: { id: creds.id } }) : null;
  if (!client) return oauthError("invalid_client", "Unknown client", 401);
  if (client.secretHash && !safeEqual(sha256(creds.secret), client.secretHash)) return oauthError("invalid_client", "Bad client secret", 401);

  const grantType = p.get("grant_type");
  if (grantType === "authorization_code") {
    const code = p.get("code") ?? "";
    const verifier = p.get("code_verifier") ?? "";
    const row = await db.oAuthCode.findUnique({ where: { codeHash: sha256(code) } });
    if (!row || row.clientId !== client.id || row.usedAt || row.expiresAt < new Date()) return oauthError("invalid_grant", "Code is invalid or expired");
    if (p.get("redirect_uri") && p.get("redirect_uri") !== row.redirectUri) return oauthError("invalid_grant", "redirect_uri mismatch");
    if (!verifier || !pkceMatches(verifier, row.codeChallenge)) return oauthError("invalid_grant", "PKCE verification failed");

    // Single use: mark the code before issuing so a replay cannot win a race.
    const used = await db.oAuthCode.updateMany({ where: { codeHash: row.codeHash, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) return oauthError("invalid_grant", "Code already used");

    const t = issue();
    await db.oAuthGrant.create({ data: { clientId: client.id, userId: row.userId, agent: row.agent, ...t.data } });
    return tokenResponse(t.access, t.refresh);
  }

  if (grantType === "refresh_token") {
    const grant = await db.oAuthGrant.findUnique({ where: { refreshTokenHash: sha256(p.get("refresh_token") ?? "") } });
    if (!grant || grant.clientId !== client.id || grant.revokedAt || grant.refreshExpiresAt < new Date()) {
      return oauthError("invalid_grant", "Refresh token is invalid or expired");
    }
    const t = issue();
    await db.oAuthGrant.update({ where: { id: grant.id }, data: t.data });
    return tokenResponse(t.access, t.refresh);
  }

  return oauthError("unsupported_grant_type", `grant_type ${grantType} is not supported`);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
