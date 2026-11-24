import { unstable_cache } from 'next/cache';
import { scoreAds, type AdFatigue, type AdInfo, type DailyRow } from './score';
import type { DayTotal } from './insights';
import { BUSINESSES, type Business, type BusinessKey } from '../stark/businesses';

export * from './score';
export * from './insights';

const GRAPH = 'https://graph.facebook.com/v19.0';
const WINDOW_DAYS = 35; // enough for a first week, a recent week and ads up to a month old
const DAY = 86400000;

export type FatigueReport = {
  business: BusinessKey;
  windowStart: string;
  windowEnd: string;
  fetchedAt: string;
  resultActionUsed: string | null; // which Meta action type was counted as a result
  ads: AdFatigue[];
  days: DayTotal[]; // daily account totals, for week-on-week alarms
};

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Counts one result per row: the first action type in the business's list that the row has.
function resultsFrom(actions: any[] | undefined, wanted: string[], seen: Record<string, number>): number {
  const list = actions || [];
  for (const type of wanted) {
    const a = list.find((x: any) => x.action_type === type);
    if (a) {
      const v = Number(a.value) || 0;
      seen[type] = (seen[type] || 0) + v;
      return v;
    }
  }
  return 0;
}

// Follows Meta's paging until done (capped so a bad response can't loop forever).
async function getAll(url: string): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < 60; page++) {
    const res: Response = await fetch(next, { cache: 'no-store' });
    const json: any = await res.json();
    if (json.error) throw new Error(`Meta: ${json.error.message}`);
    rows.push(...(json.data || []));
    next = json.paging?.next || null;
  }
  return rows;
}

function insightsUrl(account: string, token: string, fields: string, since: string, until: string, daily: boolean) {
  const u = new URL(`${GRAPH}/${account}/insights`);
  u.searchParams.set('level', 'ad');
  u.searchParams.set('fields', fields);
  u.searchParams.set('time_range', JSON.stringify({ since, until }));
  if (daily) u.searchParams.set('time_increment', '1');
  u.searchParams.set('limit', '500');
  u.searchParams.set('access_token', token);
  return u.toString();
}

// Launch date (created_time) for each ad.
async function fetchLaunchDates(token: string, adIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const reqs = batch.map((id) => ({ method: 'GET', relative_url: `${id}?fields=created_time` }));
    try {
      const res = await fetch(`${GRAPH}/?batch=${encodeURIComponent(JSON.stringify(reqs))}&access_token=${token}&include_headers=false`, { method: 'POST', cache: 'no-store' });
      const json: any = await res.json();
      if (Array.isArray(json)) {
        json.forEach((item: any, idx: number) => {
          try {
            const d = JSON.parse(item.body);
            out[batch[idx]] = d.created_time ? String(d.created_time).slice(0, 10) : null;
          } catch {
            out[batch[idx]] = null;
          }
        });
      }
    } catch {}
  }
  return out;
}

// Lifetime totals per ad (since launch), fetched only for the ads we score.
async function fetchLifetime(b: Business, token: string, adIds: string[]) {
  const out: Record<string, { spend: number; impressions: number; clicks: number; installs: number }> = {};
  const seen: Record<string, number> = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const ids = adIds.slice(i, i + 50);
    const u = new URL(`${GRAPH}/${b.metaAccountId}/insights`);
    u.searchParams.set('level', 'ad');
    u.searchParams.set('fields', 'ad_id,spend,impressions,clicks,actions');
    u.searchParams.set('date_preset', 'maximum');
    u.searchParams.set('filtering', JSON.stringify([{ field: 'ad.id', operator: 'IN', value: ids }]));
    u.searchParams.set('limit', '500');
    u.searchParams.set('access_token', token);
    try {
      const rows = await getAll(u.toString());
      rows.forEach((r: any) => {
        out[r.ad_id] = { spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, installs: resultsFrom(r.actions, b.resultActions, seen) };
      });
    } catch {} // lifetime numbers are extra context; the page still works without them
  }
  return out;
}

function windowDates() {
  // Window ends yesterday (IST) so every day in it is complete.
  const nowIst = Date.now() + 5.5 * 3600 * 1000;
  const endMs = Date.UTC(new Date(nowIst).getUTCFullYear(), new Date(nowIst).getUTCMonth(), new Date(nowIst).getUTCDate()) - DAY;
  return { endMs, windowEnd: ymd(endMs), windowStart: ymd(endMs - (WINDOW_DAYS - 1) * DAY), recentStart: ymd(endMs - 6 * DAY) };
}

