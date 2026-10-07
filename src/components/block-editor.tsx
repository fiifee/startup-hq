"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { appendBlockAction, deleteBlockAction, editBlockAction, moveBlockAction } from "@/app/actions";
import { Markdown } from "./markdown";
import { Byline, type Founder } from "./people";
import { SuggestionCard } from "./suggestions";
import { btnPrimary, relative } from "./ui";
import { useShortcut } from "./shortcut";
import { useAction } from "./use-action";

export type BlockView = { id: string; content: string; byId: string | null; agent: string | null; updatedAt: Date };
export type BlockSuggestion = { id: string; entityId: string; byId: string | null; agent: string | null; reason: string; createdAt: Date; proposed: { content?: string; delete?: boolean } };

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

function Block({ block, founders, first, last }: { block: BlockView; founders: Founder[]; first: boolean; last: boolean }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.content);
  const color = founders.find((f) => f.id === block.byId)?.color ?? "#7b776f";

  const save = () => {
    setEditing(false);
    if (draft.trim() === block.content.trim()) return;
    run(() => editBlockAction(block.id, draft));
  };

  return (
    <div className={`group relative rounded-r-md pl-3 pr-2 py-1.5 ${block.agent ? "ai-tint" : "human-mark"}`} style={{ ["--who" as string]: color }}>
      <div className={`flex items-center gap-1 text-xs mb-0.5 ${block.agent ? "" : "h-0 overflow-hidden group-hover:h-auto group-focus-within:h-auto"}`}>
        <Byline founders={founders} byId={block.byId} agent={block.agent} size="xs" />
        <span className="text-ink-3">{relative(block.updatedAt)}</span>
        <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <button aria-label="Move up" disabled={first || pending} onClick={() => run(() => moveBlockAction(block.id, "up"))} className="p-1 rounded hover:bg-sunken disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button aria-label="Move down" disabled={last || pending} onClick={() => run(() => moveBlockAction(block.id, "down"))} className="p-1 rounded hover:bg-sunken disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button aria-label="Delete block" disabled={pending} onClick={() => run(() => deleteBlockAction(block.id), "Removed. Undo it from the history.")} className="p-1 rounded hover:bg-sunken text-ink-2 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {editing ? (
        <AutoTextarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(block.content);
              setEditing(false);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          }}
          className="w-full resize-none bg-surface rounded border border-accent px-2 py-1 text-[15px] leading-relaxed font-mono focus:outline-none"
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) return;
            setDraft(block.content);
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setDraft(block.content);
              setEditing(true);
            }
          }}
          className="cursor-text min-h-6"
          title={block.agent ? "Written by AI. Click to edit; it becomes yours." : "Click to edit"}
        >
          <Markdown>{block.content}</Markdown>
        </div>
      )}
    </div>
  );
}

/**
 * A note as paragraph-sized blocks. Each block shows who wrote it; AI blocks are
 * tinted in their founder's colour. AI edits to a person's block wait below it
 * as suggestions.
 */
export function BlockEditor({ noteId, blocks, suggestions, founders, placeholder = "Write… Markdown works. A blank line starts a new block." }: { noteId: string; blocks: BlockView[]; suggestions: BlockSuggestion[]; founders: Founder[]; placeholder?: string }) {
  const { pending, run } = useAction();
  const [draft, setDraft] = useState("");
  const addHint = useShortcut("Enter");
  const add = () => {
    if (!draft.trim()) return;
    run(() => appendBlockAction(noteId, draft), undefined, () => setDraft(""));
  };
  return (
    <div className="space-y-1">
      {blocks.map((b, i) => (
        <div key={b.id} className="space-y-2">
          <Block block={b} founders={founders} first={i === 0} last={i === blocks.length - 1} />
          {suggestions
            .filter((s) => s.entityId === b.id)
            .map((s) => (
              <SuggestionCard
                key={s.id}
                founders={founders}
                suggestion={s}
                changes={[{ label: "Paragraph", before: b.content, after: s.proposed.delete ? null : (s.proposed.content ?? "") }]}
              />
            ))}
        </div>
      ))}
      <div className="pt-3">
        <AutoTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          rows={3}
          placeholder={placeholder}
          aria-label="New text"
          className="w-full resize-none rounded-md border border-dashed border-line-strong bg-transparent px-3 py-2 text-[15px] leading-relaxed placeholder:text-ink-3 focus:outline-none focus:border-accent focus:bg-surface"
        />
        {draft.trim() && (
          <div className="flex items-center gap-2 mt-2">
            <button onClick={add} disabled={pending} className={btnPrimary}>Add</button>
            {addHint && <span className="text-xs text-ink-3">{addHint}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
