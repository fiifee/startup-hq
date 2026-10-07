import Link from "next/link";
import { File as FileIcon, FileSpreadsheet, FileText, Folder, Pin, Presentation } from "lucide-react";
import { createNoteAction } from "@/app/actions";
import { Byline } from "@/components/people";
import { FolderPicker } from "@/components/settings";
import { btnPrimary, cardCls, formatDate, h1Cls, h2Cls, inputCls, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { driveStatus, googleConfigured } from "@/lib/google";
import { listFolder, searchDrive, type DriveFile } from "@/lib/services/drive";
import { listNotes } from "@/lib/services/notes";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Docs" };

const TABS = [
  { key: "", label: "All" },
  { key: "note", label: "Notes" },
  { key: "weekly", label: "Weekly summaries" },
  { key: "drive", label: "Drive" },
];

function DriveIcon({ mime }: { mime: string }) {
  const cls = "w-4 h-4 shrink-0 text-ink-2";
  if (mime.endsWith("folder")) return <Folder className={cls} />;
  if (mime.endsWith("document")) return <FileText className={cls} />;
  if (mime.endsWith("spreadsheet")) return <FileSpreadsheet className={cls} />;
  if (mime.endsWith("presentation")) return <Presentation className={cls} />;
  return <FileIcon className={cls} />;
}

/** Notes, weekly summaries and the shared Drive folder in one list. */
export default async function DocsPage(props: PageProps<"/docs">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const folder = typeof sp.folder === "string" ? sp.folder : undefined;
  const showNotes = kind !== "drive" && !folder;
  const showDrive = kind === "" || kind === "drive" || !!folder;

  const [founders, drive] = await Promise.all([listFounders(), driveStatus()]);
  const notes = showNotes
    ? (await listNotes({ kind: kind || undefined, search: q || undefined, limit: 200 })).filter((n) => (kind ? true : n.kind === "note" || n.kind === "weekly"))
    : [];

  let files: DriveFile[] = [];
  let driveError = "";
  if (showDrive && drive.connected && (drive.folderId || q)) {
    try {
      files = q ? await searchDrive(q) : await listFolder(folder);
    } catch (e) {
      driveError = e instanceof Error ? e.message : String(e);
    }
  }
  const link = (patch: Record<string, string>) => `/docs?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(q ? { q } : {}), ...patch })}`;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className={h1Cls}>Docs</h1>
      <form action={createNoteAction} className="flex gap-2">
        <input name="title" placeholder="New note title" aria-label="New note title" className={inputCls} />
        <button className={btnPrimary}>Create note</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1 p-1 rounded-lg bg-sunken overflow-x-auto">
          {TABS.map((t) => (
            <Link key={t.key} href={`/docs?${new URLSearchParams({ ...(t.key ? { kind: t.key } : {}), ...(q ? { q } : {}) })}`} className={`h-8 px-3 rounded-md text-sm inline-flex items-center whitespace-nowrap ${kind === t.key && !folder ? "bg-surface shadow-sm font-medium" : "text-ink-2 hover:text-ink"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <form>
          {kind && <input type="hidden" name="kind" value={kind} />}
          <input name="q" defaultValue={q} placeholder="Search notes and Drive…" aria-label="Search docs" className="h-9 px-3 rounded-md border border-line bg-surface text-sm w-60 focus:outline-none focus:border-accent" />
        </form>
      </div>

      {showNotes && (
        <section className={cardCls}>
          {kind === "" && <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Notes</h2>}
          <ul className="divide-y divide-line">
            {notes.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">{q ? "No matching notes." : "No notes yet. Create one above, or press Capture."}</li>}
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={n.meeting ? `/meetings/${n.meeting.id}` : `/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
                  {n.pinned && <Pin className="w-3.5 h-3.5 text-ink-3" aria-label="Pinned" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{n.title}</span>
                    <span className="text-xs text-ink-3">
                      {n.kind === "weekly" ? "Weekly summary · " : n.kind === "meeting" ? "Meeting · " : ""}updated {relative(n.updatedAt)}
                    </span>
                  </span>
                  <Byline founders={founders} byId={n.createdById} agent={n.createdAgent} size="xs" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showDrive && (
        <section className={cardCls}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <h2 className={h2Cls}>Google Drive{drive.folderName && <span className="font-normal text-ink-2"> · {drive.folderName}</span>}</h2>
            {folder && <Link href={link({ kind: "drive" })} className="text-sm text-ink-2 hover:text-ink">← Shared folder</Link>}
          </div>
          {!drive.connected ? (
            <div className="p-4 space-y-2 text-sm">
              {user.isOwner && googleConfigured() ? (
                <>
                  <p>Connect the Google account that owns the shared folder. Everyone, and every connected AI, can then read it.</p>
                  <a href="/api/auth/drive" className={btnPrimary}>Connect Google Drive</a>
                </>
              ) : (
                <p className="text-ink-2">The owner has not connected Google Drive yet.</p>
              )}
            </div>
          ) : !drive.folderId && !q ? (
            <div className="p-4">{user.isOwner ? <FolderPicker current={null} /> : <p className="text-sm text-ink-2">No shared folder chosen yet.</p>}</div>
          ) : (
            <ul className="divide-y divide-line">
              {driveError && <li className="px-4 py-3 text-sm text-danger">{driveError}</li>}
              {!driveError && files.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">{q ? "No matching files." : "This folder is empty."}</li>}
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                  <DriveIcon mime={f.mimeType} />
                  {f.mimeType.endsWith("folder") ? (
                    <Link href={link({ folder: f.id })} className="flex-1 truncate hover:underline font-medium">{f.name}</Link>
                  ) : (
                    <a href={f.webViewLink} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{f.name}</a>
                  )}
                  <span className="text-xs text-ink-3 shrink-0">{formatDate(f.modifiedTime)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
