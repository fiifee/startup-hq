"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { deleteMeetingAction, processMeetingAction, updateMeetingAction } from "@/app/actions";
import { AiMark } from "./people";
import { btnPrimary, btnSecondary, textareaCls } from "./ui";
import { useAction } from "./use-action";

/** Paste a transcript, or load it from a .txt / .md / .srt / .vtt file. */
export function TranscriptField({ name = "transcript", defaultValue = "" }: { name?: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-2">
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={14}
        placeholder="Paste the transcript here (Estonian is fine)."
        className={`${textareaCls} font-mono text-sm`}
      />
      <label className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink cursor-pointer">
        <Upload className="w-4 h-4" />
        Load from a file
        <input
          type="file"
          accept=".txt,.md,.srt,.vtt,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setValue(await file.text());
          }}
        />
      </label>
      {value && <span className="text-xs text-ink-3 ml-3">{value.length.toLocaleString("et-EE")} characters</span>}
    </div>
  );
}

export function ProcessMeeting({ meetingId, meetingName, providers, hasTranscript, processed }: { meetingId: string; meetingName: string; providers: { id: string; label: string }[]; hasTranscript: boolean; processed: boolean }) {
  const { pending, run } = useAction();
  const [provider, setProvider] = useState(providers[0]?.id ?? "");
  if (!hasTranscript) return <p className="text-sm text-ink-2">Add the transcript below to summarise this meeting.</p>;
  if (!providers.length) {
    return (
      <p className="text-sm text-ink-2">
        Add your own AI key in <a href="/settings#ai-keys" className="underline">Settings</a> to summarise here, or ask your connected Claude / ChatGPT / Gemini:
        <em> “Summarise the {meetingName} meeting in Startup HQ”</em>.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          run(() => processMeetingAction(meetingId, provider as never), undefined, (r) => {
            const d = (r as { data?: { decisions: number; tasks: number } }).data;
            if (d) toast.success(`Summary written: ${d.decisions} decisions, ${d.tasks} proposed tasks`);
          })
        }
        className={processed ? btnSecondary : btnPrimary}
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AiMark className="w-4 h-4" />}
        {pending ? "Reading the transcript…" : processed ? "Summarise again" : "Summarise with my AI"}
      </button>
      {providers.length > 1 && (
        <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Which AI" className="h-10 px-2 rounded-md border border-line-strong bg-surface text-sm">
          {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      )}
      <span className="text-xs text-ink-3">Runs on your key. Tasks come in as proposed, for you to confirm.</span>
    </div>
  );
}

export function EditTranscript({ meetingId, transcript }: { meetingId: string; transcript: string }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(!transcript);
  const router = useRouter();
  if (!editing) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap font-mono text-sm text-ink-2 max-h-[480px] overflow-auto bg-sunken rounded-md p-3">{transcript}</pre>
        <button onClick={() => setEditing(true)} className={btnSecondary}>Edit transcript</button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("transcript") ?? "");
        run(() => updateMeetingAction(meetingId, { transcript: value }), "Transcript saved", () => {
          setEditing(false);
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <TranscriptField defaultValue={transcript} />
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>Save transcript</button>
        {transcript && <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>Cancel</button>}
      </div>
    </form>
  );
}

/** Remove a meeting created by mistake; its agenda topics go back on the next agenda. */
export function DeleteMeeting({ meetingId, title }: { meetingId: string; title: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      disabled={pending}
      onClick={async () => {
        if (!confirm(`Delete the meeting "${title}"?\n\nIts notes and transcript are removed. Agenda topics it covered go back on the next agenda; tasks it proposed are dropped.`)) return;
        setPending(true);
        await deleteMeetingAction(meetingId);
      }}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" /> Delete meeting
    </button>
  );
}
