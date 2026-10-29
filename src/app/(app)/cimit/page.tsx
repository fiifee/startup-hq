import { ExternalLink } from "lucide-react";
import { CimitCheck, CimitSheetForm } from "@/components/cimit";
import { AutoRefresh } from "@/components/shell";
import { cardCls, h1Cls, h2Cls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readCimit, type Cimit, type CimitStage } from "@/lib/services/cimit";

export const metadata = { title: "CIMIT" };

const count = (s: CimitStage) => {
  const all = s.items.flat();
  return { done: all.filter((i) => i.done).length, total: all.length };
};

/** The CIMIT checklist, read live from its Google Sheet; ticks here are written back to it. */
export default async function CimitPage() {
  await requireUser();
  let sheet: Cimit | null = null;
  let error = "";
  try {
    sheet = await readCimit();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!sheet) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className={h1Cls}>CIMIT checklist</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className={`${cardCls} p-4`}><CimitSheetForm change={!!error} /></div>
      </div>
    );
  }

  const counts = sheet.stages.map(count);
  const current = counts.findIndex((c) => c.done < c.total);
  const done = counts.reduce((n, c) => n + c.done, 0);
  const total = counts.reduce((n, c) => n + c.total, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Picks up edits made in the sheet while this page is open. */}
      <AutoRefresh seconds={10} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1Cls}>CIMIT checklist</h1>
          <p className="text-sm text-ink-2 mt-1">
            <span className="tabular">{done} of {total}</span> done{current >= 0 && <> · now in <span className="text-ink">{sheet.stages[current].name}</span></>}
          </p>
        </div>
        <a href={sheet.url} target="_blank" rel="noreferrer" className="text-sm text-ink-2 hover:text-ink inline-flex items-center gap-1.5">
          Open in Google Sheets <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>

      {sheet.stages.map((stage, s) => {
        const { done, total } = counts[s];
        const complete = done === total;
        const body = (
          <div className="grid gap-x-6 gap-y-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            {sheet.tracks.map((track, t) => (
              <div key={track} className="min-w-0">
                <h3 className="text-xs font-medium text-ink-3 mb-1">{track}</h3>
                {stage.items[t].length ? (
                  stage.items[t].map((item) => <CimitCheck key={item.cell} item={item} />)
                ) : (
                  <p className="text-sm text-ink-3 py-1.5">Nothing at this stage</p>
                )}
              </div>
            ))}
          </div>
        );
        const head = (
          <div className="flex items-baseline gap-3 px-4 py-3">
            <h2 className={`${h2Cls} flex-1 min-w-0`}>
              {stage.name}
              <span className="block text-sm font-normal text-ink-2 tracking-normal">{stage.description}</span>
            </h2>
            <span className={`text-sm tabular shrink-0 ${complete ? "text-ok" : "text-ink-2"}`}>{done}/{total}</span>
          </div>
        );
        // Finished stages fold away; the current one and those after it stay open.
        return complete ? (
          <details key={stage.name} className={cardCls}>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-sunken rounded-lg">{head}</summary>
            {body}
          </details>
        ) : (
          <section key={stage.name} className={`${cardCls} ${s === current ? "border-line-strong" : ""}`}>
            {head}
            {body}
          </section>
        );
      })}

      <details className="text-sm text-ink-2">
        <summary className="cursor-pointer w-fit">Sheet settings</summary>
        <div className="mt-3 max-w-xl"><CimitSheetForm change /></div>
      </details>
    </div>
  );
}
