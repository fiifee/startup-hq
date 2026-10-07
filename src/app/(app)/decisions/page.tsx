import Link from "next/link";
import { DecisionRow, NewDecision } from "@/components/decisions";
import { cardCls, h1Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listDecisions } from "@/lib/services/decisions";
import { listFounders } from "@/lib/services/people";

export const metadata = { title: "Decisions" };

export default async function DecisionsPage(props: PageProps<"/decisions">) {
  await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [decisions, founders] = await Promise.all([listDecisions({ search: q || undefined, limit: 500 }), listFounders()]);
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/brief#decisions" className="text-sm text-ink-2 hover:text-ink">← Brief</Link>
      <div>
        <h1 className={h1Cls}>Decision log</h1>
        <p className="text-ink-2 mt-1">What you agreed and why, so nobody has to remember it.</p>
      </div>
      <div className={`${cardCls} p-3`}><NewDecision /></div>
      <form>
        <input name="q" defaultValue={q} placeholder="Search decisions…" aria-label="Search decisions" className="h-9 px-3 rounded-md border border-line bg-surface text-sm w-full sm:w-72 focus:outline-none focus:border-accent" />
      </form>
      <ul className={`${cardCls} divide-y divide-line`}>
        {decisions.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">{q ? "No matches." : "No decisions yet. They also come in from meeting summaries."}</li>}
        {decisions.map((d) => <DecisionRow key={d.id} decision={d} founders={founders} />)}
      </ul>
    </div>
  );
}
