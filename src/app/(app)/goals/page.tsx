import Link from "next/link";
import { NewGoal, ProgressBar, Roadmap } from "@/components/goals";
import { cardCls, formatDate, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listGoals } from "@/lib/services/goals";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const user = await requireUser();
  const [active, closed, founders] = await Promise.all([listGoals(), listGoals({ includeClosed: true }), listFounders()]);
  const finished = closed.filter((g) => g.status !== "active").sort((a, b) => +(b.achievedAt ?? b.updatedAt) - +(a.achievedAt ?? a.updatedAt));
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className={h1Cls}>Goals &amp; roadmap</h1>
        <p className="text-ink-2 mt-1">Link tasks to a goal and its progress fills in as they get done. Drag a goal to re-plan it.</p>
      </div>
      <div className={`${cardCls} p-3`}><NewGoal founders={founders} me={user.id} /></div>
      <Roadmap goals={active} founders={founders} />
      {finished.length > 0 && (
        <section className={cardCls}>
          <h2 className={`${h2Cls} px-4 py-3 border-b border-line`}>Achieved and dropped</h2>
          <ul className="divide-y divide-line">
            {finished.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken text-sm">
                  <span className="text-ink-3 tabular w-10">G-{g.number}</span>
                  <span className={`flex-1 ${g.status === "dropped" ? "line-through text-ink-3" : ""}`}>{g.title}</span>
                  <span className="w-40"><ProgressBar done={g.progress.done} total={g.progress.total} /></span>
                  <span className={`text-xs w-28 text-right ${g.status === "achieved" ? "text-accent font-medium" : "text-ink-3"}`}>
                    {g.status === "achieved" ? `Achieved ${g.achievedAt ? formatDate(g.achievedAt, false) : ""}` : "Dropped"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
