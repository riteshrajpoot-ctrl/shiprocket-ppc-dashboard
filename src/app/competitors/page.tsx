import Link from 'next/link';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { getIntelligence, ADS_URL, type CachedIntelligence, type Creative } from '@/lib/competitors';

// "Refresh data" button: drop the cached copy so the page re-reads ads.json now.
async function refreshData() {
  'use server';
  revalidateTag('competitor-intelligence');
  redirect('/competitors');
}

const STALE_AFTER_HOURS = 36; // the tracker is expected to run at least daily
const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // reading the raw report can take a few seconds

const PLATFORM = [
  { key: 'meta', label: 'Meta', bar: 'bg-indigo-600' },
  { key: 'google', label: 'Google', bar: 'bg-sky-400' },
  { key: 'youtube', label: 'YouTube', bar: 'bg-amber-500' },
] as const;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New this week' },
  { key: 'customer', label: 'Customer' },
  { key: 'hiring', label: 'Rider hiring' },
  { key: 'long', label: 'Live 30+ days' },
] as const;

const int = (n: number) => n.toLocaleString('en-IN');
const day = (iso: string) =>
  new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const CHANNELS = [
  { key: 'all', label: 'All channels' },
  { key: 'meta', label: 'Meta' },
  { key: 'google', label: 'Google' },
  { key: 'youtube', label: 'YouTube' },
] as const;
const CHANNEL_NAME: Record<string, string> = { meta: 'Meta', google: 'Google', youtube: 'YouTube' };

type Search = { c?: string; f?: string; ch?: string };

