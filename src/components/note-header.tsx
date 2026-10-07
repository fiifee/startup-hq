"use client";

import { useState } from "react";
import { Archive, Pin, PinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateNoteAction } from "@/app/actions";
import { btnSmall } from "./ui";
import { useAction } from "./use-action";

export function NoteTitle({ noteId, title }: { noteId: string; title: string }) {
  const { run } = useAction();
  const [value, setValue] = useState(title);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() && value !== title && run(() => updateNoteAction(noteId, { title: value }))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Note title"
      className="w-full text-2xl font-semibold tracking-tight bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none py-1"
    />
  );
}

export function NoteActions({ noteId, pinned }: { noteId: string; pinned: boolean }) {
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <button disabled={pending} onClick={() => run(() => updateNoteAction(noteId, { pinned: !pinned }))} className={btnSmall}>
        {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />} {pinned ? "Unpin" : "Pin"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Archive this note? It disappears from lists but is kept.")) run(() => updateNoteAction(noteId, { archived: true }), "Archived", () => router.push("/docs"));
        }}
        className={btnSmall}
      >
        <Archive className="w-4 h-4" /> Archive
      </button>
    </div>
  );
}
