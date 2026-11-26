import { headers } from 'next/headers';
import { currentBusiness } from '../../lib/stark/businesses';
import StarkHeader from '../../components/stark-header';
import RecStatus from '../../components/rec-status';
import { loadFatigue, loadGoogle } from '../../lib/stark/context';
import {
  STATUS_LABEL, getStatuses, impactsFor, listRecs, previousWeek, weekStartOf,
  type Impact, type MeasureCtx, type StoredRec,
} from '../../lib/stark/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHIP: Record<string, string> = {
  done: 'bg-emerald-100 text-emerald-800', partly: 'bg-amber-100 text-amber-900', skip: 'bg-slate-100 text-slate-700', not: 'bg-red-100 text-red-800',
};
const PAGE: Record<string, string> = { google: 'Google', fatigue: 'Creative Fatigue' };
const inr = (v: number) => '₹' + Math.round(v).toLocaleString('en-IN');
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const addDays = (d: string, k: number) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);

export default async function ToolImpactPage({ searchParams }: { searchParams: { b?: string } }) {
  const business = currentBusiness(searchParams.b);
  const thisWeek = weekStartOf();
  let from = thisWeek;
  for (let i = 0; i < 4; i++) from = previousWeek(from);

  const ctx: MeasureCtx = {};
  const notes: string[] = [];
  try { ctx.meta = (await loadFatigue(business.key)).ctx; } catch (e) { notes.push(`Meta data unavailable: ${(e as Error).message}`); }
  try {
    const h = headers();
    const g = await loadGoogle(business.key, `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`);
    if (g) ctx.google = g.ctx;
  } catch (e) { notes.push(`Google data unavailable: ${(e as Error).message}`); }

  let recs: StoredRec[] = [];
  let statuses: Awaited<ReturnType<typeof getStatuses>> = {};
  let impacts: Record<string, Impact | null> = {};
  try {
    recs = await listRecs(business.key, from);
    statuses = await getStatuses(recs.map((r) => r.id));
    impacts = await impactsFor(recs, statuses, ctx);
  } catch (e) {
    notes.push(`Action tracking unavailable: ${(e as Error).message}`);
  }

  const unit = (r: StoredRec) => (r.metric === 'google_fo' ? 'first orders' : r.metric === 'google_orders' ? 'orders' : r.metric === 'meta_results' ? business.result.many : '');
  const st = (r: StoredRec) => (statuses[r.id] ? statuses[r.id].status : 'not');
  const isActed = (r: StoredRec) => st(r) === 'done' || st(r) === 'partly';
  const past = recs.filter((r) => r.weekStart < thisWeek);
  const current = recs.filter((r) => r.weekStart === thisWeek);

  // Totals over the finished weeks.
  const acted = past.filter(isActed);
  const notDone = past.filter((r) => st(r) === 'not');
  const extra: Record<string, number> = {};
  let saving = 0;
  acted.forEach((r) => {
    const m = impacts[r.id];
    if (!m || !m.due) return;
    if (m.resultsDelta !== null && unit(r)) extra[unit(r)] = (extra[unit(r)] || 0) + m.resultsDelta;
    if (m.saving !== null) saving += m.saving;
  });
  const extraText = Object.keys(extra).map((k) => `${extra[k] >= 0 ? '+' : ''}${extra[k]} ${k}`).join(' · ') || '—';

  const weeks: string[] = [];
  for (let w = from; w < thisWeek; w = addDays(w, 7)) weeks.push(w);
  const weekRows = weeks.map((w) => {
    const rs = past.filter((r) => r.weekStart === w);
    let sv = 0; const ex: Record<string, number> = {};
    rs.filter(isActed).forEach((r) => { const m = impacts[r.id]; if (m && m.due) { if (m.saving !== null) sv += m.saving; if (m.resultsDelta !== null && unit(r)) ex[unit(r)] = (ex[unit(r)] || 0) + m.resultsDelta; } });
    return {
      w, total: rs.length,
      done: rs.filter((r) => st(r) === 'done').length, partly: rs.filter((r) => st(r) === 'partly').length,
      not: rs.filter((r) => st(r) === 'not').length, skip: rs.filter((r) => st(r) === 'skip').length,
      text: rs.length ? `${Object.keys(ex).map((k) => `${ex[k] >= 0 ? '+' : ''}${ex[k]} ${k}`).join(' · ') || 'no results yet'} · ${inr(sv)}` : 'no recommendations saved',
    };
  });

  const wins = acted.filter((r) => impacts[r.id] && impacts[r.id]!.due && impacts[r.id]!.good)
    .sort((a, b) => (impacts[b.id]!.saving || 0) - (impacts[a.id]!.saving || 0)).slice(0, 5);
  const missed = notDone.filter((r) => impacts[r.id] && impacts[r.id]!.due && impacts[r.id]!.good === false).slice(0, 5);

  return (
    <>
      <StarkHeader business={business} path="/tool-impact" />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-900 lg:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Tool Impact</h1>
          <p className="text-sm text-slate-600">{business.name} · recommendations from Creative Fatigue and Google, what the team did, and what changed · last 4 weeks</p>
          {notes.map((n) => <p key={n} className="text-xs text-amber-800">{n}</p>)}
        </header>

        <section className="flex flex-col gap-4">
          <p className="max-w-4xl text-lg leading-relaxed">
            {past.length
              ? <>Last 4 weeks: STARK made <b>{past.length} recommendations</b>. The team acted on <b>{acted.length}</b> ({Math.round((acted.length / past.length) * 100)}%). Measured impact so far: <b>{extraText}</b>, <b>{inr(saving)}</b> estimated saving.</>
              : <>No finished weeks yet. Use the buttons on this week’s recommendations below; results appear here from next Monday.</>}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Recommendations" value={String(past.length)} note="finished weeks" />
            <Kpi label="Acted on" value={`${acted.length}`} note={`${past.filter((r) => st(r) === 'done').length} done · ${past.filter((r) => st(r) === 'partly').length} partly`} />
            <Kpi label="Not done" value={String(notDone.length)} note={`${missed.length} cost us money`} bad={notDone.length > 0} />
            <Kpi label="Extra results" value={extraText} note="from actions taken" good />
            <Kpi label="Estimated saving" value={inr(saving)} note="lower cost per result" good={saving >= 0} bad={saving < 0} />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Week by week</h2>
          {weekRows.map((w) => (
            <div key={w.w} className="grid grid-cols-[7rem_1fr_14rem] items-center gap-3 text-sm">
              <span className="font-medium">{day(w.w)}–{day(addDays(w.w, 6))}</span>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {w.total > 0 && <>
                  <div className="bg-emerald-600" style={{ width: `${(w.done / w.total) * 100}%` }} />
                  <div className="bg-amber-500" style={{ width: `${(w.partly / w.total) * 100}%` }} />
                  <div className="bg-slate-300" style={{ width: `${((w.not + w.skip) / w.total) * 100}%` }} />
                </>}
              </div>
              <span className="text-right tabular-nums text-slate-600">{w.text}</span>
            </div>
          ))}
          <div className="flex gap-4 text-xs text-slate-600"><span>■ <span className="text-emerald-700">Done</span></span><span>■ <span className="text-amber-700">Partly done</span></span><span>■ Not done / not relevant</span></div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <ListBox title="Top wins" empty="No measured wins yet." items={wins.map((r) => ({ id: r.id, text: `${r.verb}: ${r.title}`, value: impacts[r.id]!.headline, good: true }))} />
          <ListBox title="Missed: recommended, not done" empty="Nothing missed that cost money." items={missed.map((r) => ({ id: r.id, text: `${r.verb}: ${r.title}`, value: impacts[r.id]!.headline, good: false }))} />
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">This week’s recommendations · week of {day(thisWeek)}</h2>
          {current.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">None saved yet this week. They appear once the Creative Fatigue and Google pages have been opened.</p>}
          {current.map((r) => {
            const s = statuses[r.id];
            return (
              <article key={r.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">{PAGE[r.page]}</span>· {r.verb}</div>
                <p className="font-semibold leading-snug">{r.title}</p>
                <RecStatus id={r.id} initial={s ? { status: s.status, by: s.by, note: s.note, updatedAt: s.updatedAt } : null} />
              </article>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">All finished recommendations</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] table-fixed text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-[7rem] px-4 py-2.5 font-medium">Week</th>
                  <th className="px-4 py-2.5 font-medium">Recommendation</th>
                  <th className="w-[9rem] px-4 py-2.5 font-medium">Status</th>
                  <th className="w-[18rem] px-4 py-2.5 font-medium">What happened</th>
                  <th className="w-[9rem] px-4 py-2.5 text-right font-medium">Impact</th>
                </tr>
              </thead>
              <tbody>
                {past.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nothing yet.</td></tr>
                ) : past.map((r) => {
                  const m = impacts[r.id];
                  const k = st(r);
                  return (
                    <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-4 py-2.5 text-slate-600">{day(r.weekStart)}</td>
                      <td className="break-words px-4 py-2.5"><p className="text-xs text-slate-500">{PAGE[r.page]} · {r.verb}</p><p className="font-medium">{r.title}</p></td>
                      <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[k]}`}>{STATUS_LABEL[k]}</span>{statuses[r.id] && k !== 'not' && <p className="mt-1 text-xs text-slate-500">{statuses[r.id].by}</p>}</td>
                      <td className="px-4 py-2.5 text-xs leading-relaxed text-slate-700">{k === 'skip' ? 'Not measured.' : m && m.due ? m.summary : `Measuring: ready on ${day(m ? m.readyOn : addDays(r.weekStart, 7))}.`}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${m && m.due ? (m.good === false ? 'text-red-700' : m.good ? 'text-emerald-700' : '') : 'text-slate-400'}`}>{m && m.due ? m.headline : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          Recommendations are saved each week (frozen every Monday 6 AM IST). Impact compares the campaigns or ads a recommendation names for the 7 days
          before vs after the action; for “Not done”, the week of the recommendation vs the week before, to show what happened anyway. Saving = (cost per
          result before − after) × results after. These are estimates: seasonality, competitors and other changes also move the numbers.
        </footer>
      </main>
    </>
  );
}

function Kpi({ label, value, note, good, bad }: { label: string; value: string; note: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${bad ? 'text-red-700' : good ? 'text-emerald-700' : ''}`}>{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

function ListBox({ title, empty, items }: { title: string; empty: string; items: { id: string; text: string; value: string; good: boolean }[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : items.map((i) => (
        <div key={i.id} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm last:border-0">
          <span className="min-w-0 break-words">{i.text}</span>
          <span className={`whitespace-nowrap font-semibold tabular-nums ${i.good ? 'text-emerald-700' : 'text-red-700'}`}>{i.value}</span>
        </div>
      ))}
    </section>
  );
}
