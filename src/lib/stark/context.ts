// Loads each page's data once, in the same way for the pages, the Tool Impact page and the Monday job,
// so a recommendation gets the same ID wherever it is shown.
import { getGoogleSnapshot } from '../google';
import { getBranchGoogle } from '../google/branch';
import { buildGoogleInsights, LAG_DAYS, latestDay, type BranchCounts, type GoogleInsights } from '../google/insights';
import { buildInsights, getFatigueReport, type FatigueReport, type Insights } from '../fatigue';
import { BUSINESSES, type BusinessKey } from './businesses';
import type { MeasureCtx, RecInput } from './actions';

const DAY = 86400000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type GoogleLoad = {
  snap: NonNullable<Awaited<ReturnType<typeof getGoogleSnapshot>>>;
  ins: GoogleInsights;
  branchNote: string;
  ctx: NonNullable<MeasureCtx['google']>;
  recs: RecInput[];
};

export async function loadGoogle(business: BusinessKey, base: string): Promise<GoogleLoad | null> {
  if (business !== 'quick') return null;
  const snap = await getGoogleSnapshot('quick');
  if (!snap) return null;
  const endMs = Date.parse(latestDay(snap.tabs) + 'T00:00:00Z') - LAG_DAYS * DAY;
  const d = (k: number) => ymd(endMs - k * DAY);
  let bThis: BranchCounts | null = null, bPrev: BranchCounts | null = null, branchNote = '';
  try {
    bThis = await getBranchGoogle(base, d(6), d(0));
    bPrev = await getBranchGoogle(base, d(13), d(7));
  } catch (e) {
    bThis = null; bPrev = null;
    branchNote = `Branch didn’t respond (${(e as Error).message}), so first orders below are Google’s count.`;
  }
  const ins = buildGoogleInsights(snap.tabs, bThis, bPrev);
  return {
    snap, ins, branchNote,
    ctx: { tabs: snap.tabs, dataEnd: ins.weekEnd, lowAssets: ins.assets.lowTotal },
    recs: ins.actions.map((a) => ({ page: 'google' as const, verb: a.verb, title: a.title, detail: a.detail, impactText: a.impact, targets: a.targets, metric: a.metric })),
  };
}

export type FatigueLoad = { data: FatigueReport; ins: Insights; ctx: NonNullable<MeasureCtx['meta']>; recs: RecInput[] };

export async function loadFatigue(business: BusinessKey): Promise<FatigueLoad> {
  const data = await getFatigueReport(business);
  const L = BUSINESSES[business].result;
  const ins = buildInsights(data.ads, data.days, data.windowEnd, L);
  return {
    data, ins,
    ctx: {
      adDaily: data.adDaily || {}, dataEnd: data.windowEnd,
      launches: data.ads.map((a) => a.launchDate).filter((x): x is string => !!x),
      lowDelivery: ins.ads.filter((a) => a.verdict === 'Low delivery').length,
      resultMany: L.many,
    },
    recs: ins.recommendations.map((r) => ({ page: 'fatigue' as const, verb: r.verb, title: r.title, detail: r.detail, impactText: r.impact, targets: r.targets, metric: r.metric })),
  };
}
