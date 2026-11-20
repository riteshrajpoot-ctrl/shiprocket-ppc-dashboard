import Link from 'next/link';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildInsights, getFatigueReport, RULES, VERDICT_RULES,
  type AdVerdict, type FatigueReport, type Verdict,
} from '../../lib/fatigue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function refreshData() {
  'use server';
  revalidateTag('creative-fatigue');
  redirect('/creative-fatigue');
}

const VERDICTS: { key: Verdict; chip: string; dot: string; note: string }[] = [
  { key: 'Cut', chip: 'bg-red-100 text-red-800', dot: '#dc2626', note: 'Pause or halve budget' },
  { key: 'Refresh', chip: 'bg-orange-100 text-orange-900', dot: '#ea580c', note: 'New hook, same offer' },
  { key: 'Watch', chip: 'bg-amber-100 text-amber-900', dot: '#d97706', note: 'Slipping or costly' },
  { key: 'Scale', chip: 'bg-emerald-100 text-emerald-800', dot: '#059669', note: 'Cheap and fresh: add budget' },
  { key: 'Keep', chip: 'bg-sky-100 text-sky-900', dot: '#0284c7', note: 'Steady' },
  { key: 'Learning', chip: 'bg-violet-100 text-violet-800', dot: '#7c3aed', note: 'Under 14 days' },
  { key: 'Low delivery', chip: 'bg-slate-100 text-slate-700', dot: '#94a3b8', note: 'Too small to judge' },
];
const vstyle = (v: Verdict) => VERDICTS.find((x) => x.key === v)!;

const LEVEL = {
  Critical: 'border-red-300 bg-red-50 text-red-950',
  Warning: 'border-amber-300 bg-amber-50 text-amber-950',
  Watch: 'border-slate-200 bg-white text-slate-900',
} as const;
const LEVEL_CHIP = { Critical: 'bg-red-600 text-white', Warning: 'bg-amber-500 text-white', Watch: 'bg-slate-200 text-slate-800' } as const;
const VERB_CHIP: Record<string, string> = {
  Cut: 'bg-red-100 text-red-800', 'Shift budget': 'bg-emerald-100 text-emerald-800', Scale: 'bg-emerald-100 text-emerald-800',
  Refresh: 'bg-orange-100 text-orange-900', Launch: 'bg-violet-100 text-violet-800', Consolidate: 'bg-slate-100 text-slate-700',
};

const SORTS = [
  { key: 'urgent', label: 'Most urgent' },
  { key: 'spend', label: 'Highest spend (7d)' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'newest', label: 'Newest first' },
];

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYear = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const ist = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
const ageLabel = (n: number | null) => (n === null ? '—' : n < 60 ? `${n} days` : `${Math.round(n / 30)} months`);
const signed = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}%`);

function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null) return <span className="text-xs text-slate-400">no prior week</span>;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  return <span className={`text-xs font-medium ${Math.abs(pct) < 3 ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-700'}`}>{signed(pct)} vs prior week</span>;
}

