import Link from "next/link";
import { FileSpreadsheet, FileText, Folder, Presentation, File as FileIcon } from "lucide-react";
import { FolderPicker } from "@/components/settings";
import { btnPrimary, cardCls, formatDate, h1Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { driveStatus, googleConfigured } from "@/lib/google";
import { listFolder, searchDrive, type DriveFile } from "@/lib/services/drive";

export const metadata = { title: "Drive" };

function Icon({ mime }: { mime: string }) {
  const cls = "w-4 h-4 shrink-0 text-ink-2";
  if (mime.endsWith("folder")) return <Folder className={cls} />;
  if (mime.endsWith("document")) return <FileText className={cls} />;
  if (mime.endsWith("spreadsheet")) return <FileSpreadsheet className={cls} />;
  if (mime.endsWith("presentation")) return <Presentation className={cls} />;
  return <FileIcon className={cls} />;
}

export default async function DrivePage(props: PageProps<"/drive">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const folder = typeof sp.folder === "string" ? sp.folder : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = await driveStatus();

  if (!status.connected) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className={h1Cls}>Google Drive</h1>
        {user.isOwner ? (
          <div className={`${cardCls} p-5 space-y-3`}>
            <p>Connect the Google account that owns the shared folder. Everyone (and every connected AI) can then browse, read and attach files from it.</p>
            {googleConfigured() ? (
              <a href="/api/auth/drive" className={btnPrimary}>Connect Google Drive</a>
            ) : (
              <p className="text-sm text-warn">Google sign-in is not configured on the server yet.</p>
            )}
            <p className="text-sm text-ink-2">Google will warn that the app is unverified; it is your own app, so choose Advanced → Continue.</p>
          </div>
        ) : (
          <p className="text-ink-2">The owner has not connected Google Drive yet.</p>
        )}
      </div>
    );
  }

  let files: DriveFile[] = [];
  let error = "";
  if (status.folderId || q) {
    try {
      files = q ? await searchDrive(q) : await listFolder(folder);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className={h1Cls}>Google Drive</h1>
          <p className="text-ink-2 mt-1">
            {status.folderName ? <>Shared folder: <Link href="/drive" className="underline">{status.folderName}</Link></> : "No shared folder chosen yet."}
          </p>
        </div>
        <form>
          <input name="q" defaultValue={q} placeholder="Search Drive…" aria-label="Search Drive" className="h-9 px-3 rounded-md border border-line bg-surface text-sm w-60 focus:outline-none focus:border-accent" />
        </form>
      </div>
      {!status.folderId && user.isOwner && (
        <div className={`${cardCls} p-4`}><FolderPicker current={null} /></div>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      {folder && <Link href="/drive" className="text-sm underline">← Back to the shared folder</Link>}
      {(status.folderId || q) && (
        <ul className={`${cardCls} divide-y divide-line`}>
          {files.length === 0 && !error && <li className="px-4 py-6 text-sm text-ink-3">{q ? "No matches." : "This folder is empty."}</li>}
          {files.map((f) => {
            const isFolder = f.mimeType.endsWith("folder");
            return (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon mime={f.mimeType} />
                {isFolder ? (
                  <Link href={`/drive?folder=${f.id}`} className="flex-1 truncate hover:underline font-medium">{f.name}</Link>
                ) : (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{f.name}</a>
                )}
                <span className="text-xs text-ink-3 shrink-0">{formatDate(f.modifiedTime)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-ink-3">Attach a file to a task, note or meeting from that page with its Drive link. Connected AIs can read Docs, Sheets and Slides here.</p>
    </div>
  );
}
