import { cookies } from "next/headers";
import { allowSignIn, appUrl, createSession, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCode, idTokenClaims, saveDriveConnection } from "@/lib/google";
import { safeNext, STATE_COOKIE } from "@/lib/google-flow";

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const saved = raw ? (JSON.parse(raw) as { state: string; mode: "login" | "drive"; next: string }) : null;

  const fail = (msg: string) => Response.redirect(`${base}/login?error=${encodeURIComponent(msg)}`, 302);
  if (url.searchParams.get("error")) return fail("Google sign-in was cancelled.");
  if (!saved || saved.state !== url.searchParams.get("state")) return fail("Sign-in expired. Try again.");

  const tokens = await exchangeCode(url.searchParams.get("code") ?? "", `${base}/api/auth/google/callback`);
  if (!tokens.id_token) return fail("Google did not return an identity.");
  const claims = idTokenClaims(tokens.id_token);
  if (!claims.email_verified) return fail("That Google account's email is not verified.");

  if (saved.mode === "drive") {
    const user = await getUser();
    if (!user?.isOwner) return Response.redirect(`${base}/settings?drive=forbidden`, 302);
    if (!tokens.refresh_token) return Response.redirect(`${base}/settings?drive=norefresh`, 302);
    await saveDriveConnection(tokens.refresh_token, claims.email);
    return Response.redirect(`${base}/docs?kind=drive`, 302);
  }

  const user = await allowSignIn(claims.email);
  if (!user) return fail(`${claims.email} is not a member of this workspace. Ask the owner to add you in Settings.`);
  if (user.googleSub && user.googleSub !== claims.sub) return fail("This email is linked to a different Google account.");
  await db.user.update({
    where: { id: user.id },
    data: { googleSub: claims.sub, name: user.name ?? claims.name ?? null, image: claims.picture ?? user.image, joinedAt: user.joinedAt ?? new Date() },
  });
  await createSession(user.id);
  return Response.redirect(`${base}${safeNext(saved.next)}`, 302);
}
