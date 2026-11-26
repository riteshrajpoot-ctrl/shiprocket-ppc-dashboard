// Turns the daily Google Ads snapshot (+ Branch first orders) into verdicts, alarms and actions.
// Pure functions, ES5-safe: no network, no Next.js imports.

type Row = Record<string, string | number>;
export type Tabs = Record<string, Row[]>;
export type BranchCounts = Record<string, { installs: number; orders: number }>; // keyed by normalised campaign name

export type Verdict = 'Scale' | 'Keep' | 'Watch' | 'Cut' | 'Check';
export type CampaignRow = {
  name: string;
  kind: 'install' | 'engage';
  bidsOn: string;
  verdict: Verdict;
  why: string;
  spend: number;
  spendPrev: number;
  installs: number;
  firstOrdersGoogle: number;
  firstOrdersBranch: number | null;
  installsBranch: number | null;
  firstOrdersPrev: number;
  costPerFirstOrder: number | null;
  costPerFirstOrderPrev: number | null;
  allOrders: number;
  costPerOrder: number | null;
  ratio: number | null;
  budget: string;
  budgetLimited: boolean;
  invalidRate: number | null;
};
export type Alarm = { level: 'Critical' | 'Warning' | 'Watch'; title: string; detail: string; action: string };
// targets = the campaigns an action is about; metric = how its impact is measured a week later.
export type ActionMetric = 'google_fo' | 'google_orders' | 'google_low_assets' | 'google_invalid';
export type Action = { verb: 'Shift budget' | 'Cut' | 'Decide' | 'Refresh' | 'Fix'; title: string; detail: string; impact: string; targets: string[]; metric: ActionMetric };
export type LowAsset = { kind: 'text' | 'image' | 'video'; field: string; content: string; size: string; where: string; impressions: number; conversions: number };

export type GoogleInsights = {
  weekStart: string;
  weekEnd: string;
  totals: {
    spend: number; spendPrev: number;
    installs: number; installsPrev: number;
    installsBranch: number | null;
    firstOrdersGoogle: number; firstOrdersGooglePrev: number;
    firstOrdersBranch: number | null; firstOrdersBranchPrev: number | null;
    costPerFirstOrder: number | null; costPerFirstOrderPrev: number | null;
    firstOrderSource: 'Branch' | 'Google';
  };
  headline: string;
  campaigns: CampaignRow[];
  medianCost: number | null;
  alarms: Alarm[];
  actions: Action[];
  networks: { name: string; spend: number; share: number; cpc: number | null; cpcPrev: number | null }[];
  locations: { allClear: boolean; outsideShare: number; presenceOrInterest: number; cities: { name: string; spend: number; ncr: boolean }[] };
  assets: {
    counts: { type: string; best: number; good: number; learning: number; low: number }[];
    lowTotal: number;
    lowByKind: { text: number; image: number; video: number };
    low: LowAsset[];
    flags: { title: string; detail: string }[];
    patterns: { text: string; image: string; video: string };
  };
  unmatchedBranch: string[];
};

export const RULES = {
  scaleRatio: 0.75,
  watchRatio: 1.3,
  cutRatio: 1.8,
  minSpendToJudge: 2000, // ₹ in 7 days
  invalidClickAlarm: 0.2,
  invalidClickMinClicks: 200,
  branchGapAlarm: 0.2,
  outsideNcrAlarm: 0.05,
  shiftShare: 0.3, // move 30% of a Watch/Cut campaign's weekly spend
};

const DAY = 86400000;
const NCR = ['delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida', 'greater noida', 'ghaziabad', 'faridabad'];

export const normName = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const n = (v: unknown) => Number(v) || 0;
const day = (v: unknown) => String(v || '').slice(0, 10);
const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const inr = (v: number) => '₹' + Math.round(v).toLocaleString('en-IN');
const pct = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : Math.round((a / b - 1) * 1000) / 10);
const short = (c: string) => c.replace(/^sr_quick_/i, '');
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const isPartner = (a: string) => /quickpartner/i.test(a);
// Installs = Firebase "first_open" (installed AND opened): the same number Google Ads shows in its Installs column,
// and comparable with Branch. The Google Play "installs" action counts downloads, including never-opened ones.
export const isInstall = (a: string) => /(^|\s)first_open(\s|$)/i.test(a);
export const isFirstOrder = (a: string) => /first_order_created_fe(\s|$)/i.test(a) || /first_order_created_fe\s\d{4}-/i.test(a);
export const isAnyOrder = (a: string) => /(^|\s)order_created_fe(\s|$)/i.test(a) || /(^|\s)order_created_fe\s\d{4}-/i.test(a);

