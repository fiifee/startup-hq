import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ActivityFeed } from "@/components/activity";
import { firstName } from "@/components/people";
import { cardCls, h1Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFounders } from "@/lib/services/people";
import { feedItems } from "@/lib/view";

export const metadata = { title: "Activity" };

export default async function ActivityPage(props: PageProps<"/activity">) {
  await requireUser();
  const sp = await props.searchParams;
  const who = typeof sp.who === "string" ? sp.who : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const founders = await listFounders();
  const where: Prisma.ActivityWhereInput = {};
  if (who) where.byId = who;
  if (kind === "ai") where.agent = { not: null };
  if (kind === "human") where.agent = null;
  const rows = await db.activity.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });

  const link = (patch: Record<string, string>) => `/activity?${new URLSearchParams({ who, kind, ...patch })}`;
  const chip = (active: boolean) => `h-8 px-3 rounded-full text-sm inline-flex items-center gap-1.5 border ${active ? "bg-ink text-canvas border-ink" : "border-line-strong text-ink-2 hover:text-ink hover:bg-sunken"}`;
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className={h1Cls}>Activity</h1>
        <p className="text-ink-2 mt-1">Every change, by whom. Hover a change to undo it.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={link({ who: "" })} className={chip(!who)}>Everyone</Link>
        {founders.map((f) => (
          <Link key={f.id} href={link({ who: f.id })} className={chip(who === f.id)}>
            <span className="w-2 h-2 rounded-full" style={{ background: f.color }} /> {firstName(f)}
          </Link>
        ))}
        <span className="w-px bg-line mx-1" />
        <Link href={link({ kind: "" })} className={chip(!kind)}>All</Link>
        <Link href={link({ kind: "human" })} className={chip(kind === "human")}>By hand</Link>
        <Link href={link({ kind: "ai" })} className={chip(kind === "ai")}>✦ By AI</Link>
      </div>
      <section className={cardCls}><ActivityFeed items={feedItems(rows)} founders={founders} /></section>
    </div>
  );
}
