import { appUrl, getUser } from "@/lib/auth";
import { safeNext, startGoogle } from "@/lib/google-flow";

export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const user = await getUser();
  if (user) return Response.redirect(`${appUrl(req)}${next}`, 302);
  return startGoogle(req, "login", next);
}
