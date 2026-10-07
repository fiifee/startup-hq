import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "hq_session";
const SESSION_DAYS = 90;

export async function createSession(userId: string) {
  const token = randomToken("", 32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in founder, or null. Cached per request. */
export const getUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!user.isOwner) throw new Error("Only the workspace owner can do this");
  return user;
}

/** A founder may sign in if they were added in Settings, or they are OWNER_EMAIL. */
export async function allowSignIn(email: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing) return existing;
  if (normalized === process.env.OWNER_EMAIL?.trim().toLowerCase()) {
    return db.user.create({ data: { email: normalized, isOwner: true, color: "#2c6e52" } });
  }
  return null;
}

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** The public origin of the current request, for server components and actions. */
export async function requestOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return appUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