export default async function CompetitorsPage({ searchParams }: { searchParams: Search }) {
  let data: CachedIntelligence;
  try {
    data = await getIntelligence();
  } catch (e) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Competitor intelligence</h1>
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Couldn’t read the competitor report.</p>
          <p className="mt-1">
            {(e as Error).message}. Check that {ADS_URL} opens in a browser, then refresh this page.
          </p>
        </div>
      </main>
    );
  }

  const { totals, competitors, offers, signals } = data;
  const ageHours = (Date.now() - Date.parse(data.generatedAt)) / 3_600_000;
  const stale = ageHours > STALE_AFTER_HOURS;
  const rivals = competitors.filter((c) => !c.isSelf);
  const selected = searchParams.c && competitors.some((c) => c.name === searchParams.c) ? searchParams.c : rivals[0]?.name;
  const filter = FILTERS.some((f) => f.key === searchParams.f) ? searchParams.f! : 'all';
  const channel = CHANNELS.some((c) => c.key === searchParams.ch) ? searchParams.ch! : 'all';
  const maxTotal = Math.max(...competitors.map((c) => c.total), 1);
  const newCreatives = rivals.reduce((s, c) => s + c.newCreatives, 0);
  const newPayouts = offers.filter((o) => o.kind === 'Rider payout' && o.isNew && o.competitor !== 'Shiprocket').length;
  const newCodes = offers.filter((o) => o.kind === 'Customer offer' && o.isNew && o.competitor !== 'Shiprocket').length;

  const list = data.creatives.filter((c) => c.competitor === selected && (channel === 'all' || c.sources.includes(channel as Creative['sources'][number]))).filter((c: Creative) => {
    if (filter === 'new') return c.isNew;
    if (filter === 'customer') return c.type === 'Customer';
    if (filter === 'hiring') return c.type === 'Hiring';
    if (filter === 'long') return c.isLongRunner;
    return true;
  });
  const link = (c: string | undefined, f: string, ch: string = channel) =>
    `/competitors?${new URLSearchParams({ ...(c ? { c } : {}), f, ch }).toString()}#creatives`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 p-6 text-slate-900 lg:p-8">
      {/* Headline */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">Competitor intelligence</h1>
            <p className="text-sm font-medium text-slate-700">
              Data as of: tracker run of {ist(data.generatedAt)} · covers the {data.periodDays} days before it
            </p>
            <p className="text-xs text-slate-500">
              Last checked for a new run: {ist(data.fetchedAt)} · Meta, Google and YouTube in India
            </p>
          </div>
          <form action={refreshData}>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-500">
              Refresh data
            </button>
          </form>
        </div>
        {stale && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The tracker hasn’t produced a new run for {Math.floor(ageHours / 24)} days. Refreshing re-reads the same file; ask the tracker
            owner to run it, then refresh.
          </p>
        )}
        <p className="max-w-3xl text-lg leading-relaxed text-slate-700">
          <strong className="font-semibold text-slate-900">{totals.leader}</strong> runs{' '}
          <strong className="font-semibold text-slate-900">{totals.leaderSharePct}%</strong> of all tracked ads
          {totals.leaderVsUs ? <>, {totals.leaderVsUs}× Shiprocket’s volume</> : null}.
          {signals[0] ? (
            <> Top signal this week: {signals[0].competitor}, {signals[0].headline.charAt(0).toLowerCase() + signals[0].headline.slice(1)}.</>
          ) : null}
        </p>
      </header>

      {/* Key numbers */}
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Competitor ads live" value={int(totals.competitorAds)} note={`${rivals.length} competitors`} />
        <Kpi label="Shiprocket share of voice" value={`${totals.ourSharePct}%`} note="Our ads ÷ all tracked ads" />
        <Kpi label="New competitor creatives" value={int(newCreatives)} note={`First seen in the last ${data.periodDays} days`} />
        <Kpi label="New offers" value={`${newCodes + newPayouts}`} note={`${newCodes} promo codes, ${newPayouts} rider payouts`} />
      </section>

      {/* Signals */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">What changed this week</h2>
        {signals.length === 0 ? (
          <p className="text-sm text-slate-500">No new offers, hiring pushes or creative bursts this week.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {signals.map((s, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className={s.priority === 'Act' ? 'rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900' : 'rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700'}>
                    {s.priority === 'Act' ? `Act now: ${s.kind.toLowerCase()}` : s.kind}
                  </span>
                  <span className="font-medium text-slate-900">{s.competitor}</span>
                </div>
                <p className="font-medium leading-snug">{s.headline}</p>
                <p className="text-sm leading-relaxed text-slate-600">{s.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Share of voice */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Share of voice</h2>
          <div className="flex gap-4 text-xs text-slate-600">
            {PLATFORM.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${p.bar}`} />
                {p.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
          {competitors.map((c) => (
            <Link key={c.name} href={link(c.name, 'all')} className="group grid grid-cols-[8rem_1fr_7.5rem] items-center gap-3 text-sm">
              <span className={c.isSelf ? 'font-semibold text-indigo-700' : 'text-slate-700 group-hover:text-slate-900'}>
                {c.isSelf ? `${c.name} (us)` : c.name}
              </span>
              <span className="flex h-4 overflow-hidden rounded-sm bg-slate-100" style={{ width: `${(c.total / maxTotal) * 100}%` }}>
                {PLATFORM.map((p) => (
                  <span key={p.key} className={p.bar} style={{ width: `${c.total ? (c[p.key] / c.total) * 100 : 0}%` }} title={`${p.label}: ${int(c[p.key])}`} />
                ))}
              </span>
              <span className="text-right tabular-nums text-slate-600">
                {int(c.total)} · {c.sharePct}%
              </span>
            </Link>
          ))}
          <p className="mt-2 text-xs text-slate-500">Raw ad counts from the report. Google and YouTube can list the same ad twice.</p>
        </div>
      </section>

      {/* Offer board */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Offer board</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium">Competitor</th>
                <th className="px-4 py-2.5 font-medium">Offer</th>
                <th className="px-4 py-2.5 font-medium">Detail</th>
                <th className="px-4 py-2.5 font-medium">Languages</th>
                <th className="px-4 py-2.5 text-right font-medium">Ads</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.filter((o) => o.competitor !== 'Shiprocket').map((o) => (
                <tr key={`${o.competitor}-${o.kind}-${o.label}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{o.competitor}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{o.label}</span>
                    <span className="ml-2 text-xs text-slate-500">{o.kind === 'Rider payout' ? 'rider payout' : 'promo code'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{o.detail}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.languages.join(', ')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{o.ads}</td>
                  <td className="px-4 py-2.5">
                    {o.isNew ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">New since {day(o.firstSeen)}</span>
                    ) : (
                      <span className="text-xs text-slate-500">Live {o.daysLive} days</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Creatives */}
      <section id="creatives" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Creatives</h2>
        <p className="-mt-2 text-sm text-slate-500">Identical ads are grouped into one row. “Versions” is how many copies are running.</p>
        <nav aria-label="Competitor" className="flex flex-wrap gap-1.5">
          {competitors.map((c) => (
            <Link
              key={c.name}
              href={link(c.name, filter)}
              className={`rounded-md border px-3 py-1.5 text-sm ${c.name === selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
            >
              {c.name}
              <span className="ml-1.5 text-xs opacity-70">{c.newCreatives > 0 ? `${c.newCreatives} new` : c.creatives}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Channel" className="flex flex-wrap gap-1.5">
          {CHANNELS.map((ch) => (
            <Link
              key={ch.key}
              href={link(selected, filter, ch.key)}
              className={`rounded-md border px-3 py-1.5 text-sm ${ch.key === channel ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
            >
              {ch.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={link(selected, f.key)}
              className={`rounded-full border px-3 py-1 text-xs ${f.key === filter ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 font-medium">Creative</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Language</th>
                <th className="px-4 py-2.5 font-medium">Channel</th>
                <th className="px-4 py-2.5 font-medium">First seen</th>
                <th className="px-4 py-2.5 text-right font-medium">Versions</th>
                <th className="px-4 py-2.5 font-medium">Signal</th>
                <th className="px-4 py-2.5 font-medium">Ad</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No creatives match this filter. Try “All”.
                  </td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.key} className="border-b border-slate-100 align-top last:border-0">
                    <td className="max-w-md px-4 py-2.5">
                      <span className="font-medium">{c.title}</span>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{c.text}</p>
                      {c.offers.length > 0 && <p className="mt-1 text-xs font-medium text-indigo-700">{c.offers.join(', ')}</p>}
                    </td>
                    <td className="px-4 py-2.5">{c.type === 'Hiring' ? 'Rider hiring' : 'Customer'}</td>
                    <td className="px-4 py-2.5">{c.language}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{c.sources.map((s) => CHANNEL_NAME[s]).join(' + ')}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{day(c.firstSeen)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.versions}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {c.isNew && <span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">New</span>}
                      {c.topRank && c.topRank <= 30 && <span className="mr-1 rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-800">#{c.topRank} most viewed</span>}
                      {c.isLongRunner && <span className="text-slate-500">Live {c.daysLive} days</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {c.adUrl && (
                        <a href={c.adUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 underline underline-offset-2">
                          View ad
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        Source: the team’s competitor ad report ({ADS_URL}). New = first shown in the last {data.periodDays} days. Long-runner = live
        30+ days. {data.skippedAds > 0 && `${int(data.skippedAds)} Google/YouTube ads had no readable text and are counted in volume only.`}
      </footer>
    </main>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}
