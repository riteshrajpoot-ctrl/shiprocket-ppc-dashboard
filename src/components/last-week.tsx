import { STATUS_LABEL, getStatuses, impactsFor, listRecs, previousWeek, weekStartOf, type MeasureCtx, type RecPage } from '../lib/stark/actions';
import type { BusinessKey } from '../lib/stark/businesses';

const CHIP: Record<string, string> = {
  done: 'bg-emerald-100 text-emerald-800', partly: 'bg-amber-100 text-amber-900', skip: 'bg-slate-100 text-slate-700', not: 'bg-red-100 text-red-800',
};
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

// "What we did last week": last week's recommendations for this page, their status and measured impact.
export default async function LastWeek({ business, page, ctx }: { business: BusinessKey; page: RecPage; ctx: MeasureCtx }) {
  const last = previousWeek(weekStartOf());
  let recs, statuses, impacts;
  try {
    recs = (await listRecs(business, last, page)).filter((r) => r.weekStart === last);
    statuses = await getStatuses(recs.map((r) => r.id));
    impacts = await impactsFor(recs, statuses, ctx);
  } catch (e) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Couldn’t load last week’s actions: {(e as Error).message}</p>;
  }
  if (!recs.length) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What we did last week</h2>
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Nothing to review yet. Mark this week’s recommendations with the buttons below; their impact shows here next Monday.
        </p>
      </section>
    );
  }
  const acted = recs.filter((r) => statuses[r.id] && (statuses[r.id].status === 'done' || statuses[r.id].status === 'partly')).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">What we did last week</h2>
        <p className="text-sm text-slate-600">Week of {day(last)} · {acted} of {recs.length} actioned</p>
      </div>
      {recs.map((r) => {
        const s = statuses[r.id];
        const key = s ? s.status : 'not';
        const m = impacts[r.id];
        return (
          <article key={r.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1.4fr_1fr_0.7fr]">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold leading-snug">{r.verb}: {r.title}</p>
              <span className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[key]}`}>{STATUS_LABEL[key]}</span>
              <p className="text-xs text-slate-500">{s && key !== 'not' ? `${s.by} · ${when(s.updatedAt)}${s.note ? ` · “${s.note}”` : ''}` : 'No action recorded'}</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">
              {key === 'skip' ? 'Marked not relevant, so not measured.' : m && m.due ? m.summary : `Measuring: ready on ${day(m ? m.readyOn : last)}.`}
            </p>
            <div className="text-right">
              {m && m.due && (
                <>
                  <p className={`text-lg font-bold tabular-nums ${m.good === false ? 'text-red-700' : m.good ? 'text-emerald-700' : 'text-slate-700'}`}>{m.headline}</p>
                  <p className="text-xs text-slate-500">{key === 'done' || key === 'partly' ? '7 days after vs before' : 'what happened anyway'}</p>
                </>
              )}
            </div>
          </article>
        );
      })}
      <p className="text-xs text-slate-500">Impact compares the same campaigns or ads for the 7 days before and after the action. It’s an estimate: seasonality, competitors and other changes also move the numbers.</p>
    </section>
  );
}
