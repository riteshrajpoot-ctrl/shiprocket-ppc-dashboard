// Turns scored ads into verdicts, alarms and a ranked action list.
// Pure functions, ES5-safe.
import type { AdFatigue } from './score';

export type DayTotal = { date: string; side: 'Supply' | 'Demand'; spend: number; impressions: number; clicks: number; installs: number };
export type Verdict = 'Cut' | 'Refresh' | 'Scale' | 'Watch' | 'Keep' | 'Learning' | 'Low delivery';
export type AdVerdict = AdFatigue & { verdict: Verdict; why: string; peerMedianCpi: number | null; cpiVsMedian: number | null };
export type Alarm = { level: 'Critical' | 'Warning' | 'Watch'; title: string; detail: string; action: string };
export type Recommendation = { verb: 'Cut' | 'Shift budget' | 'Scale' | 'Refresh' | 'Launch' | 'Consolidate'; title: string; detail: string; impact: string };
export type Week = { spend: number; installs: number; impressions: number; clicks: number; cpi: number | null; ctr: number | null };
export type Insights = {
  ads: AdVerdict[];
  thisWeek: Week;
  lastWeek: Week;
  change: { spendPct: number | null; installsPct: number | null; cpiPct: number | null; ctrPct: number | null };
  wasted7: number;
  alarms: Alarm[];
  recommendations: Recommendation[];
  headline: string;
};

export const VERDICT_RULES = {
  cutCpiRatio: 1.8, // CPI at least 1.8x the median of its side
  cutMinSpend7: 1000, // ...and at least ₹1,000 spent in 7 days
  scaleCpiRatio: 0.75, // CPI at most 0.75x the median
  scaleMinInstalls7: 10,
  scaleMaxFrequency: 2.5,
  watchCpiRatio: 1.3,
  minInstallsForCpi: 5,
  concentrationShare: 0.4, // one ad carrying 40%+ of spend
  staleLaunchDays: 21, // no new creative for 3 weeks
  forecastDays: 7, // alarm if an ad is forecast to tire within a week
  highFrequency: 3,
};

const DAY = 86400000;
const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const pctChange = (now: number | null, prev: number | null) =>
  now === null || prev === null || prev === 0 ? null : Math.round((now / prev - 1) * 1000) / 10;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function week(days: DayTotal[], fromMs: number, toMsIncl: number): Week {
  let spend = 0, installs = 0, impressions = 0, clicks = 0;
  days.forEach((d) => {
    const t = toMs(d.date);
    if (t >= fromMs && t <= toMsIncl) { spend += d.spend; installs += d.installs; impressions += d.impressions; clicks += d.clicks; }
  });
  return {
    spend: Math.round(spend), installs, impressions, clicks,
    cpi: installs ? Math.round(spend / installs) : null,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null,
  };
}

const listNames = (ads: AdVerdict[], n = 3) =>
  ads.slice(0, n).map((a) => `“${a.adName}”`).join(', ') + (ads.length > n ? ` and ${ads.length - n} more` : '');

