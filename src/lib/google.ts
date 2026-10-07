import { db } from "./db";
import { decrypt, encrypt } from "./crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function googleAuthUrl(opts: { redirectUri: string; state: string; drive?: boolean; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
    scope: ["openid", "email", "profile", ...(opts.drive ? [DRIVE_SCOPE] : [])].join(" "),
    include_granted_scopes: "true",
  });
  if (opts.drive) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else {
    params.set("prompt", "select_account");
  }
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string };

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Claims from an id_token that came straight from Google's token endpoint over TLS. */
export function idTokenClaims(idToken: string): { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string } {
  const payload = idToken.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

// ---- Drive connection (one per workspace, made by the owner whose Drive holds the shared folder)

const KEYS = { refresh: "drive.refreshToken", folder: "drive.folderId", folderName: "drive.folderName", email: "drive.email" };

export async function saveDriveConnection(refreshToken: string, email: string) {
  await db.$transaction([
    db.setting.upsert({ where: { key: KEYS.refresh }, update: { value: encrypt(refreshToken) }, create: { key: KEYS.refresh, value: encrypt(refreshToken) } }),
    db.setting.upsert({ where: { key: KEYS.email }, update: { value: email }, create: { key: KEYS.email, value: email } }),
  ]);
  cachedAccess = null;
}

export async function setDriveFolder(folderId: string, name: string) {
  await db.$transaction([
    db.setting.upsert({ where: { key: KEYS.folder }, update: { value: folderId }, create: { key: KEYS.folder, value: folderId } }),
    db.setting.upsert({ where: { key: KEYS.folderName }, update: { value: name }, create: { key: KEYS.folderName, value: name } }),
  ]);
}

export async function disconnectDrive() {
  await db.setting.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
  cachedAccess = null;
}

export async function driveStatus() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  return {
    connected: !!get(KEYS.refresh),
    email: get(KEYS.email),
    folderId: get(KEYS.folder),
    folderName: get(KEYS.folderName),
  };
}

let cachedAccess: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;
  const row = await db.setting.findUnique({ where: { key: KEYS.refresh } });
  if (!row) throw new Error("Google Drive is not connected. The owner can connect it in Settings.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decrypt(row.value),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google Drive access was lost (${res.status}). Reconnect Drive in Settings.`);
  const data: TokenResponse = await res.json();
  cachedAccess = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const url = path.startsWith("http") ? path : `https://www.googleapis.com${path}`;
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Drive error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}
