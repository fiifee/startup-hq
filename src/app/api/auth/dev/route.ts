import { allowSignIn, appUrl, createSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** Local development only: sign in as a founder without Google. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return new Response("Not found", { status: 404 });
  const email = new URL(req.url).searchParams.get("email") ?? process.env.OWNER_EMAIL ?? "";
  const user = await allowSignIn(email);
  if (!user) return new Response(`${email} is not a member`, { status: 403 });
  if (!user.joinedAt) await db.user.update({ where: { id: user.id }, data: { joinedAt: new Date(), name: user.name ?? email.split("@")[0] } });
  await createSession(user.id);
  return Response.redirect(`${appUrl(req)}/`, 302);
}
