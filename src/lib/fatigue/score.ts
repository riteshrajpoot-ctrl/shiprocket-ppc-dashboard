// Creative fatigue scoring. Pure functions: no network, no Next.js imports.
// Written to compile with the project's ES5 TypeScript target (no Set/Map spreads, no 'u' regex flag).

export type DailyRow = {
  adId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number;
  installs: number;
};

export type AdInfo = {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignName: string;
  side: 'Supply' | 'Demand';
  launchDate: string | null; // when the ad was created in Ads Manager (YYYY-MM-DD)
  lifetime: { spend: number; impressions: number; clicks: number; installs: number } | null; // since launch
};

export type Stage = 'Fresh' | 'Watch' | 'Fatigued' | 'Dead' | 'Auction shift' | 'Too new' | 'Too little data';

export type AdFatigue = AdInfo & {
  stage: Stage;
  score: number | null; // 0–100, higher = more tired
  firstDay: string;
  daysLive: number; // days with data inside our 35-day window
  ageDays: number | null; // days since launch, up to the end of the window
  installs7: number;
  cpi7: number | null;
  lifetimeSpend: number | null;
  lifetimeInstalls: number | null;
  lifetimeCpi: number | null;
  lifetimeCtr: number | null; // %
  olderThanWindow: boolean; // started before our data window, so the baseline is the earliest week we have
  spend7: number;
  impressions7: number;
  ctrBase: number | null; // %
  ctrNow: number | null; // %
  ctrChangePct: number | null;
  frequency7: number | null;
  cpmChangePct: number | null;
  cpiBase: number | null;
  cpiNow: number | null;
  cpiChangePct: number | null;
  reasons: string[];
  action: string;
  ctrTrendPerDay: number | null; // CTR points per day over the last 14 days
  fatigueInDays: number | null; // at the current CTR trend, days until CTR is 30% below its first week
};

// Starting values from the Smart Alarms plan; tune after 2–3 weeks of silent mode.
export const RULES = {
  weights: { ctr: 0.4, frequency: 0.25, cpi: 0.2, cpm: 0.15 },
  ctrDropForFull: 0.4, // a 40% CTR drop scores the CTR signal at 100%
  frequencyLow: 1.5, // 7-day frequency where the signal starts
  frequencyHigh: 4, // 7-day frequency where the signal is full
  costRiseForFull: 0.5, // +50% CPI or CPM scores that signal at 100%
  minImpressions: 2000, // per window, so small numbers don't trigger alarms
  minInstalls: 5, // per window, before CPI is used
  minDaysToJudge: 14, // a first week to compare against plus a recent week
  activeWithinDays: 3, // ads with no impressions in the last 3 days are treated as stopped
  stages: { watch: 25, fatigued: 50, dead: 75 },
  auctionShiftCtrDrop: 0.2, // if every ad in an ad set dropped this much, blame the market
};

const DAY = 86400000;
const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (now: number, base: number) => (base > 0 ? Math.round((now / base - 1) * 1000) / 10 : null);

function sum(rows: DailyRow[]) {
  let impressions = 0, clicks = 0, spend = 0, installs = 0;
  for (const r of rows) { impressions += r.impressions; clicks += r.clicks; spend += r.spend; installs += r.installs; }
  return { impressions, clicks, spend, installs };
}

const ACTIONS: Record<Stage, string> = {
  Fresh: 'No action needed.',
  Watch: 'Prepare a fresh variant now so it is ready next week.',
  Fatigued: 'Refresh it: new hook or visual, keep the offer. Use the top Playbook angle.',
  Dead: 'Pause it and replace it with a new creative.',
  'Auction shift': 'Every ad in this ad set dropped together. Check bids, budget and competitor activity before changing creatives.',
  'Too new': 'Live under 14 days. Judged once it has a first week and a recent week.',
  'Too little data': 'Not enough impressions to judge fairly yet.',
};

