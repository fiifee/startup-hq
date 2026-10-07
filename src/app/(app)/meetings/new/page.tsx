import Link from "next/link";
import { createMeetingAction } from "@/app/actions";
import { TranscriptField } from "@/components/meeting-forms";
import { btnPrimary, cardCls, h1Cls, inputCls, labelCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Add meeting" };

export default async function NewMeetingPage() {
  await requireUser();
  const openAgenda = await db.agendaItem.count({ where: { meetingId: null, done: false } });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="text-sm text-ink-2"><Link href="/meetings" className="hover:text-ink">Meetings</Link> / New</div>
      <h1 className={h1Cls}>Add a meeting</h1>
      <form action={createMeetingAction} className={`${cardCls} p-4 md:p-5 space-y-4`}>
        <div className="grid sm:grid-cols-[1fr_180px] gap-3">
          <div>
            <label htmlFor="title" className={labelCls}>Title</label>
            <input id="title" name="title" required placeholder="Weekly sync" className={inputCls} />
          </div>
          <div>
            <label htmlFor="date" className={labelCls}>Date</label>
            <input id="date" name="date" type="date" defaultValue={today} className={inputCls} />
          </div>
        </div>
        <div>
          <span className={labelCls}>Transcript</span>
          <TranscriptField />
        </div>
        {openAgenda > 0 && (
          <p className="text-sm text-ink-2">The {openAgenda} open agenda topic{openAgenda === 1 ? "" : "s"} will be attached to this meeting.</p>
        )}
        <button className={btnPrimary}>Create meeting</button>
      </form>
    </div>
  );
}
