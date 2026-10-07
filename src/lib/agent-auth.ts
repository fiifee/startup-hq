import { ai, type Actor } from "./actor";
import { db } from "./db";
import { sha256 } from "./crypto";

export const API_TOKEN_PREFIX = "shq_";
export const ACCESS_TOKEN_PREFIX = "hqa_";
export const REFRESH_TOKEN_PREFIX = "hqr_";

/**
 * Resolve an `Authorization: Bearer ...` header to the founder and the AI acting
 * for them. Personal tokens (Hermes, scripts) and OAuth grants (Claude, ChatGPT,
 * Gemini) both land here.
 */
export async function actorFromRequest(req: Request): Promise<Actor | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const hash = sha256(token);

  if (token.startsWith(API_TOKEN_PREFIX)) {
    const t = await db.apiToken.findUnique({ where: { tokenHash: hash } });
    if (!t || t.revokedAt) return null;
    if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > 60_000) {
      await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
    }
    return ai(t.userId, t.agent);
  }

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    const g = await db.oAuthGrant.findUnique({ where: { accessTokenHash: hash } });
    if (!g || g.revokedAt || g.accessExpiresAt < new Date()) return null;
    if (!g.lastUsedAt || Date.now() - g.lastUsedAt.getTime() > 60_000) {
      await db.oAuthGrant.update({ where: { id: g.id }, data: { lastUsedAt: new Date() } });
    }
    return ai(g.userId, g.agent);
  }
  return null;
}
