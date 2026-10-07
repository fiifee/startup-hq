"use server";

import { redirect } from "next/navigation";
import { getUser, requestOrigin } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { redirectAllowed } from "@/lib/oauth";

/** Approve or deny an AI app's request to act as the signed-in founder. */
export async function decideAction(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const clientId = String(formData.get("client_id"));
  const redirectUri = String(formData.get("redirect_uri"));
  const state = String(formData.get("state") ?? "");
  const challenge = String(formData.get("code_challenge"));
  const agent = String(formData.get("agent") ?? "").trim().slice(0, 40) || "AI";

  const client = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client || !redirectAllowed(client.redirectUris, redirectUri)) throw new Error("Invalid client or redirect URI");

  const target = new URL(redirectUri);
  if (state) target.searchParams.set("state", state);
  target.searchParams.set("iss", await requestOrigin());

  if (formData.get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const code = randomToken("hqcode_", 32);
  await db.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId,
      userId: user.id,
      agent,
      redirectUri,
      codeChallenge: challenge,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  target.searchParams.set("code", code);
  redirect(target.toString());
}