async function buildReport(key: BusinessKey): Promise<FatigueReport> {
  const b = BUSINESSES[key];
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN is missing in Vercel');
  const { endMs, windowEnd, windowStart, recentStart } = windowDates();

  const [daily, last7] = await Promise.all([
    getAll(insightsUrl(b.metaAccountId, token, 'ad_id,ad_name,adset_id,adset_name,campaign_name,impressions,clicks,spend,actions', windowStart, windowEnd, true)),
    getAll(insightsUrl(b.metaAccountId, token, 'ad_id,frequency', recentStart, windowEnd, false)),
  ]);

  const seen: Record<string, number> = {};
  const rows: DailyRow[] = daily.map((r: any) => ({
    adId: r.ad_id,
    date: r.date_start,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    spend: Number(r.spend) || 0,
    installs: resultsFrom(r.actions, b.resultActions, seen), // "installs" = this business's result (installs or sign-ups)
  }));
  const used = Object.keys(seen).sort((x, y) => seen[y] - seen[x])[0] || null;

  const frequency7: Record<string, number> = {};
  last7.forEach((r: any) => { if (r.frequency) frequency7[r.ad_id] = Number(r.frequency); });

  const recentIds: string[] = [];
  const isRecent: Record<string, boolean> = {};
  daily.forEach((r: any) => {
    if (r.date_start >= ymd(endMs - 13 * DAY) && Number(r.impressions) > 0 && !isRecent[r.ad_id]) { isRecent[r.ad_id] = true; recentIds.push(r.ad_id); }
  });
  const [launch, lifetime] = await Promise.all([fetchLaunchDates(token, recentIds), fetchLifetime(b, token, recentIds)]);

  const info: Record<string, AdInfo> = {};
  daily.forEach((r: any) => {
    if (!info[r.ad_id]) {
      info[r.ad_id] = {
        adId: r.ad_id, adName: r.ad_name, adsetId: r.adset_id, adsetName: r.adset_name, campaignName: r.campaign_name,
        side: 'Demand', launchDate: launch[r.ad_id] ?? null, lifetime: lifetime[r.ad_id] ?? null,
      };
    }
  });

  const totals: Record<string, DayTotal> = {};
  rows.forEach((r) => {
    const t = totals[r.date] || (totals[r.date] = { date: r.date, side: 'Demand', spend: 0, impressions: 0, clicks: 0, installs: 0 });
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.installs += r.installs;
  });

  return {
    business: key, windowStart, windowEnd, fetchedAt: new Date().toISOString(), resultActionUsed: used,
    ads: scoreAds(rows, info, frequency7, windowStart, windowEnd, b.result.costLong),
    days: Object.keys(totals).map((k) => totals[k]),
  };
}

// One cache per business, recalculated at most every 3 hours or when someone clicks Refresh.
const cached: Record<BusinessKey, () => Promise<FatigueReport>> = {
  lm: unstable_cache(() => buildReport('lm'), ['creative-fatigue-v3-lm'], { revalidate: 3 * 60 * 60, tags: ['creative-fatigue'] }),
  quick: unstable_cache(() => buildReport('quick'), ['creative-fatigue-v3-quick'], { revalidate: 3 * 60 * 60, tags: ['creative-fatigue'] }),
};
export const getFatigueReport = (key: BusinessKey) => cached[key]();

// For checking which Meta action types an account reports (e.g. what "SignUp" is called), last 7 days.
export async function listActionTypes(key: BusinessKey) {
  const b = BUSINESSES[key];
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN is missing in Vercel');
  const u = new URL(`${GRAPH}/${b.metaAccountId}/insights`);
  u.searchParams.set('fields', 'actions,spend');
  u.searchParams.set('date_preset', 'last_7d');
  u.searchParams.set('access_token', token);
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const json: any = await res.json();
  if (json.error) throw new Error(`Meta: ${json.error.message}`);
  const row = (json.data || [])[0] || {};
  return {
    account: b.metaAccountId,
    countedAsResult: b.resultActions,
    spendLast7Days: row.spend || '0',
    actionTypes: (row.actions || []).map((a: any) => ({ type: a.action_type, last7Days: Number(a.value) })).sort((x: any, y: any) => y.last7Days - x.last7Days),
  };
}
