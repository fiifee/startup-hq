import { appUrl, destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  await destroySession();
  return Response.redirect(`${appUrl(req)}/login`, 303);
}
