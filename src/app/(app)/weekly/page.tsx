import Link from "next/link";
import { generateWeeklyAction } from "@/app/actions";
import { Markdown } from "@/components/markdown";
import { Byline } from "@/components/people";
import { btnPrimary, btnSecondary, cardCls, h1Cls, relative } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";
import { weeklyFacts } from "@/lib/services/weekly";

export const metadata = { title: "Weekly" };

export default async function WeeklyPage() {
  const user = await requireUser();
  const [founders, notes, facts, keys, digest] = await Promise.all([
    listFounders(),
    db.note.findMany({ where: { kind: "weekly", archivedAt: null }, orderBy: { createdAt: "desc" }, take: 52 }),
    weeklyFacts(),
    db.aiKey.count({ where: { userId: user.id } }),
    db.setting.findUnique({ where: { key: "digest.userId" } }),
  ]);
  const digestUser = founders.find((f) => f.id === digest?.value);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className={h1Cls}>Weekly summary</h1>
        <p className="text-ink-2 mt-1">
          Written every Monday morning{digestUser ? `, with ${digestUser.name ?? digestUser.email}'s AI key` : " from the data (no AI key chosen; pick one in Settings)"}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={generateWeeklyAction.bind(null, true)}>
          <button disabled={!keys} className={btnPrimary} title={keys ? "" : "Add an AI key in Settings"}>Write this week&apos;s with my AI</button>
        </form>
        <form action={generateWeeklyAction.bind(null, false)}>
          <button className={btnSecondary}>Facts only</button>
        </form>
      </div>

      <details className={cardCls}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">This week so far</summary>
        <div className="px-4 pb-4"><Markdown className="text-sm">{facts.markdown}</Markdown></div>
      </details>

      <ul className={`${cardCls} divide-y divide-line`}>
        {notes.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">No summaries yet.</li>}
        {notes.map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
              <span className="flex-1 font-medium">{n.title}</span>
              <span className="text-xs text-ink-3">{relative(n.createdAt)}</span>
              <Byline founders={founders} byId={n.createdById} agent={n.createdAgent} size="xs" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
