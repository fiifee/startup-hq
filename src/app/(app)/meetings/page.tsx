import Link from "next/link";
import { Plus } from "lucide-react";
import { Byline } from "@/components/people";
import { btnPrimary, cardCls, formatDate, h1Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listMeetings } from "@/lib/services/meetings";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  await requireUser();
  const [meetings, founders] = await Promise.all([listMeetings(200), listFounders()]);
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className={h1Cls}>Meetings</h1>
        <Link href="/meetings/new" className={btnPrimary}><Plus className="w-4 h-4" /> Add meeting</Link>
      </div>
      <ul className={`${cardCls} divide-y divide-line`}>
        {meetings.length === 0 && (
          <li className="px-4 py-8 text-sm text-ink-2 text-center">
            No meetings yet. <Link href="/meetings/new" className="underline">Paste your first transcript</Link>.
          </li>
        )}
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-sunken">
              <span className="w-16 shrink-0 text-sm text-ink-2 tabular">{formatDate(m.date, false)}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="text-xs text-ink-3">
                  {m._count.decisions} decision{m._count.decisions === 1 ? "" : "s"} · {m._count.tasks} task{m._count.tasks === 1 ? "" : "s"}
                </span>
              </span>
              {m.processedAt ? (
                <span className="text-xs text-ink-2">Summarised</span>
              ) : (
                <span className="text-xs text-warn">Not summarised</span>
              )}
              <Byline founders={founders} byId={m.createdById} agent={m.createdAgent} size="xs" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
