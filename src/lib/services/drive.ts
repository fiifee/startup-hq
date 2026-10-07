import { by, type Actor } from "../actor";
import { db } from "../db";
import { driveFetch, driveStatus } from "../google";
import { logActivity } from "./activity";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string; parents?: string[] };

const FIELDS = "files(id,name,mimeType,webViewLink,modifiedTime,parents),nextPageToken";
const FOLDER = "application/vnd.google-apps.folder";

async function rootFolder(folderId?: string) {
  const s = await driveStatus();
  const id = folderId || s.folderId;
  if (!id) throw new Error("No shared Drive folder is set. The owner can pick one in Settings.");
  return id;
}

export async function listFolder(folderId?: string): Promise<DriveFile[]> {
  const id = await rootFolder(folderId);
  const q = `'${id.replace(/'/g, "")}' in parents and trashed = false`;
  const res = await driveFetch(`/drive/v3/files?${new URLSearchParams({ q, fields: FIELDS, pageSize: "200", orderBy: "folder,modifiedTime desc" })}`);
  return (await res.json()).files;
}

/**
 * Full-text search. Drive cannot scope fullText to a folder tree in one query,
 * so results are everything the connected account can see that matches.
 */
export async function searchDrive(query: string): Promise<DriveFile[]> {
  const term = query.replace(/\\/g, "").replace(/'/g, "\\'");
  const q = `(name contains '${term}' or fullText contains '${term}') and trashed = false`;
  const res = await driveFetch(`/drive/v3/files?${new URLSearchParams({ q, fields: FIELDS, pageSize: "25" })}`);
  return (await res.json()).files;
}

export async function listFolders(): Promise<DriveFile[]> {
  const q = `mimeType = '${FOLDER}' and trashed = false`;
  const res = await driveFetch(`/drive/v3/files?${new URLSearchParams({ q, fields: FIELDS, pageSize: "100", orderBy: "modifiedTime desc" })}`);
  return (await res.json()).files;
}

export async function fileMeta(fileId: string): Promise<DriveFile> {
  const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,modifiedTime,parents`);
  return res.json();
}

const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/markdown",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

/** File contents as text, for an AI to read. Long files are cut at maxChars. */
export async function readFile(fileId: string, maxChars = 60_000) {
  const meta = await fileMeta(fileId);
  let text: string;
  const exportAs = EXPORTS[meta.mimeType];
  if (exportAs) {
    const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportAs)}`);
    text = await res.text();
  } else if (meta.mimeType.startsWith("text/") || /json|xml|csv|markdown/.test(meta.mimeType)) {
    const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    text = await res.text();
  } else if (meta.mimeType === FOLDER) {
    const files = await listFolder(fileId);
    text = files.map((f) => `- ${f.name} (${f.mimeType}, id ${f.id})`).join("\n");
  } else {
    throw new Error(`Cannot read ${meta.mimeType} files as text. Open it in Drive: ${meta.webViewLink}`);
  }
  const truncated = text.length > maxChars;
  return { ...meta, truncated, text: truncated ? text.slice(0, maxChars) : text };
}

/** Create a Google Doc from markdown in the shared folder (or a sub-folder). */
export async function createDoc(actor: Actor, name: string, markdown: string, folderId?: string) {
  const parent = await rootFolder(folderId);
  const boundary = "hq" + Math.random().toString(36).slice(2);
  const metadata = { name, mimeType: "application/vnd.google-apps.document", parents: [parent] };
  const body =
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\ncontent-type: text/markdown; charset=UTF-8\r\n\r\n${markdown}\r\n--${boundary}--`;
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime`, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const file: DriveFile = await res.json();
  await db.$transaction((tx) => logActivity(tx, actor, "drive", file.id, "created", `Created Google Doc "${file.name}"`));
  return file;
}

export async function linkFile(actor: Actor, fileId: string, target: { taskId?: string; noteId?: string; meetingId?: string }) {
  if (!target.taskId && !target.noteId && !target.meetingId) throw new Error("Link to a task, note or meeting");
  const meta = await fileMeta(fileId);
  return db.$transaction(async (tx) => {
    const link = await tx.driveLink.create({
      data: { fileId: meta.id, name: meta.name, mimeType: meta.mimeType, url: meta.webViewLink, ...target, ...by(actor) },
    });
    await logActivity(tx, actor, "drive", meta.id, "linked", `Linked "${meta.name}"`);
    return link;
  });
}

export async function unlinkFile(actor: Actor, linkId: string) {
  await db.$transaction(async (tx) => {
    const link = await tx.driveLink.delete({ where: { id: linkId } });
    await logActivity(tx, actor, "drive", link.fileId, "unlinked", `Unlinked "${link.name}"`);
  });
}
