"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, File, FileSpreadsheet, FileText, Folder, FolderPlus, Loader2, Presentation, Search, X } from "lucide-react";
import { browseDriveAction, createDriveFileAction, linkDriveAction, searchDriveAction } from "@/app/actions";
import { btnIcon, btnPrimarySm, btnSecondarySm, btnSmall, inputCls, relative } from "./ui";

type Entry = { id: string; name: string; mimeType: string; modifiedTime: string };
type Target = { taskId?: string; noteId?: string; meetingId?: string };
type Kind = "doc" | "sheet" | "slides" | "folder";

const FOLDER = "application/vnd.google-apps.folder";
const NEW: { kind: Kind; label: string; icon: typeof File }[] = [
  { kind: "doc", label: "Doc", icon: FileText },
  { kind: "sheet", label: "Sheet", icon: FileSpreadsheet },
  { kind: "slides", label: "Slides", icon: Presentation },
  { kind: "folder", label: "Folder", icon: FolderPlus },
];

function Icon({ mimeType }: { mimeType: string }) {
  const cls = "w-4 h-4 shrink-0";
  if (mimeType === FOLDER) return <Folder className={`${cls} text-ink-2`} aria-hidden />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel")) return <FileSpreadsheet className={`${cls} text-[#1e8e3e]`} aria-hidden />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return <Presentation className={`${cls} text-[#c5880a]`} aria-hidden />;
  if (mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("pdf") || mimeType.startsWith("text/")) return <FileText className={`${cls} text-[#1a73e8]`} aria-hidden />;
  return <File className={`${cls} text-ink-3`} aria-hidden />;
}

/**
 * Pick a file from the shared Drive folder instead of pasting links: browse
 * folders, search, or create a new Doc / Sheet / Slides (linked at once) or folder.
 */
export function DrivePicker({ target, linked, defaultName, onClose }: { target: Target; linked: string[]; defaultName?: string; onClose: () => void }) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[] | null>(null);
  const [creating, setCreating] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [loading, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const cache = useRef(new Map<string, Entry[]>());
  const here = path.at(-1);

  function open(folder: { id: string; name: string }, depth: number) {
    setQuery("");
    setResults(null);
    setPath((p) => [...p.slice(0, depth), folder]);
    const cached = cache.current.get(folder.id);
    if (cached) return setFiles(cached);
    setFiles(null);
    start(async () => {
      const r = await browseDriveAction(folder.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const list = r.data?.files ?? [];
      cache.current.set(folder.id, list);
      setFiles(list);
    });
  }

  // The shared folder's top level, once.
  useEffect(() => {
    let live = true;
    browseDriveAction().then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      const root = r.data?.root;
      if (root) setPath([root]);
      cache.current.set(root?.id ?? "", r.data?.files ?? []);
      setFiles(r.data?.files ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  // Search as you type, after a short pause.
  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => {
      start(async () => {
        const r = await searchDriveAction(query);
        if (r.ok) setResults(r.data ?? []);
        else toast.error(r.error);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(f: Entry) {
    if (f.mimeType === FOLDER) return open({ id: f.id, name: f.name }, results ? 1 : path.length);
    setBusy(f.id);
    const r = await linkDriveAction(f.id, target);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Linked "${f.name}"`);
    onClose();
  }

  async function create() {
    if (!creating || !name.trim()) return;
    setBusy("new");
    const r = await createDriveFileAction(creating, name, here?.id, target);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const file = r.data as Entry;
    cache.current.delete(here?.id ?? "");
    setCreating(null);
    if (creating === "folder") return open({ id: file.id, name: file.name }, path.length);
    toast.success(`Created and linked "${file.name}"`);
    onClose();
  }

  const list = query.trim() ? results : files;
  return (
    <div className="rounded-lg border border-line-strong bg-surface overflow-hidden" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <nav aria-label="Folder" className="flex items-center gap-0.5 min-w-0 flex-1 text-sm overflow-x-auto">
          {query.trim() ? (
            <span className="text-ink-2 px-1.5">Search results</span>
          ) : (
            path.map((p, i) => (
              <span key={p.id} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-ink-3" aria-hidden />}
                <button
                  type="button"
                  onClick={() => open(p, i)}
                  aria-current={i === path.length - 1 ? "location" : undefined}
                  className={`px-1.5 h-7 rounded hover:bg-sunken ${i === path.length - 1 ? "font-medium text-ink" : "text-ink-2"}`}
                >
                  {p.name}
                </button>
              </span>
            ))
          )}
        </nav>
        {!error && <label className="relative">
          <span className="sr-only">Search Drive</span>
          <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Drive…"
            className="h-8 w-48 pl-8 pr-2 rounded-md border border-line bg-surface text-sm focus:outline-none focus:border-accent"
          />
        </label>}
        <button type="button" onClick={onClose} aria-label="Close" className={btnIcon}><X className="w-4 h-4" /></button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {error ? (
          <p className="px-4 py-6 text-sm text-ink-2">{error}</p>
        ) : list === null || (loading && !list.length) ? (
          <p className="px-4 py-6 text-sm text-ink-3 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">{query.trim() ? "Nothing matches." : "This folder is empty. Create something below."}</p>
        ) : (
          <ul className="py-1">
            {list.map((f) => {
              const isLinked = linked.includes(f.id);
              const isFolder = f.mimeType === FOLDER;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={isLinked || busy !== null}
                    onClick={() => pick(f)}
                    className="w-full flex items-center gap-3 px-4 h-10 text-sm text-left hover:bg-sunken disabled:hover:bg-transparent disabled:cursor-default"
                  >
                    {busy === f.id ? <Loader2 className="w-4 h-4 animate-spin text-ink-3" aria-hidden /> : <Icon mimeType={f.mimeType} />}
                    <span className={`flex-1 truncate ${isLinked ? "text-ink-3" : ""}`}>{f.name}</span>
                    {isLinked ? (
                      <span className="text-xs text-ok inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden /> Linked</span>
                    ) : isFolder ? (
                      <ChevronRight className="w-4 h-4 text-ink-3" aria-hidden />
                    ) : (
                      <span className="text-xs text-ink-3">{relative(f.modifiedTime)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!error && (
        <div className="border-t border-line px-3 py-2">
          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label={`Name of the new ${NEW.find((n) => n.kind === creating)?.label}`}
                className={`${inputCls} h-8 flex-1`}
              />
              <button disabled={!name.trim() || busy !== null} className={btnPrimarySm}>
                {busy === "new" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                {creating === "folder" ? "Create folder" : "Create and link"}
              </button>
              <button type="button" onClick={() => setCreating(null)} className={btnSecondarySm}>Cancel</button>
            </form>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-ink-3 mr-1">New in {query.trim() ? path.at(-1)?.name : here?.name ?? "folder"}:</span>
              {NEW.map(({ kind, label, icon: I }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setCreating(kind);
                    setName(kind === "folder" ? "" : (defaultName ?? ""));
                  }}
                  className={btnSmall}
                >
                  <I className="w-4 h-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
