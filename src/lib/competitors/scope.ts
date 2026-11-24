// Splits the competitor tracker's file into the slice each STARK 2.0 business cares about.
// Pure functions, ES5-safe.
import type { RawAd, RawReport } from './analyze';
import { BUSINESSES, type BusinessKey } from '../stark/businesses';

// Delhivery ads for on-demand local delivery (2W/3W, Tata Ace, city codes like DEL50) belong to Quick's world.
const DELHIVERY_ON_DEMAND = /\b[23] ?w\b|2-wheeler|3-wheeler|two.?wheeler|three.?wheeler|tata ace|mini.?truck|on-demand|on demand|local deliver|bulk inventory|urgent documents|right vehicle|\b[A-Z]{3,5}50\b/;
const DELHIVERY_ON_DEMAND_I = /\b[23] ?w\b|2-wheeler|3-wheeler|two.?wheeler|three.?wheeler|tata ace|mini.?truck|on-demand|on demand|local deliver|bulk inventory|urgent documents|right vehicle/i;
// Our own Quick ads, and checkout (Fastrr) ads, which are neither LM nor Quick.
const SHIPROCKET_QUICK = /shiprocket ?quick|\bsr quick|quick partner|quickdelivery|\b[23] ?w\b|2-wheeler|3-wheeler|two.?wheeler|three.?wheeler/i;
const CHECKOUT = /fastrr|fastr\b|checkout/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const textOf = (a: RawAd) => `${a.title || ''}\n${a.body || ''}`;
const isOnDemand = (a: RawAd) => DELHIVERY_ON_DEMAND_I.test(textOf(a)) || DELHIVERY_ON_DEMAND.test(textOf(a));

// A configured name matches a tracker name if one contains the other ("Ekart" ~ "Ekart Logistics").
function matchName(configured: string, trackerNames: string[]): string | null {
  const c = norm(configured);
  for (const t of trackerNames) {
    const n = norm(t);
    if (n && (n === c || n.indexOf(c) === 0 || c.indexOf(n) === 0)) return t;
  }
  return null;
}

export type ScopedReport = { report: RawReport; tracked: string[]; notTracked: string[] };

export function scopeReport(raw: RawReport, key: BusinessKey): ScopedReport {
  const b = BUSINESSES[key];
  const trackerNames = raw.competitors.map((c) => c.name);
  const tracked: string[] = [];
  const notTracked: string[] = [];
  const keepNames: Record<string, string> = {}; // tracker name -> display name

  b.competitors.forEach((name) => {
    const base = name === 'Delhivery on-demand' ? 'Delhivery' : name;
    const hit = matchName(base, trackerNames);
    if (hit) { keepNames[hit] = name; tracked.push(name); } else notTracked.push(name);
  });

  const ads: RawAd[] = [];
  raw.ads.forEach((a) => {
    if (a.recruitment) return; // rider / partner hiring ads belong to the Partner app, not STARK 2.0
    if (a.competitor === 'Shiprocket') {
      const quick = a.account === 'Shiprocket Quick' || SHIPROCKET_QUICK.test(textOf(a));
      if (key === 'quick' ? quick : !quick && !CHECKOUT.test(textOf(a))) ads.push(a);
      return;
    }
    const display = keepNames[a.competitor];
    if (!display) return;
    if (a.competitor === 'Delhivery') {
      if (key === 'quick' && !isOnDemand(a)) return;
      if (key === 'lm' && isOnDemand(a)) return;
    }
    ads.push(display === a.competitor ? a : { ...a, competitor: display });
  });

  // Ad counts per competitor, rebuilt from the kept ads so share of voice matches this business's slice.
  const counts: Record<string, Record<string, number>> = {};
  ['Shiprocket'].concat(tracked).forEach((n) => { counts[n] = { meta: 0, google: 0, youtube: 0, meta_active: 0, google_active: 0, youtube_active: 0 }; });
  ads.forEach((a) => {
    const c = counts[a.competitor] || (counts[a.competitor] = { meta: 0, google: 0, youtube: 0, meta_active: 0, google_active: 0, youtube_active: 0 });
    if (a.status && a.status !== 'Active') return;
    c[a.source] = (c[a.source] || 0) + 1;
    c[a.source + '_active'] = (c[a.source + '_active'] || 0) + 1;
  });

  return {
    report: { ...raw, competitors: Object.keys(counts).map((name) => ({ name, counts: counts[name] })), ads },
    tracked,
    notTracked,
  };
}
