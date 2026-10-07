import { cookies } from "next/headers";
import { appUrl } from "./auth";
import { randomToken } from "./crypto";
import { googleAuthUrl, googleConfigured } from "./google";

export const STATE_COOKIE = "hq_google_state";

/** Only same-site relative paths, so the login can't be turned into an open redirect. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function startGoogle(req: Request, mode: "login" | "drive", next: string, loginHint?: string) {
  if (!googleConfigured()) return new Response("Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", { status: 500 });
  const state = randomToken("", 16);
  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify({ state, mode, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const url = googleAuthUrl({ redirectUri: `${appUrl(req)}/api/auth/google/callback`, state, drive: mode === "drive", loginHint });
  return Response.redirect(url, 302);
}
