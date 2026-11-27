import Link from 'next/link';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentBusiness } from '../../lib/stark/businesses';
import StarkHeader from '../../components/stark-header';
import { RULES, type CampaignRow, type Verdict } from '../../lib/google/insights';
import { loadGoogle } from '../../lib/stark/context';
import { getDismissed, getStatuses, syncRecs, type StatusRow, type StoredRec } from '../../lib/stark/actions';
import { detectChanges, type DetectedChange } from '../../lib/stark/detect';
import RecStatus from '../../components/rec-status';
import LastWeek from '../../components/last-week';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function refreshData() {
  'use server';
  revalidateTag('google-gap');
  redirect('/google-gap');
}

const VERDICT: Record<Verdict, string> = {
  Scale: 'bg-emerald-100 text-emerald-800',
  Keep: 'bg-sky-100 text-sky-900',
  Watch: 'bg-amber-100 text-amber-900',
  Cut: 'bg-red-100 text-red-800',
  Check: 'bg-violet-100 text-violet-800',
};
const LEVEL = {
  Critical: { box: 'border-red-300 bg-red-50', chip: 'bg-red-600 text-white' },
  Warning: { box: 'border-amber-300 bg-amber-50', chip: 'bg-amber-500 text-white' },
  Watch: { box: 'border-slate-200 bg-white', chip: 'bg-slate-200 text-slate-800' },
} as const;
const VERB: Record<string, string> = {
  'Shift budget': 'bg-emerald-100 text-emerald-800', Cut: 'bg-red-100 text-red-800', Decide: 'bg-violet-100 text-violet-800',
  Refresh: 'bg-orange-100 text-orange-900', Fix: 'bg-amber-100 text-amber-900',
};

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ist = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
const chg = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : Math.round((a / b - 1) * 1000) / 10);
const short = (c: string) => c.replace(/^sr_quick_/i, '');

function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null) return <span className="text-xs text-slate-400">no prior week</span>;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  return <span className={`text-xs font-medium ${Math.abs(pct) < 3 ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-700'}`}>{pct > 0 ? '+' : ''}{pct}% vs prior week</span>;
}

function Placeholder({ title, children, business, }: { title: string; children: React.ReactNode; business: ReturnType<typeof currentBusiness> }) {
  return (
    <>
      <StarkHeader business={business} path="/google-gap" />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8 text-slate-900">
        <h1 className="text-2xl font-semibold">Google Keywords Gap &amp; Wasted Spend</h1>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-5 text-sm text-orange-950">
          <p className="font-semibold">{title}</p>
          <div className="mt-1">{children}</div>
        </div>
      </main>
    </>
  );
}