// This Meta account now runs Quick Delivery (customer) ads only; Quick Partner moved to its own account.
export function buildInsights(ads0: AdFatigue[], days: DayTotal[], windowEnd: string): Insights {
  const R = VERDICT_RULES;

  // Peer median CPI: each ad is judged against the other live ads in the account.
  const med = median(ads0.filter((a) => a.installs7 >= R.minInstallsForCpi && a.cpi7 !== null).map((a) => a.cpi7 as number));

  const ads: AdVerdict[] = ads0.map((a) => {
    let ratio: number | null = null;
    if (med && a.installs7 >= R.minInstallsForCpi && a.cpi7 !== null) ratio = Math.round((a.cpi7 / med) * 100) / 100;
    const zeroInstallBurn = med !== null && a.installs7 === 0 && a.spend7 >= Math.max(500, 1.5 * med);
    const freq = a.frequency7 ?? 0;
    let verdict: Verdict = 'Keep';
    let why = 'Steady: cost in line with peers and no sign of fatigue.';

    if (a.stage === 'Too new') {
      verdict = 'Learning'; why = 'Under 14 days old: let it learn before judging.';
    } else if (a.stage === 'Dead') {
      verdict = 'Cut'; why = 'Fatigue score 75+: CTR has collapsed and costs are rising.';
    } else if (zeroInstallBurn) {
      verdict = 'Cut'; why = `${inr(a.spend7)} spent in 7 days with zero installs.`;
    } else if (ratio !== null && ratio >= R.cutCpiRatio && a.spend7 >= R.cutMinSpend7) {
      verdict = 'Cut'; why = `CPI ${inr(a.cpi7 as number)} is ${ratio}× the median (${inr(med as number)}).`;
    } else if (a.stage === 'Fatigued') {
      verdict = 'Refresh'; why = 'Fatigue score 50+: the audience has seen it too often.';
    } else if (ratio !== null && ratio <= R.scaleCpiRatio && a.installs7 >= R.scaleMinInstalls7 && freq < R.scaleMaxFrequency && a.stage !== 'Watch') {
      verdict = 'Scale'; why = `CPI ${inr(a.cpi7 as number)} is ${ratio}× the median with room to grow (frequency ${a.frequency7 ?? '—'}).`;
    } else if (a.stage === 'Watch' || a.stage === 'Auction shift' || (a.fatigueInDays !== null && a.fatigueInDays <= R.forecastDays) || (ratio !== null && ratio >= R.watchCpiRatio)) {
      verdict = 'Watch';
      why = a.stage === 'Auction shift' ? 'Whole ad set dropped together: likely bids, budget or competition.'
        : a.fatigueInDays !== null && a.fatigueInDays <= R.forecastDays ? `CTR falling; forecast to tire in about ${a.fatigueInDays} days.`
        : ratio !== null && ratio >= R.watchCpiRatio ? `CPI ${ratio}× the median: costlier than peers.`
        : 'Starting to slip versus its first week.';
    } else if (a.stage === 'Too little data') {
      verdict = 'Low delivery'; why = 'Too few impressions to learn from; Meta is barely delivering it.';
    }
    return { ...a, verdict, why, peerMedianCpi: med, cpiVsMedian: ratio };
  });

  // Week on week, from daily totals.
  const endMs = toMs(windowEnd);
  const thisWeek = week(days, endMs - 6 * DAY, endMs);
  const lastWeek = week(days, endMs - 13 * DAY, endMs - 7 * DAY);
  const change = {
    spendPct: pctChange(thisWeek.spend, lastWeek.spend),
    installsPct: pctChange(thisWeek.installs, lastWeek.installs),
    cpiPct: pctChange(thisWeek.cpi, lastWeek.cpi),
    ctrPct: pctChange(thisWeek.ctr, lastWeek.ctr),
  };

  const by = (v: Verdict) => ads.filter((a) => a.verdict === v).sort((a, b) => b.spend7 - a.spend7);
  const cut = by('Cut'), refresh = by('Refresh'), scale = by('Scale'), low = by('Low delivery');
  const wasted7 = cut.reduce((s, a) => s + a.spend7, 0);
  const totalSpend7 = ads.reduce((s, a) => s + a.spend7, 0);

  // ---------- Alarms ----------
  const alarms: Alarm[] = [];
  if (change.cpiPct !== null && change.cpiPct >= 15) {
    alarms.push({
      level: change.cpiPct >= 30 ? 'Critical' : 'Warning',
      title: `Cost per install up ${change.cpiPct}% week on week`,
      detail: `${inr(lastWeek.cpi as number)} → ${inr(thisWeek.cpi as number)} on ${inr(thisWeek.spend)} spend.`,
      action: 'Check the Cut and Refresh ads below first; they usually explain most of the rise.',
    });
  }
  if (change.installsPct !== null && change.installsPct <= -20) {
    alarms.push({
      level: change.installsPct <= -35 ? 'Critical' : 'Warning',
      title: `Installs down ${Math.abs(change.installsPct)}% week on week`,
      detail: `${lastWeek.installs.toLocaleString('en-IN')} → ${thisWeek.installs.toLocaleString('en-IN')} installs${change.spendPct !== null ? `, spend ${change.spendPct > 0 ? '+' : ''}${change.spendPct}%` : ''}.`,
      action: 'If spend held steady, creatives are tiring; if spend fell, check budgets and pacing.',
    });
  }
  if (change.ctrPct !== null && change.ctrPct <= -15) {
    alarms.push({ level: 'Warning', title: `Account CTR down ${Math.abs(change.ctrPct)}% week on week`, detail: `${lastWeek.ctr}% → ${thisWeek.ctr}%.`, action: 'Audiences are tuning out; prioritise new hooks.' });
  }
  if (cut.length) {
    alarms.push({
      level: 'Critical',
      title: `${inr(wasted7)} spent last week on ${cut.length} ad${cut.length > 1 ? 's' : ''} to cut`,
      detail: `${listNames(cut)}: ${cut[0].why}`,
      action: 'Pause them, or cut their budget by half today.',
    });
  }
  const tiring = ads.filter((a) => a.verdict !== 'Cut' && a.fatigueInDays !== null && a.fatigueInDays <= R.forecastDays).sort((a, b) => (a.fatigueInDays as number) - (b.fatigueInDays as number));
  if (tiring.length) {
    alarms.push({
      level: 'Warning',
      title: `${tiring.length} ad${tiring.length > 1 ? 's' : ''} forecast to tire within a week`,
      detail: `${listNames(tiring)}. At the current CTR trend, the first one tires in about ${tiring[0].fatigueInDays} days.`,
      action: 'Brief replacements now so they are live before these tire.',
    });
  }
  if (refresh.length) {
    alarms.push({ level: 'Warning', title: `${refresh.length} fatigued ad${refresh.length > 1 ? 's' : ''} still spending`, detail: `${listNames(refresh)} · ${inr(refresh.reduce((s, a) => s + a.spend7, 0))} in 7 days.`, action: 'Refresh the hook or visual; keep the offer.' });
  }
  const top = ads.slice().sort((a, b) => b.spend7 - a.spend7)[0];
  if (top && totalSpend7 > 0 && top.spend7 / totalSpend7 >= R.concentrationShare) {
    const share = Math.round((top.spend7 / totalSpend7) * 100);
    alarms.push({
      level: 'Warning',
      title: `One ad carries ${share}% of spend`,
      detail: `“${top.adName}” (${inr(top.spend7)} of ${inr(totalSpend7)} in 7 days). If it tires, volume drops with it.`,
      action: 'Get 2 backup creatives live in the same ad set this week.',
    });
  }
  const launched = ads.filter((a) => a.ageDays !== null).map((a) => a.ageDays as number);
  const newest = launched.length ? Math.min.apply(null, launched) : null;
  if (newest !== null && newest >= R.staleLaunchDays) {
    alarms.push({ level: 'Warning', title: `No new creative launched in ${newest} days`, detail: 'Every live ad is at least 3 weeks old, so the pipeline has gone quiet.', action: 'Launch 2–3 new creatives this week, using the top Playbook angles.' });
  }
  const highFreq = ads.filter((a) => (a.frequency7 ?? 0) >= R.highFrequency);
  if (highFreq.length) {
    alarms.push({ level: 'Watch', title: `${highFreq.length} ad${highFreq.length > 1 ? 's' : ''} seen ${R.highFrequency}+ times per person this week`, detail: listNames(highFreq) + '.', action: 'Widen the audience or rotate in a new creative.' });
  }
  if (low.length >= 3) {
    alarms.push({ level: 'Watch', title: `${low.length} ads barely delivering`, detail: `${inr(low.reduce((s, a) => s + a.spend7, 0))} in 7 days spread across ads too small to learn from.`, action: 'Consolidate into fewer ads per ad set so Meta can optimise.' });
  }
  const rank = { Critical: 0, Warning: 1, Watch: 2 };
  alarms.sort((a, b) => rank[a.level] - rank[b.level]);

  // ---------- Recommendations ----------
  const recs: Recommendation[] = [];
  const scaleMed = median(scale.filter((a) => a.cpi7 !== null).map((a) => a.cpi7 as number));
  if (cut.length) {
    recs.push({ verb: 'Cut', title: `Pause ${cut.length} ad${cut.length > 1 ? 's' : ''}`, detail: listNames(cut, 5) + '.', impact: `Saves about ${inr(wasted7)} a week` });
  }
  if (cut.length && scale.length && scaleMed) {
    const cutInstalls = cut.reduce((s, a) => s + a.installs7, 0);
    const gained = Math.round(wasted7 / scaleMed);
    recs.push({
      verb: 'Shift budget',
      title: `Move the ${inr(wasted7)} to ${scale.length} winning ad${scale.length > 1 ? 's' : ''}`,
      detail: `${listNames(scale)} install at a median ${inr(scaleMed)}. Raise their budgets in steps of 20–30% so CPI holds.`,
      impact: `Roughly ${gained - cutInstalls > 0 ? '+' : ''}${(gained - cutInstalls).toLocaleString('en-IN')} installs a week (estimate; CPI usually rises a little as budget grows)`,
    });
  } else if (scale.length) {
    recs.push({ verb: 'Scale', title: `Raise budget on ${scale.length} winning ad${scale.length > 1 ? 's' : ''}`, detail: `${listNames(scale)}: CPI well below peers and frequency still low.`, impact: 'Add 20–30% budget, then re-check CPI after 3 days' });
  }
  const toRefresh = refresh.concat(tiring.filter((a) => a.verdict !== 'Refresh'));
  if (toRefresh.length) {
    recs.push({ verb: 'Refresh', title: `Brief ${toRefresh.length} replacement creative${toRefresh.length > 1 ? 's' : ''}`, detail: listNames(toRefresh) + '. Keep the angle that worked; change the hook and first 3 seconds.', impact: 'Protects volume before CTR drops further' });
  }
  if ((newest !== null && newest >= R.staleLaunchDays) || (top && totalSpend7 > 0 && top.spend7 / totalSpend7 >= R.concentrationShare)) {
    recs.push({ verb: 'Launch', title: 'Launch 2–3 new creatives this week', detail: 'Test new angles from the Playbook alongside the current winner, not instead of it.', impact: 'Reduces dependence on one ad and refills the pipeline' });
  }
  if (low.length >= 3) {
    recs.push({ verb: 'Consolidate', title: `Merge ${low.length} low-delivery ads`, detail: 'Keep the 2–3 strongest per ad set and pause the rest.', impact: 'Gives Meta enough data per ad to optimise' });
  }

  const n = alarms.filter((a) => a.level !== 'Watch').length;
  const headline =
    `Last 7 days: ${inr(thisWeek.spend)} spend, ${thisWeek.installs.toLocaleString('en-IN')} installs, CPI ${thisWeek.cpi !== null ? inr(thisWeek.cpi) : '—'}` +
    (change.cpiPct !== null ? ` (${change.cpiPct > 0 ? '+' : ''}${change.cpiPct}% vs the week before)` : '') +
    `. ${n ? `${n} alarm${n > 1 ? 's' : ''} need attention` : 'No critical alarms'}${wasted7 ? `; ${inr(wasted7)} a week is going to ads worth cutting` : ''}.`;

  return { ads, thisWeek, lastWeek, change, wasted7, alarms, recommendations: recs, headline };
}
