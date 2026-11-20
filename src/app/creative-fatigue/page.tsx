import Link from 'next/link';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { getFatigueReport, RULES, type AdFatigue, type FatigueReport, type Stage } from '../../lib/fatigue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function refreshData() {
  'use server';
  revalidateTag('creative-fatigue');
  redirect('/creative-fatigue');
}

const STAGES: { key: Stage; tone: string; chip: string; note: string }[] = [
  { key: 'Dead', tone: 'text-red-700', chip: 'bg-red-100 text-red-800', note: 'Pause and replace' },
  { key: 'Fatigued', tone: 'text-orange-700', chip: 'bg-orange-100 text-orange-900', note: 'Refresh now' },
  { key: 'Auction shift', tone: 'text-violet-700', chip: 'bg-violet-100 text-violet-800', note: 'Whole ad set dropped' },
  { key: 'Watch', tone: 'text-amber-700', chip: 'bg-amber-100 text-amber-900', note: 'Starting to slip' },
  { key: 'Fresh', tone: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-800', note: 'Performing well' },
  { key: 'Too little data', tone: 'text-slate-600', chip: 'bg-slate-100 text-slate-700', note: 'Not enough impressions' },
  { key: 'Too new', tone: 'text-slate-600', chip: 'bg-slate-100 text-slate-700', note: 'Live under 14 days' },
];
const chipFor = (s: Stage) => STAGES.find((x) => x.key === s)?.chip ?? 'bg-slate-100 text-slate-700';

const SIDES = [
  { key: 'all', label: 'All ads' },
  { key: 'Demand', label: 'Demand (Quick Delivery)' },
  { key: 'Supply', label: 'Supply (Quick Partner)' },
];

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
const signed = (n: number | null, suffix = '%') => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}${suffix}`);

export default async function CreativeFatiguePage({ searchParams }: { searchParams: { stage?: string; side?: string } }) {
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

  const side = SIDES.some((s) => s.key === searchParams.side) ? searchParams.side! : 'all';
  const stage = STAGES.some((s) => s.key === searchParams.stage) ? (searchParams.stage as Stage) : null;
  const inSide = data.ads.filter((a) => side === 'all' || a.side === side);
  const list = inSide.filter((a) => !stage || a.stage === stage);
  const count = (s: Stage) => inSide.filter((a) => a.stage === s).length;
  const alarms = inSide.filter((a) => a.stage === 'Dead' || a.stage === 'Fatigued').slice(0, 6);
  const atRisk = inSide.filter((a) => a.stage === 'Dead' || a.stage === 'Fatigued').reduce((s, a) => s + a.spend7, 0);
  const link = (st: string | null, sd: string) => `/creative-fatigue?${new URLSearchParams({ ...(st ? { stage: st } : {}), side: sd }).toString()}#ads`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-900 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Creative fatigue</h1>
          <p className="text-sm font-medium text-slate-700">
            Meta ads live in the last {RULES.activeWithinDays} days · data {day(data.windowStart)} – {day(data.windowEnd)}
          </p>
          <p className="text-xs text-slate-500">Last updated {ist(data.fetchedAt)} · recalculated every 3 hours</p>
        </div>
        <form action={refreshData}>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:border-slate-500">
            Refresh data
          </button>
        </form>
      </header>

      <nav aria-label="Side" className="flex flex-wrap gap-1.5">
        {SIDES.map((s) => (
          <Link
            key={s.key}
            href={link(stage, s.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${s.key === side ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Stages" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s) => (
          <Link
            key={s.key}
            href={link(stage === s.key ? null : s.key, side)}
            className={`flex flex-col gap-1 rounded-lg border bg-white p-3 hover:border-slate-400 ${stage === s.key ? 'border-slate-900' : 'border-slate-200'}`}
          >
            <span className={`text-xs font-medium ${s.tone}`}>{s.key}</span>
            <span className="text-2xl font-semibold tabular-nums">{count(s.key)}</span>
            <span className="text-xs text-slate-500">{s.note}</span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Needs action</h2>
          {atRisk > 0 && <p className="text-sm text-slate-600">{inr(atRisk)} spent on tired ads in the last 7 days</p>}
        </div>
        {alarms.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No fatigued or dead ads right now.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {alarms.map((a) => (
              <li key={a.adId} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${chipFor(a.stage)}`}>{a.stage} · score {a.score}</span>
                  <span className="text-slate-500">{a.side}</span>
                  <span className="text-slate-500">· {inr(a.spend7)} in 7 days</span>
                </div>
                <p className="font-medium leading-snug">{a.adName}</p>
                <p className="text-xs text-slate-500">{a.campaignName} › {a.adsetName}</p>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {a.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="text-sm"><span className="font-medium">Action:</span> {a.action}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="ads" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          All live ads {stage && <span className="text-base font-normal text-slate-500">· {stage}</span>}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium">Ad</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 text-right font-medium">CTR first wk → now</th>
                <th className="px-4 py-2.5 text-right font-medium">Freq 7d</th>
                <th className="px-4 py-2.5 text-right font-medium">CPI change</th>
                <th className="px-4 py-2.5 text-right font-medium">CPM change</th>
                <th className="px-4 py-2.5 text-right font-medium">Days live</th>
                <th className="px-4 py-2.5 text-right font-medium">Spend 7d</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No ads in this view.</td></tr>
              ) : (
                list.map((a: AdFatigue) => (
                  <tr key={a.adId} className="border-b border-slate-100 align-top last:border-0">
                    <td className="max-w-sm px-4 py-2.5">
                      <p className="font-medium">{a.adName}</p>
                      <p className="text-xs text-slate-500">{a.side} · {a.campaignName}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipFor(a.stage)}`}>{a.stage}</span>
                      {a.score !== null && <span className="ml-1.5 text-xs text-slate-500">{a.score}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                      {a.ctrBase !== null && a.ctrNow !== null ? `${a.ctrBase}% → ${a.ctrNow}%` : '—'}
                      {a.ctrChangePct !== null && <span className={`ml-1 text-xs ${a.ctrChangePct < 0 ? 'text-red-700' : 'text-emerald-700'}`}>({signed(a.ctrChangePct)})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.frequency7 ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{signed(a.cpiChangePct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{signed(a.cpmChangePct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.olderThanWindow ? `${a.daysLive}+` : a.daysLive}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{inr(a.spend7)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        How it’s scored: each ad is compared with its own first week. Score = CTR drop 40%, 7-day frequency 25%, cost per install
        rise 20%, CPM rise 15% (signals without enough data are left out). Stages: under {RULES.stages.watch} Fresh, {RULES.stages.watch}–
        {RULES.stages.fatigued - 1} Watch, {RULES.stages.fatigued}–{RULES.stages.dead - 1} Fatigued, {RULES.stages.dead}+ Dead. Ads need{' '}
        {RULES.minImpressions.toLocaleString('en-IN')} impressions in both weeks. If every ad in an ad set drops at least{' '}
        {RULES.auctionShiftCtrDrop * 100}% together, it’s marked “Auction shift”. “Days live” with a + means the ad started before this
        data window. Thresholds are starting values to tune after 2–3 weeks.
      </footer>
    </main>
  );
}
