import { appUrl, getUser } from "@/lib/auth";
import { startGoogle } from "@/lib/google-flow";

/** The owner grants Drive access once; the app then reads the shared folder for everyone. */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user?.isOwner) return Response.redirect(`${appUrl(req)}/settings?drive=forbidden`, 302);
  return startGoogle(req, "drive", "/drive", user.email);
}
