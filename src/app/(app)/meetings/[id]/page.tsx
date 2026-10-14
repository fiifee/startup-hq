import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockEditor, type BlockSuggestion } from "@/components/block-editor";
import { DecisionRow } from "@/components/decisions";
import { DeleteMeeting, EditTranscript, ProcessMeeting } from "@/components/meeting-forms";
import { NoteTitle } from "@/components/note-header";
import { Byline } from "@/components/people";
import { FromTasks } from "@/components/from-tasks";
import { DriveLinks } from "@/components/task-editor";
import { ConfirmAll, QuickAddTask, TaskList } from "@/components/tasks";
import { cardCls, formatDate, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROVIDERS, type Provider } from "@/lib/llm";
import { getMeeting } from "@/lib/services/meetings";
import { listFounders } from "@/lib/services/people";
import { connectedComments } from "@/lib/services/tasks";
import { isRecent } from "@/lib/view";

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const m = await getMeeting(id).catch(() => null);
  if (!m) notFound();
  const [founders, suggestions, links, keys, fromTasks] = await Promise.all([
    listFounders(),
    db.suggestion.findMany({ where: { entityType: "block", entityId: { in: m.note.blocks.map((b) => b.id) }, status: "open" } }),
    db.driveLink.findMany({ where: { meetingId: m.id } }),
    db.aiKey.findMany({ where: { userId: user.id }, select: { provider: true, model: true } }),
    connectedComments({ meetingId: m.id }),
  ]);
  const proposed = m.tasks.filter((t) => t.status === "proposed");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-2 flex-wrap">
        <Link href="/meetings" className="hover:text-ink">Meetings</Link>
        <span>/</span>
        <span>{formatDate(m.date)}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          added by <Byline founders={founders} byId={m.createdById} agent={m.createdAgent} size="xs" />
        </span>
      </div>
      <NoteTitle noteId={m.noteId} title={m.title} />

      <section className={`${cardCls} p-4 space-y-2`}>
        {m.processedAt && (
          <p className="text-sm text-ink-2">Summarised by {m.processedBy} on {formatDate(m.processedAt)}.</p>
        )}
        {!m.processedAt && m.transcript.trim() && user.autoAI && keys.length > 0 && isRecent(m.createdAt, 10) && (
          <p className="text-sm text-ink-2">Your AI is summarising this in the background. The page updates by itself.</p>
        )}
        <ProcessMeeting
          meetingId={m.id}
          meetingName={`“${m.title}” (${formatDate(m.date, false)})`}
          hasTranscript={!!m.transcript.trim()}
          processed={!!m.processedAt}
          providers={keys.map((k) => ({ id: k.provider, label: `${PROVIDERS[k.provider as Provider].label} (${k.model})` }))}
        />
      </section>

      {m.agendaItems.length > 0 && (
        <section className={`${cardCls} p-4`}>
          <h2 className={`${h2Cls} mb-2`}>Agenda</h2>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            {m.agendaItems.map((a) => <li key={a.id}>{a.text}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className={h2Cls}>Notes</h2>
        <BlockEditor
          noteId={m.noteId}
          blocks={m.note.blocks}
          suggestions={suggestions.map((s) => ({ ...s, proposed: s.proposed as BlockSuggestion["proposed"] }))}
          founders={founders}
          placeholder="Take notes, or let your AI write the summary from the transcript."
        />
      </section>

      <FromTasks comments={fromTasks} founders={founders} />

      <section className={cardCls}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h2 className={h2Cls}>Action items</h2>
          <ConfirmAll refs={proposed.map((t) => String(t.number))} />
        </div>
        <TaskList tasks={m.tasks} founders={founders} empty="No action items yet." />
        <div className="p-3 border-t border-line"><QuickAddTask founders={founders} me={user.id} meetingId={m.id} /></div>
      </section>

      <section className={cardCls}>
        <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Decisions</h2>
        {m.decisions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-3">No decisions recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {m.decisions.map((d) => <DecisionRow key={d.id} decision={{ ...d, meeting: null }} founders={founders} />)}
          </ul>
        )}
      </section>

      <section className={`${cardCls} p-4 space-y-3`}>
        <h2 className={h2Cls}>Drive files</h2>
        <DriveLinks links={links} target={{ meetingId: m.id }} founders={founders} defaultName={m.title} />
      </section>

      <details className={cardCls} open={!m.transcript}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">
          Transcript {m.transcript && <span className="font-normal text-ink-3">({m.transcript.length.toLocaleString("et-EE")} characters)</span>}
        </summary>
        <div className="px-4 pb-4"><EditTranscript meetingId={m.id} transcript={m.transcript} /></div>
      </details>
      <div className="flex justify-end">
        <DeleteMeeting meetingId={m.id} title={m.title} />
      </div>
    </div>
  );
}