function goalLabel(a: string): string {
  if (isFirstOrder(a)) return 'first orders';
  if (isAnyOrder(a)) return 'all orders';
  if (isInstall(a)) return 'installs (first open)';
  if (/installs(\s|$)/i.test(a)) return 'Play downloads';
  if (/signup/i.test(a)) return 'sign-ups';
  return a.replace(/\s\d{4}-\d\d-\d\dT[\d:.]+$/, '').replace(/^.*\)\s*/, '');
}

// Weeks end lagDays before the latest day in the data, so late-reported conversions have settled.
export const LAG_DAYS = 2;

export function latestDay(tabs: Tabs): string {
  return (tabs.campaigns_daily || []).reduce((m, r) => (day(r.date) > m ? day(r.date) : m), '');
}

export function buildGoogleInsights(tabs: Tabs, branchThis: BranchCounts | null, branchPrev: BranchCounts | null, lagDays: number = LAG_DAYS): GoogleInsights {
  const camp = tabs.campaigns_daily || [];
  const conv = tabs.conversions_daily || [];
  const settings = tabs.campaign_settings || [];
  const R = RULES;

  const latest = latestDay(tabs);
  const endMs = toMs(latest || ymd(Date.now() - DAY)) - lagDays * DAY;
  const end = ymd(endMs);
  const wStart = ymd(endMs - 6 * DAY), pStart = ymd(endMs - 13 * DAY), pEnd = ymd(endMs - 7 * DAY);
  const inW = (d: string) => d >= wStart && d <= end;
  const inP = (d: string) => d >= pStart && d <= pEnd;

  const set: Record<string, Row> = {};
  settings.forEach((s) => { set[String(s.campaign)] = s; });

  type Acc = { kind: 'install' | 'engage'; spend: number; spendPrev: number; installs: number; installsPrev: number; fo: number; foPrev: number; orders: number; goals: Record<string, boolean> };
  const acc: Record<string, Acc> = {};
  const get = (name: string, sub?: string) => acc[name] || (acc[name] = { kind: /ENGAGEMENT/i.test(sub || '') ? 'engage' : 'install', spend: 0, spendPrev: 0, installs: 0, installsPrev: 0, fo: 0, foPrev: 0, orders: 0, goals: {} });

  camp.forEach((r) => {
    const d = day(r.date);
    const a = get(String(r.campaign), String(r.sub_channel || ''));
    if (/ENGAGEMENT/i.test(String(r.sub_channel || ''))) a.kind = 'engage';
    if (inW(d)) a.spend += n(r.cost);
    else if (inP(d)) a.spendPrev += n(r.cost);
  });

  let partnerEvents = 0;
  const partnerCampaigns: Record<string, boolean> = {};
  conv.forEach((r) => {
    const d = day(r.date);
    const name = String(r.campaign);
    const action = String(r.conversion_action || '');
    if (!acc[name]) return;
    const a = acc[name];
    if (isPartner(action)) { if (inW(d) || inP(d)) { partnerEvents += n(r.all_conversions); partnerCampaigns[name] = true; } return; }
    if (inW(d) && n(r.conversions) > 0) a.goals[goalLabel(action)] = true;
    const all = n(r.all_conversions);
    // Installs use "conversions" (Google's own count for this primary goal), which matches the Google Ads Installs column.
    if (isInstall(action)) { if (inW(d)) a.installs += n(r.conversions); else if (inP(d)) a.installsPrev += n(r.conversions); }
    if (isFirstOrder(action)) { if (inW(d)) a.fo += all; else if (inP(d)) a.foPrev += all; }
    if (isAnyOrder(action) && inW(d)) a.orders += all;
  });

  // Invalid clicks this week per campaign.
  const inv: Record<string, { clicks: number; invalid: number }> = {};
  (tabs.invalid_clicks_daily || []).forEach((r) => {
    if (!inW(day(r.date))) return;
    const k = String(r.campaign);
    const x = inv[k] || (inv[k] = { clicks: 0, invalid: 0 });
    x.clicks += n(r.clicks); x.invalid += n(r.invalid_clicks);
  });

  // Branch counts, matched by campaign name.
  const matched: Record<string, boolean> = {};
  const branchFor = (b: BranchCounts | null, name: string) => {
    if (!b) return null;
    const hit = b[normName(name)];
    if (hit) matched[normName(name)] = true;
    return hit || null; // no Branch match: this campaign falls back to Google's count
  };

  const names = Object.keys(acc).filter((k) => acc[k].spend > 0);
  const rows: CampaignRow[] = names.map((name) => {
    const a = acc[name];
    const s = set[name] || {};
    const reasons = String(s.status_reasons || '');
    const limitedBudget = /BUDGET_CONSTRAINED/i.test(reasons);
    const budget = limitedBudget ? 'Limited by budget' : String(s.primary_status || '') === 'LIMITED' ? 'Limited' : 'Not limited';
    const bThis = branchFor(branchThis, name);
    const bPrev = branchFor(branchPrev, name);
    const fo = bThis ? bThis.orders : a.fo;
    const foPrev = bThis && bPrev ? bPrev.orders : a.foPrev;
    const iv = inv[name];
    const goals = Object.keys(a.goals);
    return {
      name, kind: a.kind,
      bidsOn: goals.length ? goals.join(' + ') : 'not set',
      verdict: 'Keep', why: '',
      spend: Math.round(a.spend), spendPrev: Math.round(a.spendPrev),
      installs: Math.round(a.installs),
      firstOrdersGoogle: Math.round(a.fo),
      firstOrdersBranch: bThis ? bThis.orders : null,
      installsBranch: bThis ? bThis.installs : null,
      firstOrdersPrev: Math.round(foPrev),
      costPerFirstOrder: fo ? Math.round(a.spend / fo) : null,
      costPerFirstOrderPrev: foPrev ? Math.round(a.spendPrev / foPrev) : null,
      allOrders: Math.round(a.orders),
      costPerOrder: a.orders ? Math.round(a.spend / a.orders) : null,
      ratio: null,
      budget, budgetLimited: budget !== 'Not limited',
      invalidRate: iv && iv.clicks + iv.invalid >= R.invalidClickMinClicks ? Math.round((iv.invalid / (iv.clicks + iv.invalid)) * 1000) / 10 : null,
    };
  });

  // Verdicts: install campaigns against the median cost per first order; engagement campaigns by their own goal.
  const installs = rows.filter((r) => r.kind === 'install');
  const med = median(installs.filter((r) => r.costPerFirstOrder !== null && r.spend >= R.minSpendToJudge).map((r) => r.costPerFirstOrder as number));
  rows.forEach((r) => {
    if (r.kind === 'engage') {
      r.verdict = 'Check';
      r.why = /all orders/.test(r.bidsOn)
        ? `Bids on all orders, including repeats: ${r.costPerOrder !== null ? inr(r.costPerOrder) + ' per order' : 'no orders yet'}. Judge it on that goal.`
        : `${r.costPerFirstOrder !== null ? inr(r.costPerFirstOrder) + ' per first order' : 'No first orders yet'} from people who already installed. Re-engagement: confirm with a holdout test.`;
      if (r.invalidRate !== null && r.invalidRate >= R.invalidClickAlarm * 100) r.why += ` ${r.invalidRate}% invalid clicks.`;
      return;
    }
    if (r.spend < R.minSpendToJudge || med === null) { r.verdict = 'Keep'; r.why = 'Too little spend this week to judge.'; return; }
    if (r.costPerFirstOrder === null) {
      r.verdict = r.spend >= 2 * med ? 'Cut' : 'Watch';
      r.why = `${inr(r.spend)} this week with no first orders.`;
      return;
    }
    r.ratio = Math.round((r.costPerFirstOrder / med) * 100) / 100;
    const trend = r.costPerFirstOrderPrev ? ` (was ${inr(r.costPerFirstOrderPrev)})` : '';
    if (r.ratio >= R.cutRatio) { r.verdict = 'Cut'; r.why = `${inr(r.costPerFirstOrder)} per first order: ${r.ratio}× the median${trend}.`; }
    else if (r.ratio >= R.watchRatio) { r.verdict = 'Watch'; r.why = `${inr(r.costPerFirstOrder)} per first order: ${r.ratio}× the median${trend}.`; }
    else if (r.ratio <= R.scaleRatio) { r.verdict = 'Scale'; r.why = `${inr(r.costPerFirstOrder)} per first order: ${r.ratio}× the median${trend}.`; }
    else { r.verdict = 'Keep'; r.why = `${inr(r.costPerFirstOrder)} per first order: ${r.ratio}× the median${trend}.`; }
  });
  const order: Verdict[] = ['Cut', 'Watch', 'Scale', 'Keep', 'Check'];
  rows.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'install' ? -1 : 1) || order.indexOf(x.verdict) - order.indexOf(y.verdict) || y.spend - x.spend);

  // Totals.
  const sum = (f: (r: CampaignRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const spend = sum((r) => r.spend), spendPrev = sum((r) => r.spendPrev);
  const allAcc = names.map((k) => acc[k]);
  const installsT = Math.round(allAcc.reduce((t, a) => t + a.installs, 0));
  const installsPrevT = Math.round(allAcc.reduce((t, a) => t + a.installsPrev, 0));
  const foG = Math.round(allAcc.reduce((t, a) => t + a.fo, 0));
  const foGPrev = Math.round(allAcc.reduce((t, a) => t + a.foPrev, 0));
  // Final first orders: Branch for campaigns Branch knows, Google's count for the rest.
  const matchedRows = rows.filter((r) => r.firstOrdersBranch !== null);
  const foB = branchThis && matchedRows.length ? sum((r) => (r.firstOrdersBranch !== null ? r.firstOrdersBranch : r.firstOrdersGoogle)) : null;
  const foBPrev = branchThis && matchedRows.length ? sum((r) => r.firstOrdersPrev) : null;
  const foFinal = foB !== null ? foB : foG;
  const foFinalPrev = foBPrev !== null ? foBPrev : foGPrev;
  const totals = {
    spend, spendPrev, installs: installsT, installsPrev: installsPrevT,
    installsBranch: matchedRows.length ? sum((r) => r.installsBranch || 0) : null,
    firstOrdersGoogle: foG, firstOrdersGooglePrev: foGPrev, firstOrdersBranch: foB, firstOrdersBranchPrev: foBPrev,
    costPerFirstOrder: foFinal ? Math.round(spend / foFinal) : null,
    costPerFirstOrderPrev: foFinalPrev ? Math.round(spendPrev / foFinalPrev) : null,
    firstOrderSource: (foB !== null ? 'Branch' : 'Google') as 'Branch' | 'Google',
  };

  // ---------- Alarms ----------
  const alarms: Alarm[] = [];
  const cpfoChg = pct(totals.costPerFirstOrder, totals.costPerFirstOrderPrev);
  if (cpfoChg !== null && cpfoChg >= 15) {
    alarms.push({ level: cpfoChg >= 30 ? 'Critical' : 'Warning', title: `Cost per first order up ${cpfoChg}% week on week`, detail: `${inr(totals.costPerFirstOrderPrev as number)} → ${inr(totals.costPerFirstOrder as number)} (${totals.firstOrderSource} first orders).`, action: 'Start with the Watch and Cut campaigns in the table.' });
  }
  const foChg = pct(foFinal, foFinalPrev);
  if (foChg !== null && foChg <= -20) {
    alarms.push({ level: foChg <= -35 ? 'Critical' : 'Warning', title: `First orders down ${Math.abs(foChg)}% week on week`, detail: `${foFinalPrev} → ${foFinal}; spend ${pct(spend, spendPrev) ?? 0}%.`, action: 'If spend held steady, check creatives and placements; if spend fell, check budgets.' });
  }
  if (matchedRows.length) {
    const g = matchedRows.reduce((t, r) => t + r.firstOrdersGoogle, 0);
    const b = matchedRows.reduce((t, r) => t + (r.firstOrdersBranch as number), 0);
    const gap = Math.max(g, b) ? Math.abs(g - b) / Math.max(g, b) : 0;
    if (gap >= R.branchGapAlarm) {
      alarms.push({ level: 'Watch', title: `Google and Branch disagree on first orders by ${Math.round(gap * 100)}%`, detail: `For the ${matchedRows.length} campaigns both track, Google counts ${g} and Branch ${b}. Branch is used as the final number.`, action: 'Check the First_Order_Created_Fe import and attribution windows.' });
    }
  }
  const unmatchedGoogle = rows.filter((r) => branchThis && r.firstOrdersBranch === null && r.spend >= R.minSpendToJudge);
  if (branchThis && unmatchedGoogle.length) {
    alarms.push({ level: 'Watch', title: `${unmatchedGoogle.length} campaign${unmatchedGoogle.length > 1 ? 's' : ''} not found in Branch`, detail: `${unmatchedGoogle.map((r) => short(r.name)).slice(0, 3).join(', ')}${unmatchedGoogle.length > 3 ? ' and more' : ''}: using Google’s first-order count for these.`, action: 'Check the campaign name reaches Branch unchanged.' });
  }
  // Budget changes made to (nearly) every campaign at the same moment.
  const budgetChanges: Record<string, Record<string, boolean>> = {};
  (tabs.changes_14d || []).forEach((r) => {
    if (String(r.what) !== 'CAMPAIGN_BUDGET') return;
    const t = String(r.when).slice(0, 16);
    (budgetChanges[t] = budgetChanges[t] || {})[String(r.campaign)] = true;
  });
  const blanket = Object.keys(budgetChanges).filter((t) => Object.keys(budgetChanges[t]).length >= Math.max(3, Math.ceil(names.length * 0.8))).sort();
  if (blanket.length) {
    const daily: Record<string, number> = {};
    camp.forEach((r) => { daily[day(r.date)] = (daily[day(r.date)] || 0) + n(r.cost); });
    const days = Object.keys(daily).sort().slice(-14);
    const scaleNames = rows.filter((r) => r.verdict === 'Scale').map((r) => short(r.name));
    alarms.push({
      level: 'Warning',
      title: `Budgets changed on ${Object.keys(budgetChanges[blanket[blanket.length - 1]]).length} campaigns at once`,
      detail: `On ${blanket.map((t) => new Date(t.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })).join(' and ')}. Daily spend went from ${inr(daily[days[0]] || 0)} to ${inr(daily[days[days.length - 1]] || 0)}${scaleNames.length ? `, including the best campaigns (${scaleNames.slice(0, 2).join(', ')})` : ''}.`,
      action: 'Change budgets by efficiency, not all together: protect Scale campaigns, trim Watch and Cut ones.',
    });
  }
  rows.filter((r) => r.invalidRate !== null && r.invalidRate >= R.invalidClickAlarm * 100).forEach((r) => {
    alarms.push({ level: 'Warning', title: `${r.invalidRate}% invalid clicks on ${short(r.name)}`, detail: 'Google filtered these clicks as invalid. You aren’t charged for them, but it signals poor placements.', action: 'Review its placements and audience signals.' });
  });
  const limited = rows.filter((r) => /budget/.test(r.budget));
  const scaleOpen = rows.filter((r) => r.verdict === 'Scale' && !r.budgetLimited);
  if (limited.length) {
    alarms.push({ level: 'Watch', title: `${limited.length} campaign${limited.length > 1 ? 's' : ''} limited by budget`, detail: `${limited.map((r) => short(r.name)).slice(0, 3).join(', ')}${limited.length > 3 ? ` and ${limited.length - 3} more` : ''}.${scaleOpen.length ? ` The ${scaleOpen.length} cheapest install campaign${scaleOpen.length > 1 ? 's are' : ' is'} not limited and can take more budget.` : ''}`, action: 'Only raise budgets where cost per first order is at or below the median.' });
  }
  if (partnerEvents > 0) {
    alarms.push({ level: 'Watch', title: 'Partner-app events counted in Quick campaigns', detail: `${Math.round(partnerEvents)} Quick Partner (quickpartner) conversions in ${Object.keys(partnerCampaigns).length} campaign(s) over 14 days. Not used for bidding, but they muddy reports.`, action: 'Exclude partner-app events from this account’s conversion goals.' });
  }

  // ---------- Networks ----------
  const net: Record<string, { s: number; c: number; sp: number; cp: number }> = {};
  (tabs.networks_daily || []).forEach((r) => {
    const k = String(r.network); const d = day(r.date);
    const x = net[k] || (net[k] = { s: 0, c: 0, sp: 0, cp: 0 });
    if (inW(d)) { x.s += n(r.cost); x.c += n(r.conversions); } else if (inP(d)) { x.sp += n(r.cost); x.cp += n(r.conversions); }
  });
  const netTotal = Object.keys(net).reduce((t, k) => t + net[k].s, 0);
  const NET_NAME: Record<string, string> = { SEARCH: 'Search', CONTENT: 'Display (apps and websites)', YOUTUBE: 'YouTube', SEARCH_PARTNERS: 'Search partners', MIXED: 'Mixed' };
  const networks = Object.keys(net).filter((k) => net[k].s > 0).sort((a, b) => net[b].s - net[a].s).map((k) => ({
    name: NET_NAME[k] || k, spend: Math.round(net[k].s), share: netTotal ? Math.round((net[k].s / netTotal) * 1000) / 10 : 0,
    cpc: net[k].c ? Math.round(net[k].s / net[k].c) : null, cpcPrev: net[k].cp ? Math.round(net[k].sp / net[k].cp) : null,
  }));

  // ---------- Locations ----------
  const city: Record<string, { s: number; ncr: boolean }> = {};
  (tabs.locations_7d || []).forEach((r) => {
    const nm = String(r.city || 'Unknown');
    const ncr = NCR.indexOf(nm.toLowerCase()) >= 0 || String(r.region || '').trim().toLowerCase() === 'delhi';
    const x = city[nm] || (city[nm] = { s: 0, ncr });
    x.s += n(r.cost);
  });
  const cityTotal = Object.keys(city).reduce((t, k) => t + city[k].s, 0);
  const outside = Object.keys(city).filter((k) => !city[k].ncr).reduce((t, k) => t + city[k].s, 0);
  const outsideShare = cityTotal ? outside / cityTotal : 0;
  const poi = settings.filter((s) => String(s.status) === 'ENABLED' && String(s.location_setting) === 'PRESENCE_OR_INTEREST').length;
  if (outsideShare >= R.outsideNcrAlarm) {
    alarms.push({ level: 'Warning', title: `${Math.round(outsideShare * 100)}% of spend outside Delhi NCR`, detail: `${inr(outside)} last week went to cities Quick doesn’t serve.`, action: 'Switch location targeting to “Presence” (people in or regularly in your areas).' });
  }

  // ---------- Assets ----------
  const active: Record<string, boolean> = {};
  settings.forEach((s) => { if (String(s.status) === 'ENABLED') active[String(s.campaign)] = true; });
  const live = (tabs.assets_30d || []).filter((a) => active[String(a.campaign)] && String(a.enabled) === 'yes');
  const KIND: Record<string, 'text' | 'image' | 'video'> = { TEXT: 'text', IMAGE: 'image', YOUTUBE_VIDEO: 'video' };
  const perf: Record<string, Record<string, Record<string, boolean>>> = {};
  live.forEach((a) => {
    const t = String(a.asset_type); const p = String(a.performance || '').toUpperCase();
    ((perf[t] = perf[t] || {})[p] = (perf[t] || {})[p] || {})[String(a.asset_id)] = true;
  });
  const cnt = (t: string, p: string) => Object.keys((perf[t] || {})[p] || {}).length;
  const counts = [['TEXT', 'Text (headlines, descriptions)'], ['IMAGE', 'Images'], ['YOUTUBE_VIDEO', 'Videos']].map(([t, label]) => ({ type: label, best: cnt(t, 'BEST'), good: cnt(t, 'GOOD'), learning: cnt(t, 'LEARNING'), low: cnt(t, 'LOW') }));
  const lowByKind = { text: cnt('TEXT', 'LOW'), image: cnt('IMAGE', 'LOW'), video: cnt('YOUTUBE_VIDEO', 'LOW') };
  const lowTotal = lowByKind.text + lowByKind.image + lowByKind.video;

  const lowMap: Record<string, LowAsset & { groups: Record<string, boolean>; firstWhere: string }> = {};
  live.filter((a) => String(a.performance || '').toUpperCase() === 'LOW' && KIND[String(a.asset_type)]).forEach((a) => {
    const id = String(a.asset_id);
    const where = `${short(String(a.campaign))} › ${a.ad_group}`;
    const x = lowMap[id] || (lowMap[id] = {
      kind: KIND[String(a.asset_type)],
      field: ({ HEADLINE: 'Headline', DESCRIPTION: 'Description', MARKETING_IMAGE: 'Image', SQUARE_MARKETING_IMAGE: 'Image', PORTRAIT_MARKETING_IMAGE: 'Image', YOUTUBE_VIDEO: 'Video' } as Record<string, string>)[String(a.field)] || String(a.field),
      content: String(a.text_or_title || ''),
      size: a.width ? `${a.width}×${a.height}` : '',
      where: '', impressions: 0, conversions: 0, groups: {}, firstWhere: where,
    });
    x.groups[where] = true;
    x.impressions += n(a.impressions); x.conversions += n(a.conversions);
  });
  const low: LowAsset[] = Object.keys(lowMap).map((k) => {
    const x = lowMap[k];
    const g = Object.keys(x.groups).length;
    return { kind: x.kind, field: x.field, content: x.content, size: x.size, where: x.firstWhere + (g > 1 ? ` (+${g - 1} more)` : ''), impressions: Math.round(x.impressions), conversions: Math.round(x.conversions) };
  }).sort((a, b) => b.impressions - a.impressions);

  // Format gaps per ad group.
  const groups: Record<string, { imgs: Record<string, { w: number; h: number }>; vids: Record<string, boolean>; imp: number }> = {};
  live.forEach((a) => {
    const k = `${short(String(a.campaign))} › ${a.ad_group}`;
    const g = groups[k] || (groups[k] = { imgs: {}, vids: {}, imp: 0 });
    if (String(a.asset_type) === 'IMAGE') g.imgs[String(a.asset_id)] = { w: n(a.width), h: n(a.height) };
    if (String(a.asset_type) === 'YOUTUBE_VIDEO') g.vids[String(a.asset_id)] = true;
    g.imp += n(a.cost); // overlapping asset cost: only used to rank ad groups by how busy they are
  });
  const gk = Object.keys(groups);
  const withPortrait = gk.filter((k) => Object.keys(groups[k].imgs).some((i) => groups[k].imgs[i].h > groups[k].imgs[i].w)).length;
  const bigNoVideo = gk.filter((k) => !Object.keys(groups[k].vids).length).sort((a, b) => groups[b].imp - groups[a].imp).slice(0, 2);
  const flags: { title: string; detail: string }[] = [];
  if (gk.length && withPortrait / gk.length < 0.5) flags.push({ title: 'Few vertical images', detail: `Only ${withPortrait} of ${gk.length} live ad groups have a vertical (portrait) image.` });
  if (bigNoVideo.length) flags.push({ title: 'Big ad groups with no video', detail: `${bigNoVideo.map((k) => `“${k}”`).join(' and ')} run without any video.` });
  const topLowText = low.filter((l) => l.kind === 'text').slice(0, 10);
  if (topLowText.length) flags.push({ title: 'Low-rated text in busy ad groups', detail: `Start with “${topLowText[0].where.replace(/ \(\+\d+ more\)$/, '')}”.` });
  if (lowTotal) alarms.push({ level: 'Warning', title: `${lowTotal} live assets rated Low by Google`, detail: `${lowByKind.image} images, ${lowByKind.text} text lines and ${lowByKind.video} videos.`, action: 'Replace the most-shown ones first: see “Low-rated assets to replace”.' });

  const topLowImg = low.filter((l) => l.kind === 'image').slice(0, 10);
  const landscape = topLowImg.filter((l) => { const m = l.size.split('×'); return n(m[0]) > n(m[1]); }).length;
  const topLowVid = low.filter((l) => l.kind === 'video');
  const textGroupCounts: Record<string, number> = {};
  topLowText.forEach((l) => { const g = l.where.replace(/ \(\+\d+ more\)$/, ''); textGroupCounts[g] = (textGroupCounts[g] || 0) + 1; });
  const busiest = Object.keys(textGroupCounts).sort((a, b) => textGroupCounts[b] - textGroupCounts[a])[0];
  const patterns = {
    text: busiest ? `${textGroupCounts[busiest]} of the ${topLowText.length} most-shown Low text assets are in “${busiest}”. Similar lines get rated Low together, so replace them with different angles rather than rewording.` : 'No Low text assets.',
    image: topLowImg.length ? `${landscape} of the ${topLowImg.length} most-shown Low images are landscape. Add square (1:1) and vertical (4:5 or 9:16) versions of your best images.` : 'No Low images.',
    video: topLowVid.length ? `Low videos reach ${Math.max.apply(null, topLowVid.map((v) => v.impressions)).toLocaleString('en-IN')} impressions at most, so they cost little. Lower priority: swap in vertical 9:16 cuts of your Best videos at the next refresh.` : 'No Low videos.',
  };

  // ---------- Actions ----------
  const actions: Action[] = [];
  const costly = rows.filter((r) => r.kind === 'install' && (r.verdict === 'Watch' || r.verdict === 'Cut') && r.costPerFirstOrder !== null);
  const scale = rows.filter((r) => r.verdict === 'Scale' && r.costPerFirstOrder !== null);
  if (costly.length && scale.length) {
    const move = Math.round(costly.reduce((t, r) => t + r.spend, 0) * R.shiftShare / 100) * 100;
    const scaleCost = median(scale.map((r) => r.costPerFirstOrder as number)) as number;
    const costlyCost = median(costly.map((r) => r.costPerFirstOrder as number)) as number;
    const gain = Math.round(move / scaleCost - move / costlyCost);
    actions.push({ verb: 'Shift budget', title: `Move ~${inr(move)} a week from ${andList(costly.map((r) => short(r.name)))} to ${andList(scale.map((r) => short(r.name)))}`, detail: `They cost ${andList(scale.map((r) => inr(r.costPerFirstOrder as number)))} per first order against ${andList(costly.map((r) => inr(r.costPerFirstOrder as number)))}. Raise in 20–30% steps so cost holds.`, impact: `Roughly ${gain >= 0 ? '+' : ''}${gain} first orders a week (estimate)`, targets: costly.concat(scale).map((r) => r.name), metric: 'google_fo' });
  }
  const cuts = rows.filter((r) => r.verdict === 'Cut');
  if (cuts.length) actions.push({ verb: 'Cut', title: `Pause or halve ${andList(cuts.map((r) => short(r.name)))}`, detail: cuts[0].why, impact: `Saves up to ${inr(cuts.reduce((t, r) => t + r.spend, 0))} a week`, targets: cuts.map((r) => r.name), metric: 'google_fo' });
  const allOrderCampaigns = rows.filter((r) => r.kind === 'engage' && /all orders/.test(r.bidsOn));
  if (allOrderCampaigns.length) actions.push({ verb: 'Decide', title: `Set the goal for ${andList(allOrderCampaigns.map((r) => short(r.name)))}`, detail: `They bid on all orders, including repeats (${andList(allOrderCampaigns.map((r) => (r.costPerOrder !== null ? inr(r.costPerOrder) : '—') + ' per order'))}). If repeat orders are the goal, judge them on that; if not, switch their bidding event.`, impact: `${inr(allOrderCampaigns.reduce((t, r) => t + r.spend, 0))} a week judged on the right goal`, targets: allOrderCampaigns.map((r) => r.name), metric: 'google_orders' });
  if (lowTotal || flags.length) actions.push({ verb: 'Refresh', title: 'Replace Low assets and fill format gaps', detail: flags.map((f) => f.detail).join(' '), impact: 'More placements open to Google, especially YouTube Shorts and Discover', targets: [], metric: 'google_low_assets' });
  rows.filter((r) => r.invalidRate !== null && r.invalidRate >= R.invalidClickAlarm * 100).forEach((r) => actions.push({ verb: 'Fix', title: `Check ${short(r.name)}’s placements`, detail: `${r.invalidRate}% invalid clicks last week.`, impact: 'Cleaner traffic for the same budget', targets: [r.name], metric: 'google_invalid' }));

  const rank = { Critical: 0, Warning: 1, Watch: 2 };
  alarms.sort((a, b) => rank[a.level] - rank[b.level]);

  const unmatchedBranch = branchThis ? Object.keys(branchThis).filter((k) => !matched[k] && branchThis[k].orders + branchThis[k].installs > 0) : [];

  const spendChg = pct(spend, spendPrev);
  const headline = `Last 7 days: ${inr(spend)} spend${spendChg !== null ? ` (${spendChg > 0 ? '+' : ''}${spendChg}%)` : ''}, ${foFinal} first orders at ${totals.costPerFirstOrder !== null ? inr(totals.costPerFirstOrder) : '—'} each${cpfoChg !== null ? ` (${cpfoChg > 0 ? '+' : ''}${cpfoChg}% vs the week before)` : ''}, ${installsT.toLocaleString('en-IN')} installs.`;

  return {
    weekStart: wStart, weekEnd: end, totals, headline, campaigns: rows, medianCost: med === null ? null : Math.round(med),
    alarms, actions, networks,
    locations: { allClear: outsideShare < R.outsideNcrAlarm, outsideShare: Math.round(outsideShare * 1000) / 10, presenceOrInterest: poi, cities: Object.keys(city).sort((a, b) => city[b].s - city[a].s).slice(0, 8).map((k) => ({ name: k, spend: Math.round(city[k].s), ncr: city[k].ncr })) },
    assets: { counts, lowTotal, lowByKind, low, flags, patterns },
    unmatchedBranch,
  };
}