export function scoreAds(
  rows: DailyRow[],
  info: Record<string, AdInfo>,
  frequency7: Record<string, number>,
  windowStart: string,
  windowEnd: string,
  costLong: string = 'Cost per install', // the business's result cost, e.g. "Cost per sign-up"
): AdFatigue[] {
  const endMs = toMs(windowEnd);
  const recentStartMs = endMs - 6 * DAY;
  const activeSinceMs = endMs - (RULES.activeWithinDays - 1) * DAY;

  const byAd: Record<string, DailyRow[]> = {};
  for (const r of rows) {
    if (r.impressions <= 0) continue;
    (byAd[r.adId] = byAd[r.adId] || []).push(r);
  }

  const out: AdFatigue[] = [];
  Object.keys(byAd).forEach((adId) => {
    const days = byAd[adId].sort((a, b) => (a.date < b.date ? -1 : 1));
    const meta = info[adId];
    if (!meta) return;
    const lastMs = toMs(days[days.length - 1].date);
    if (lastMs < activeSinceMs) return; // stopped ads are not part of the alarm list

    const firstDay = days[0].date;
    const firstMs = toMs(firstDay);
    const daysLive = Math.round((endMs - firstMs) / DAY) + 1;
    const baseRows = days.filter((d) => toMs(d.date) < firstMs + 7 * DAY);
    const recentRows = days.filter((d) => toMs(d.date) >= recentStartMs);
    const base = sum(baseRows);
    const now = sum(recentRows);

    const ctrBase = base.impressions ? (base.clicks / base.impressions) * 100 : null;
    const ctrNow = now.impressions ? (now.clicks / now.impressions) * 100 : null;
    const cpmBase = base.impressions ? (base.spend / base.impressions) * 1000 : null;
    const cpmNow = now.impressions ? (now.spend / now.impressions) * 1000 : null;
    const cpiOk = base.installs >= RULES.minInstalls && now.installs >= RULES.minInstalls;
    const cpiBase = cpiOk ? base.spend / base.installs : null;
    const cpiNow = cpiOk ? now.spend / now.installs : null;
    const freq = frequency7[adId] ?? null;

    const ad: AdFatigue = {
      ...meta,
      stage: 'Fresh',
      score: null,
      firstDay,
      daysLive,
      ageDays: meta.launchDate ? Math.max(0, Math.round((endMs - toMs(meta.launchDate)) / DAY)) : null,
      installs7: now.installs,
      cpi7: now.installs ? Math.round(now.spend / now.installs) : null,
      lifetimeSpend: meta.lifetime ? Math.round(meta.lifetime.spend) : null,
      lifetimeInstalls: meta.lifetime ? meta.lifetime.installs : null,
      lifetimeCpi: meta.lifetime && meta.lifetime.installs ? Math.round(meta.lifetime.spend / meta.lifetime.installs) : null,
      lifetimeCtr: meta.lifetime && meta.lifetime.impressions ? Math.round((meta.lifetime.clicks / meta.lifetime.impressions) * 10000) / 100 : null,
      olderThanWindow: firstDay === windowStart,
      spend7: Math.round(now.spend),
      impressions7: now.impressions,
      ctrBase: ctrBase === null ? null : Math.round(ctrBase * 100) / 100,
      ctrNow: ctrNow === null ? null : Math.round(ctrNow * 100) / 100,
      ctrChangePct: ctrBase && ctrNow !== null ? pct(ctrNow, ctrBase) : null,
      frequency7: freq === null ? null : Math.round(freq * 10) / 10,
      cpmChangePct: cpmBase && cpmNow !== null ? pct(cpmNow, cpmBase) : null,
      cpiBase: cpiBase === null ? null : Math.round(cpiBase),
      cpiNow: cpiNow === null ? null : Math.round(cpiNow),
      cpiChangePct: cpiBase && cpiNow !== null ? pct(cpiNow, cpiBase) : null,
      reasons: [],
      action: '',
      ctrTrendPerDay: null,
      fatigueInDays: null,
    };

    // CTR trend over the last 14 days (simple straight-line fit), used to forecast fatigue.
    const trendRows = days.filter((d) => toMs(d.date) > endMs - 14 * DAY && d.impressions >= 100);
    if (trendRows.length >= 7) {
      const xs = trendRows.map((d) => (toMs(d.date) - endMs) / DAY);
      const ys = trendRows.map((d) => (d.clicks / d.impressions) * 100);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, den = 0;
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
      if (den > 0) ad.ctrTrendPerDay = Math.round((num / den) * 10000) / 10000;
    }

    if ((ad.ageDays ?? daysLive) < RULES.minDaysToJudge) {
      ad.stage = 'Too new';
    } else if (daysLive < RULES.minDaysToJudge || base.impressions < RULES.minImpressions || now.impressions < RULES.minImpressions || !ctrBase || ctrNow === null) {
      ad.stage = 'Too little data';
    } else {
      const ctrDrop = 1 - ctrNow / ctrBase;
      const signals: { w: number; v: number }[] = [
        { w: RULES.weights.ctr, v: clamp01(ctrDrop / RULES.ctrDropForFull) },
        { w: RULES.weights.cpm, v: clamp01(((cpmNow as number) / (cpmBase as number) - 1) / RULES.costRiseForFull) },
      ];
      if (freq !== null) signals.push({ w: RULES.weights.frequency, v: clamp01((freq - RULES.frequencyLow) / (RULES.frequencyHigh - RULES.frequencyLow)) });
      if (cpiBase && cpiNow) signals.push({ w: RULES.weights.cpi, v: clamp01((cpiNow / cpiBase - 1) / RULES.costRiseForFull) });
      let wSum = 0, total = 0;
      for (const s of signals) { wSum += s.w; total += s.w * s.v; }
      const score = Math.round((total / wSum) * 100); // missing signals are left out and the rest re-weighted
      ad.score = score;
      ad.stage = score >= RULES.stages.dead ? 'Dead' : score >= RULES.stages.fatigued ? 'Fatigued' : score >= RULES.stages.watch ? 'Watch' : 'Fresh';

      if (ad.ctrTrendPerDay !== null && ad.ctrTrendPerDay < 0 && (ad.stage === 'Fresh' || ad.stage === 'Watch')) {
        const line = ctrBase * 0.7;
        ad.fatigueInDays = ctrNow <= line ? 0 : Math.round((ctrNow - line) / -ad.ctrTrendPerDay);
      }
      if (ad.ctrChangePct !== null && ad.ctrChangePct <= -10) ad.reasons.push(`CTR ${ad.ctrChangePct}% vs its first week (${ad.ctrBase}% → ${ad.ctrNow}%)`);
      if (freq !== null && freq >= RULES.frequencyLow) ad.reasons.push(`Seen ${ad.frequency7} times per person in 7 days`);
      if (ad.cpiChangePct !== null && ad.cpiChangePct >= 10) ad.reasons.push(`${costLong} +${ad.cpiChangePct}% (₹${ad.cpiBase} → ₹${ad.cpiNow})`);
      if (ad.cpmChangePct !== null && ad.cpmChangePct >= 10) ad.reasons.push(`CPM +${ad.cpmChangePct}%`);
    }
    out.push(ad);
  });

  // Auction shift: every judged ad in the same ad set dropped together, so it's the market, not the creative.
  const bySet: Record<string, AdFatigue[]> = {};
  out.forEach((a) => { if (a.score !== null) (bySet[a.adsetId] = bySet[a.adsetId] || []).push(a); });
  Object.keys(bySet).forEach((id) => {
    const ads = bySet[id];
    if (ads.length < 2) return;
    const allDropped = ads.every((a) => a.ctrChangePct !== null && a.ctrChangePct <= -RULES.auctionShiftCtrDrop * 100);
    if (!allDropped) return;
    ads.forEach((a) => { if (a.stage !== 'Fresh') a.stage = 'Auction shift'; });
  });

  out.forEach((a) => { a.action = ACTIONS[a.stage]; });
  const order: Stage[] = ['Dead', 'Fatigued', 'Auction shift', 'Watch', 'Fresh', 'Too little data', 'Too new'];
  return out.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || b.spend7 - a.spend7);
}