export default async function GoogleGapPage({ searchParams }: { searchParams: { b?: string; t?: string; low?: string; all?: string } }) {
  const business = currentBusiness(searchParams.b);
  if (business.key !== 'quick') {
    return (
      <Placeholder business={business} title="Not connected yet for Shiprocket LM">
        The daily Google Ads script is set up for Shiprocket Quick first. LM ({business.googleCustomerId}) gets the same script once Quick is signed off.
      </Placeholder>
    );
  }

  const h = headers();
  const base = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
  let load;
  try {
    load = await loadGoogle('quick', base);
  } catch (e) {
    return <Placeholder business={business} title="Couldn’t read the Google data">{(e as Error).message}</Placeholder>;
  }
  if (!load) {
    return <Placeholder business={business} title="Waiting for the first data">The Google Ads script hasn’t sent anything yet. It runs daily between 5 and 6 AM, or run it once by hand in Google Ads.</Placeholder>;
  }
  const { snap, ins, branchNote } = load;

  // Save this week's recommendations (first sighting keeps their "before" numbers) and load their statuses.
  let stored: StoredRec[] = [];
  let statuses: Record<string, StatusRow> = {};
  let detected: Record<string, DetectedChange> = {};
  let trackNote = '';
  try {
    stored = await syncRecs(business.key, load.recs, { google: load.ctx });
    statuses = await getStatuses(stored.map((r) => r.id));
    detected = detectChanges(stored, statuses, snap.tabs, await getDismissed(stored.map((r) => r.id)));
  } catch (e) {
    trackNote = `Action tracking is unavailable right now (${(e as Error).message}).`;
  }
  const T = ins.totals;
  const tab = searchParams.t === 'install' || searchParams.t === 'engage' ? searchParams.t : 'all';
  const lowTab = searchParams.low === 'image' || searchParams.low === 'video' ? searchParams.low : 'text';
  const showAll = searchParams.all === '1';
  const list = ins.campaigns.filter((c) => tab === 'all' || c.kind === tab);
  const lows = ins.assets.low.filter((l) => l.kind === lowTab);
  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ t: tab, low: lowTab, ...(showAll ? { all: '1' } : {}), ...p });
    return `/google-gap?${q.toString()}`;
  };
  const cpi = T.installs ? Math.round(T.spend / T.installs) : null;
  const cpiPrev = T.installsPrev ? Math.round(T.spendPrev / T.installsPrev) : null;
  const foNow = T.firstOrderSource === 'Branch' ? (T.firstOrdersBranch as number) : T.firstOrdersGoogle;
  const foPrev = T.firstOrderSource === 'Branch' ? T.firstOrdersBranchPrev : T.firstOrdersGooglePrev;

  return (
    <>
      <StarkHeader business={business} path="/google-gap" />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-900 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">Google: Wasted Spend &amp; Campaign Health</h1>
            <p className="text-sm text-slate-600">
              {business.name} · Google Ads {business.googleCustomerId} · {day(ins.weekStart)}–{day(ins.weekEnd)} vs the week before · script run {ist(snap.generatedAt || snap.receivedAt)}
            </p>
          </div>
          <form action={refreshData}>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:border-slate-500">Refresh data</button>
          </form>
        </header>

        <section className="flex flex-col gap-4">
          <p className="max-w-4xl text-lg leading-relaxed">{ins.headline}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Spend, 7 days" value={inr(T.spend)} delta={<Delta pct={chg(T.spend, T.spendPrev)} goodWhenUp={true} />} />
            <Kpi label={`First orders (${T.firstOrderSource})`} value={num(foNow)} delta={<Delta pct={chg(foNow, foPrev)} goodWhenUp={true} />}
              sub={T.firstOrderSource === 'Branch' ? `Google counts ${num(T.firstOrdersGoogle)}` : undefined} />
            <Kpi label="Cost per first order" value={T.costPerFirstOrder !== null ? inr(T.costPerFirstOrder) : '—'} delta={<Delta pct={chg(T.costPerFirstOrder, T.costPerFirstOrderPrev)} goodWhenUp={false} />} />
            <Kpi label="Installs (Google, first opens)" value={num(T.installs)} delta={<Delta pct={chg(T.installs, T.installsPrev)} goodWhenUp={true} />}
              sub={T.installsBranch !== null ? `Branch counts ${num(T.installsBranch)} for matched campaigns` : undefined} />
            <Kpi label="Cost per install" value={cpi !== null ? inr(cpi) : '—'} delta={<Delta pct={chg(cpi, cpiPrev)} goodWhenUp={false} />} />
          </div>
          {branchNote && <p className="text-xs text-amber-800">{branchNote}</p>}
          {trackNote && <p className="text-xs text-amber-800">{trackNote}</p>}
        </section>

        <LastWeek business={business.key} page="google" ctx={{ google: load.ctx }} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Alarms</h2>
            {ins.alarms.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">All clear this week.</p>
            ) : ins.alarms.map((a, i) => (
              <article key={i} className={`flex min-w-0 flex-col gap-1.5 break-words rounded-lg border p-4 ${LEVEL[a.level].box}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${LEVEL[a.level].chip}`}>{a.level}</span>
                  <span className="font-semibold leading-snug">{a.title}</span>
                </div>
                <p className="text-sm text-slate-700">{a.detail}</p>
                <p className="text-sm"><span className="font-semibold">Do:</span> {a.action}</p>
              </article>
            ))}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Do this week</h2>
            {ins.actions.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Nothing to change this week.</p>
            ) : ins.actions.map((r, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-1 break-words">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${VERB[r.verb]}`}>{r.verb}</span>
                    <span className="font-semibold">{r.title}</span>
                  </div>
                  <p className="text-sm text-slate-700">{r.detail}</p>
                  <p className="text-sm font-medium text-emerald-800">{r.impact}</p>
                  {stored[i] && (
                    <div className="mt-1">
                      <RecStatus id={stored[i].id} initial={statuses[stored[i].id] || null} detected={detected[stored[i].id] || null} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Campaigns</h2>
            <nav aria-label="Campaign type" className="flex flex-wrap gap-1.5">
              {([['all', `All campaigns · ${ins.campaigns.length}`], ['install', `Install · ${ins.campaigns.filter((c) => c.kind === 'install').length}`], ['engage', `Engagement · ${ins.campaigns.filter((c) => c.kind === 'engage').length}`]] as const).map(([k, label]) => (
                <Link key={k} href={link({ t: k })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${k === tab ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[1150px] table-fixed text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-[17rem] px-4 py-2.5 font-medium">Campaign</th>
                  <th className="w-[15rem] px-4 py-2.5 font-medium">Verdict and why</th>
                  <th className="w-[8rem] px-4 py-2.5 text-right font-medium">Spend, 7 days</th>
                  <th className="w-[9rem] px-4 py-2.5 text-right font-medium">First orders</th>
                  <th className="w-[9rem] px-4 py-2.5 text-right font-medium">Cost per first order</th>
                  <th className="w-[8rem] px-4 py-2.5 text-right font-medium">All orders</th>
                  <th className="w-[6rem] px-4 py-2.5 text-right font-medium">Installs</th>
                  <th className="w-[8rem] px-4 py-2.5 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c: CampaignRow) => (
                  <tr key={c.name} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="break-all font-medium">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.kind === 'install' ? 'Install' : 'Engagement'} · bids on {c.bidsOn}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT[c.verdict]}`}>{c.verdict}</span>
                      <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-600">{c.why}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <p>{inr(c.spend)}</p>
                      <p className="text-xs text-slate-500">{chg(c.spend, c.spendPrev) !== null ? `${(chg(c.spend, c.spendPrev) as number) > 0 ? '+' : ''}${chg(c.spend, c.spendPrev)}%` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <p>{c.firstOrdersBranch !== null ? num(c.firstOrdersBranch) : num(c.firstOrdersGoogle)}</p>
                      {c.firstOrdersBranch !== null && <p className="text-xs text-slate-500">Google: {num(c.firstOrdersGoogle)}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <p className={`font-semibold ${c.verdict === 'Scale' ? 'text-emerald-700' : c.verdict === 'Watch' || c.verdict === 'Cut' ? 'text-red-700' : ''}`}>{c.costPerFirstOrder !== null ? inr(c.costPerFirstOrder) : '—'}</p>
                      {c.costPerFirstOrderPrev !== null && <p className="text-xs text-slate-500">was {inr(c.costPerFirstOrderPrev)}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <p>{num(c.allOrders)}</p>
                      {c.costPerOrder !== null && <p className="text-xs text-slate-500">{inr(c.costPerOrder)} each</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <p>{num(c.installs)}</p>
                      {c.installsBranch !== null && <p className="text-xs text-slate-500">Branch: {num(c.installsBranch)}</p>}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${c.budgetLimited ? 'text-amber-800' : 'text-slate-600'}`}>{c.budget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Install campaigns are compared on cost per first order ({T.firstOrderSource} count) with their median{ins.medianCost !== null ? ` (${inr(ins.medianCost)})` : ''}: Scale at {RULES.scaleRatio}× or less, Watch at {RULES.watchRatio}×, Cut at {RULES.cutRatio}×. Engagement campaigns are judged on the goal they bid for.
            {ins.unmatchedBranch.length > 0 && ` ${ins.unmatchedBranch.length} Branch campaign name(s) didn’t match a Google campaign.`}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Where the money goes</h2>
            {ins.networks.map((n) => (
              <div key={n.name} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm"><span className="font-medium">{n.name}</span><span className="tabular-nums text-slate-600">{inr(n.spend)} · {n.share}%</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.max(1, n.share)}%` }} /></div>
                <p className="text-xs text-slate-500">{n.cpc !== null ? `${inr(n.cpc)} per conversion` : 'No conversions'}{n.cpcPrev !== null ? ` (was ${inr(n.cpcPrev)})` : ''}</p>
              </div>
            ))}
            <p className="text-xs text-slate-500">Cost per conversion uses each campaign’s bidding goal, not first orders.</p>
          </section>
          <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Location check</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ins.locations.allClear ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{ins.locations.allClear ? 'All clear' : `${ins.locations.outsideShare}% outside NCR`}</span>
            </div>
            <p className="text-sm text-slate-700">
              {ins.locations.allClear ? `${(100 - ins.locations.outsideShare).toFixed(0)}% of last week’s spend was inside Delhi NCR.` : 'Some spend went to cities Quick doesn’t serve.'}
              {ins.locations.presenceOrInterest > 0 && ` ${ins.locations.presenceOrInterest} campaigns use “Presence or interest”, which can show ads to people outside NCR.`}
            </p>
            {ins.locations.cities.map((c) => (
              <div key={c.name} className="flex justify-between border-b border-slate-100 pb-1.5 text-sm"><span>{c.name}{!c.ncr && <span className="ml-2 text-xs font-semibold text-red-700">outside NCR</span>}</span><span className="tabular-nums text-slate-600">{inr(c.spend)}</span></div>
            ))}
          </section>
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Asset health (live ad groups, last 30 days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-slate-500"><tr className="border-b border-slate-200"><th className="px-3 py-2 font-medium">Asset type</th><th className="px-3 py-2 text-right font-medium">Best</th><th className="px-3 py-2 text-right font-medium">Good</th><th className="px-3 py-2 text-right font-medium">Learning</th><th className="px-3 py-2 text-right font-medium">Low</th></tr></thead>
              <tbody>
                {ins.assets.counts.map((a) => (
                  <tr key={a.type} className="border-b border-slate-100 last:border-0"><td className="px-3 py-2 font-medium">{a.type}</td><td className="px-3 py-2 text-right tabular-nums">{a.best}</td><td className="px-3 py-2 text-right tabular-nums">{a.good}</td><td className="px-3 py-2 text-right tabular-nums">{a.learning}</td><td className="px-3 py-2 text-right font-semibold tabular-nums text-red-700">{a.low}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {ins.assets.flags.map((f) => (
              <div key={f.title} className="break-words rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">{f.title}</p><p className="mt-1">{f.detail}</p></div>
            ))}
          </div>
        </section>

        <section id="low" className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Low-rated assets to replace</h2>
              <Link href="/google-gap/assets" className="mt-1 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">Rewrite Low text with Claude →</Link>
              <p className="text-xs text-slate-500">Most-shown first. {ins.assets.lowTotal} Low assets in total: {ins.assets.lowByKind.text} text, {ins.assets.lowByKind.image} images, {ins.assets.lowByKind.video} videos.</p>
            </div>
            <nav aria-label="Asset type" className="flex flex-wrap gap-1.5">
              {([['text', `Text · ${ins.assets.lowByKind.text}`], ['image', `Images · ${ins.assets.lowByKind.image}`], ['video', `Videos · ${ins.assets.lowByKind.video}`]] as const).map(([k, label]) => (
                <Link key={k} href={link({ low: k }) + '#low'} className={`rounded-full border px-3 py-1 text-xs font-semibold ${k === lowTab ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Pattern:</span> {ins.assets.patterns[lowTab]}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-[34%] px-3 py-2 font-medium">Asset</th>
                  <th className="w-[11%] px-3 py-2 font-medium">Type</th>
                  <th className="w-[33%] px-3 py-2 font-medium">Where it runs</th>
                  <th className="w-[11%] px-3 py-2 text-right font-medium">Impressions, 30 days</th>
                  <th className="w-[11%] px-3 py-2 text-right font-medium">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? lows : lows.slice(0, 10)).map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top last:border-0">
                    <td className="break-words px-3 py-2"><span className="mr-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">Low</span>{l.content}</td>
                    <td className="px-3 py-2 text-slate-600">{l.field}{l.size && <p className="text-xs text-slate-500">{l.size}</p>}</td>
                    <td className="break-all px-3 py-2 text-xs text-slate-600">{l.where}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lows.length > 10 && (
            <Link href={link(showAll ? { all: '0' } : { all: '1' }) + '#low'} className="self-start text-sm font-medium text-slate-900 underline underline-offset-2">
              {showAll ? 'Show top 10 only' : `Show all ${lows.length}`}
            </Link>
          )}
          <p className="text-xs text-slate-500">Google rates each asset against the others in the same ad group. Asset numbers overlap (one ad uses several assets at once), so they show how much an asset is used, not its own cost.</p>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          Data: the daily Google Ads script (read-only) for account {business.googleCustomerId}, plus Branch installs and first orders for Google campaigns, matched by campaign name. Installs are Google’s first_open count (installed and opened), the same as the Installs column in Google Ads.
          Weeks end 2 days before the latest day in the data, so late-reported conversions have settled. First orders use Branch when available, otherwise Google’s First_Order_Created_Fe.
          Budget-shift gains are estimates. Thresholds are starting values to tune after 2–3 weeks.
        </footer>
      </main>
    </>
  );
}

function Kpi({ label, value, delta, sub }: { label: string; value: string; delta: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {delta}
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
