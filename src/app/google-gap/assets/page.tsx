import Link from 'next/link';
import { headers } from 'next/headers';
import { currentBusiness } from '../../../lib/stark/businesses';
import StarkHeader from '../../../components/stark-header';
import OffersPanel from '../../../components/offers-panel';
import RewritePanel from '../../../components/rewrite-panel';
import RecStatus from '../../../components/rec-status';
import ChangesLog from '../../../components/changes-log';
import { listChanges, type AdChange } from '../../../lib/stark/changes';
import { getGoogleSnapshot } from '../../../lib/google';
import { listOffers, usableOffers, type Offer } from '../../../lib/stark/offers';
import { listGroups, savedRewrites, type RewriteResult } from '../../../lib/stark/rewrite';
import { loadGoogle } from '../../../lib/stark/context';
import { getStatuses, syncRecs, type StatusRow, type StoredRec } from '../../../lib/stark/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AssetRewritesPage({ searchParams }: { searchParams: { b?: string } }) {
  const business = currentBusiness(searchParams.b);
  const head = <StarkHeader business={business} path="/google-gap/assets" />;
  if (business.key !== 'quick') {
    return (<>{head}<main className="mx-auto max-w-3xl p-8 text-slate-900"><h1 className="text-2xl font-semibold">Rewrite Low assets</h1><p className="mt-3 text-sm text-slate-600">Google data is connected for Shiprocket Quick first. Shiprocket LM follows once its Google script is set up.</p></main></>);
  }

  const notes: string[] = [];
  let offers: Offer[] = [];
  let saved: Record<string, RewriteResult> = {};
  let groups: ReturnType<typeof listGroups> = [];
  try { offers = await listOffers(business.key); } catch (e) { notes.push(`Offers: ${(e as Error).message}`); }
  try { saved = await savedRewrites(business.key); } catch (e) { notes.push(`Saved suggestions: ${(e as Error).message}`); }
  let changes: AdChange[] = [];
  try { changes = await listChanges(business.key); } catch (e) { notes.push(`Change log: ${(e as Error).message}`); }
  try {
    const snap = await getGoogleSnapshot(business.key);
    if (snap) groups = listGroups(snap.tabs); else notes.push('No Google data yet.');
  } catch (e) { notes.push(`Google data: ${(e as Error).message}`); }

  // The "Replace Low assets" recommendation from the Google page, so the team can mark it done here.
  let refresh: StoredRec | null = null;
  let refreshStatus: StatusRow | null = null;
  try {
    const h = headers();
    const g = await loadGoogle(business.key, `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`);
    if (g) {
      const stored = await syncRecs(business.key, g.recs, { google: g.ctx });
      refresh = stored.filter((r) => r.metric === 'google_low_assets')[0] || null;
      if (refresh) refreshStatus = (await getStatuses([refresh.id]))[refresh.id] || null;
    }
  } catch { /* the page still works without the action buttons */ }

  const usable = usableOffers(offers);
  const offerNames: Record<number, string> = {};
  offers.forEach((o) => { if (o.id) offerNames[o.id] = o.claim; });

  return (
    <>
      {head}
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 text-slate-900 lg:p-8">
        <header className="flex flex-col gap-1">
          <Link href="/google-gap" className="text-sm font-medium text-slate-600 underline underline-offset-2">← Google Keywords Gap &amp; Wasted Spend</Link>
          <h1 className="text-3xl font-semibold tracking-tight">Rewrite Low assets with Claude</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Claude compares each ad group’s Low-rated headlines and descriptions with its Best and Good ones, and writes 2–3 replacements each, using only the
            approved offers below. Every suggestion is checked: Google’s character limits, no repeats, and no number that isn’t in your approved list.
          </p>
          {notes.map((n) => <p key={n} className="text-xs text-amber-800">{n}</p>)}
        </header>

        <OffersPanel business={business.key} initial={offers} />

        <RewritePanel business={business.key} groups={groups} saved={saved} offerNames={offerNames} hasOffers={usable.length > 0} />

        <ChangesLog initial={changes} />

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">After the changes are applied</h2>
          <p className="text-sm leading-relaxed text-slate-700">
            Mark the recommendation below as done, with the date the changes went live, so Tool Impact measures the result a week later.
            Prefer to edit by hand? Use “Download picks (CSV)” and change the text in Google Ads yourself.
          </p>
          {refresh ? (
            <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
              <p className="text-sm font-semibold">{refresh.verb}: {refresh.title}</p>
              <RecStatus id={refresh.id} initial={refreshStatus} />
            </div>
          ) : <p className="text-sm text-slate-500">No “Replace Low assets” recommendation this week.</p>}
        </section>
      </main>
    </>
  );
}