// Creative map: 7-day spend (x) against CPI relative to peers (y). Below the line = cheaper than the median.
function CreativeMap({ ads }: { ads: AdVerdict[] }) {
  const pts = ads.filter((a) => a.cpiVsMedian !== null && a.spend7 > 0);
  if (pts.length < 3) return <p className="text-sm text-slate-500">Not enough ads with installs to plot yet.</p>;
  const W = 760, H = 320, L = 48, Rm = 16, T = 16, B = 40;
  const maxX = Math.max(...pts.map((a) => a.spend7)) * 1.05;
  const maxY = 3;
  const x = (v: number) => L + (v / maxX) * (W - L - Rm);
  const y = (v: number) => T + (1 - Math.min(v, maxY) / maxY) * (H - T - B);
  const midX = x(maxX / 2);
  const labelled = pts.slice().sort((a, b) => b.spend7 - a.spend7).slice(0, 5).map((a) => a.adId);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Scatter of ads by 7-day spend and CPI relative to the median">
      <rect x={L} y={T} width={midX - L} height={y(1) - T} fill="#fef2f2" />
      <rect x={midX} y={T} width={W - Rm - midX} height={y(1) - T} fill="#fee2e2" />
      <rect x={L} y={y(1)} width={midX - L} height={H - B - y(1)} fill="#f0fdf4" />
      <rect x={midX} y={y(1)} width={W - Rm - midX} height={H - B - y(1)} fill="#ecfdf5" />
      <text x={L + 8} y={T + 16} fontSize="11" fill="#991b1b">Small and costly: fix or drop</text>
      <text x={W - Rm - 8} y={T + 16} fontSize="11" fill="#991b1b" textAnchor="end">Money leaks: cut first</text>
      <text x={L + 8} y={H - B - 8} fontSize="11" fill="#166534">Hidden winners: scale up</text>
      <text x={W - Rm - 8} y={H - B - 8} fontSize="11" fill="#166534" textAnchor="end">Workhorses: protect, prepare backups</text>
      <line x1={L} x2={W - Rm} y1={y(1)} y2={y(1)} stroke="#64748b" strokeDasharray="4 4" />
      <text x={L - 6} y={y(1) + 4} fontSize="10" fill="#475569" textAnchor="end">median</text>
      <text x={L - 6} y={y(3) + 4} fontSize="10" fill="#475569" textAnchor="end">3×</text>
      <text x={L - 6} y={y(2) + 4} fontSize="10" fill="#475569" textAnchor="end">2×</text>
      <text x={L - 6} y={y(0) + 4} fontSize="10" fill="#475569" textAnchor="end">0</text>
      <line x1={L} x2={W - Rm} y1={H - B} y2={H - B} stroke="#cbd5e1" />
      <text x={L} y={H - B + 16} fontSize="10" fill="#475569">₹0</text>
      <text x={W - Rm} y={H - B + 16} fontSize="10" fill="#475569" textAnchor="end">{inr(maxX)}</text>
      <text x={(L + W) / 2} y={H - 6} fontSize="11" fill="#475569" textAnchor="middle">Spend, last 7 days →</text>
      {pts.map((a) => (
        <g key={a.adId}>
          <circle cx={x(a.spend7)} cy={y(a.cpiVsMedian as number)} r={7} fill={vstyle(a.verdict).dot} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5}>
            <title>{`${a.adName}\n${a.verdict}: ${a.why}\n${inr(a.spend7)} · ${a.installs7} installs · CPI ${a.cpi7 !== null ? inr(a.cpi7) : '—'} (${a.cpiVsMedian}× median)`}</title>
          </circle>
          {labelled.indexOf(a.adId) >= 0 && (
            <text x={x(a.spend7) + 10} y={y(a.cpiVsMedian as number) + 4} fontSize="10" fill="#0f172a">
              {a.adName.length > 28 ? a.adName.slice(0, 27) + '…' : a.adName}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default async function CreativeFatiguePage({ searchParams }: { searchParams: { v?: string; sort?: string } }) {
  let data: FatigueReport;
  try {
    data = await getFatigueReport();
  } catch (e) {
    const msg = (e as Error).message;
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Creative fatigue</h1>
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-5 text-sm text-red-900">
          <p className="font-medium">Couldn’t read Meta ad data.</p>
          <p className="mt-1">{msg}</p>
          {/token|session|OAuth/i.test(msg) && (
            <p className="mt-2">The Meta token in Vercel looks invalid. Replace META_ACCESS_TOKEN with a System User token set to never expire, then redeploy.</p>
          )}
        </div>
      </main>
    );
  }

  const vf = VERDICTS.some((v) => v.key === searchParams.v) ? (searchParams.v as Verdict) : null;
  const sort = SORTS.some((s) => s.key === searchParams.sort) ? searchParams.sort! : 'urgent';
  const ins = buildInsights(data.ads, data.days, data.windowEnd);
  const order = VERDICTS.map((v) => v.key);
  const age = (a: AdVerdict) => (a.ageDays === null ? -1 : a.ageDays);
  const list = ins.ads
    .filter((a) => !vf || a.verdict === vf)
    .slice()
    .sort((a, b) =>
      sort === 'spend' ? b.spend7 - a.spend7
        : sort === 'oldest' ? age(b) - age(a)
        : sort === 'newest' ? age(a) - age(b)
        : order.indexOf(a.verdict) - order.indexOf(b.verdict) || b.spend7 - a.spend7);
  const count = (v: Verdict) => ins.ads.filter((a) => a.verdict === v).length;
  const link = (v: string | null, so: string = sort) =>
    `/creative-fatigue?${new URLSearchParams({ ...(v ? { v } : {}), sort: so }).toString()}#ads`;
  const tw = ins.thisWeek;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-900 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Creative fatigue</h1>
          <p className="text-sm text-slate-600">
            Meta ads · last 7 days to {day(data.windowEnd)}, compared with the week before and each ad’s first week · updated {ist(data.fetchedAt)}
          </p>
        </div>
        <form action={refreshData}>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:border-slate-500">Refresh data</button>
        </form>
      </header>


      {/* Verdict */}
      <section className="flex flex-col gap-4">
        <p className="max-w-4xl text-lg leading-relaxed">{ins.headline}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Spend, 7 days</p>
            <p className="text-2xl font-semibold tabular-nums">{inr(tw.spend)}</p>
            <Delta pct={ins.change.spendPct} goodWhenUp={true} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Installs, 7 days</p>
            <p className="text-2xl font-semibold tabular-nums">{tw.installs.toLocaleString('en-IN')}</p>
            <Delta pct={ins.change.installsPct} goodWhenUp={true} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Cost per install</p>
            <p className="text-2xl font-semibold tabular-nums">{tw.cpi !== null ? inr(tw.cpi) : '—'}</p>
            <Delta pct={ins.change.cpiPct} goodWhenUp={false} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">CTR</p>
            <p className="text-2xl font-semibold tabular-nums">{tw.ctr !== null ? `${tw.ctr}%` : '—'}</p>
            <Delta pct={ins.change.ctrPct} goodWhenUp={true} />
          </div>
          <div className={`rounded-lg border p-4 ${ins.wasted7 ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <p className="text-sm text-slate-500">Spend on ads to cut</p>
            <p className={`text-2xl font-semibold tabular-nums ${ins.wasted7 ? 'text-red-700' : ''}`}>{inr(ins.wasted7)}</p>
            <span className="text-xs text-slate-500">last 7 days</span>
          </div>
        </div>
      </section>

      {/* Alarms */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Alarms</h2>
        {ins.alarms.length === 0 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">All clear: no cost spikes, tired ads or pipeline gaps this week.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {ins.alarms.map((a, i) => (
              <li key={i} className={`flex flex-col gap-1.5 rounded-lg border p-4 ${LEVEL[a.level]}`}>
                <span className={`self-start rounded px-2 py-0.5 text-xs font-semibold ${LEVEL_CHIP[a.level]}`}>{a.level}</span>
                <p className="font-semibold leading-snug">{a.title}</p>
                <p className="text-sm opacity-90">{a.detail}</p>
                <p className="text-sm"><span className="font-semibold">Do:</span> {a.action}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Actions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recommended actions, in order</h2>
        {ins.recommendations.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Nothing to change this week. Keep the current mix and check again after the next refresh.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {ins.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{i + 1}</span>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${VERB_CHIP[r.verb]}`}>{r.verb}</span>
                    <span className="font-semibold">{r.title}</span>
                  </div>
                  <p className="text-sm text-slate-700">{r.detail}</p>
                  <p className="text-sm font-medium text-emerald-800">{r.impact}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Map */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Creative map</h2>
          <p className="text-sm text-slate-600">Each dot is an ad. Further right = more spend; higher = costlier per install than its peers. Hover a dot for details.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <CreativeMap ads={ins.ads} />
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
            {VERDICTS.slice(0, 5).map((v) => (
              <span key={v.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.dot }} />{v.key}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Table */}
      <section id="ads" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Every live ad {vf && <span className="text-base font-normal text-slate-500">· {vf}</span>}</h2>
          <nav aria-label="Sort" className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">Sort:</span>
            {SORTS.map((s) => (
              <Link key={s.key} href={link(vf, s.key)}
                className={`rounded-full border px-2.5 py-1 ${s.key === sort ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
        <nav aria-label="Verdict" className="flex flex-wrap gap-1.5">
          {VERDICTS.map((v) => (
            <Link key={v.key} href={link(vf === v.key ? null : v.key)} title={v.note}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${vf === v.key ? 'border-slate-900 ring-1 ring-slate-900' : 'border-transparent'} ${v.chip}`}>
              {v.key} · {count(v.key)}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium">Ad</th>
                <th className="px-4 py-2.5 font-medium">Verdict and why</th>
                <th className="px-4 py-2.5 font-medium">Launched</th>
                <th className="px-4 py-2.5 text-right font-medium">Last 7 days</th>
                <th className="px-4 py-2.5 text-right font-medium">CPI vs peers</th>
                <th className="px-4 py-2.5 text-right font-medium">Lifetime</th>
                <th className="px-4 py-2.5 text-right font-medium">CTR first wk → now</th>
                <th className="px-4 py-2.5 text-right font-medium">Freq 7d</th>
                <th className="px-4 py-2.5 font-medium">Fatigue</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">No ads in this view.</td></tr>
              ) : list.map((a) => (
                <tr key={a.adId} className="border-b border-slate-100 align-top last:border-0">
                  <td className="max-w-[16rem] px-4 py-2.5">
                    <p className="font-medium">{a.adName}</p>
                    <p className="text-xs text-slate-500">{a.campaignName}</p>
                  </td>
                  <td className="max-w-[17rem] px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vstyle(a.verdict).chip}`}>{a.verdict}</span>
                    <p className="mt-1 text-xs text-slate-600">{a.why}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {a.launchDate ? (<><p>{dayYear(a.launchDate)}</p><p className="text-xs text-slate-500">{ageLabel(a.ageDays)} old</p></>) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    <p>{inr(a.spend7)}</p>
                    <p className="text-xs text-slate-500">{a.installs7} installs · CPI {a.cpi7 !== null ? inr(a.cpi7) : '—'}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {a.cpiVsMedian !== null ? (
                      <span className={a.cpiVsMedian >= VERDICT_RULES.watchCpiRatio ? 'font-semibold text-red-700' : a.cpiVsMedian <= VERDICT_RULES.scaleCpiRatio ? 'font-semibold text-emerald-700' : ''}>
                        {a.cpiVsMedian}×
                      </span>
                    ) : '—'}
                    {a.peerMedianCpi !== null && <p className="text-xs text-slate-500">median {inr(a.peerMedianCpi)}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {a.lifetimeSpend !== null ? (<><p>{inr(a.lifetimeSpend)}</p><p className="text-xs text-slate-500">{a.lifetimeInstalls} installs · CPI {a.lifetimeCpi !== null ? inr(a.lifetimeCpi) : '—'}</p></>) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {a.ctrBase !== null && a.ctrNow !== null ? `${a.ctrBase}% → ${a.ctrNow}%` : '—'}
                    {a.ctrChangePct !== null && <p className={`text-xs ${a.ctrChangePct < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{signed(a.ctrChangePct)}</p>}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${(a.frequency7 ?? 0) >= VERDICT_RULES.highFrequency ? 'font-semibold text-red-700' : ''}`}>{a.frequency7 ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                    <p className="font-medium">{a.stage}{a.score !== null ? ` · ${a.score}` : ''}</p>
                    {a.fatigueInDays !== null && <p className={a.fatigueInDays <= VERDICT_RULES.forecastDays ? 'text-red-700' : 'text-slate-500'}>tires in ~{a.fatigueInDays} days</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        How verdicts work: each ad’s 7-day CPI is compared with the median CPI of all live ads in this account. Cut = CPI {VERDICT_RULES.cutCpiRatio}×
        the median with {inr(VERDICT_RULES.cutMinSpend7)}+ spend, zero installs on real spend, or fatigue score {RULES.stages.dead}+. Refresh = fatigue score{' '}
        {RULES.stages.fatigued}+. Scale = CPI {VERDICT_RULES.scaleCpiRatio}× the median or lower, {VERDICT_RULES.scaleMinInstalls7}+ installs and frequency under{' '}
        {VERDICT_RULES.scaleMaxFrequency}. Watch = slipping, costlier than peers ({VERDICT_RULES.watchCpiRatio}×+), or forecast to tire within{' '}
        {VERDICT_RULES.forecastDays} days. The fatigue score compares each ad with its own first week: CTR drop 40%, frequency 25%, CPI rise 20%, CPM rise 15%.
        “Tires in” extends the last 14 days’ CTR trend to the point where CTR is 30% below the first week. Budget-shift install gains are estimates.
        All thresholds are starting values to tune after 2–3 weeks.
      </footer>
    </main>
  );
}
