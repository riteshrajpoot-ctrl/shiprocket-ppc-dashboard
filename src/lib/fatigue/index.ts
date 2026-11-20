import { unstable_cache } from 'next/cache';
import { scoreAds, type AdFatigue, type AdInfo, type DailyRow } from './score';

export * from './score';

const META_ACCOUNT_ID = 'act_596746546417726'; // Shiprocket Quick, same as the other Meta routes
const GRAPH = 'https://graph.facebook.com/v19.0';
const WINDOW_DAYS = 35; // enough for a first week, a recent week and ads up to a month old
const DAY = 86400000;

export type FatigueReport = {
  windowStart: string;
  windowEnd: string;
  fetchedAt: string;
  ads: AdFatigue[];
};

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function installsFrom(actions: any[] | undefined): number {
  const a = (actions || []).find((x: any) => x.action_type === 'mobile_app_install');
  return a ? Number(a.value) || 0 : 0;
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

function insightsUrl(token: string, fields: string, since: string, until: string, daily: boolean) {
  const u = new URL(`${GRAPH}/${META_ACCOUNT_ID}/insights`);
  u.searchParams.set('level', 'ad');
  u.searchParams.set('fields', fields);
  u.searchParams.set('time_range', JSON.stringify({ since, until }));
  if (daily) u.searchParams.set('time_increment', '1');
  u.searchParams.set('limit', '500');
  u.searchParams.set('access_token', token);
  return u.toString();
}

// Same Supply/Demand rule as /api/management-metrics: Quick Partner app link = Supply.
async function detectSides(token: string, adIds: string[]): Promise<Record<string, 'Supply' | 'Demand'>> {
  const side: Record<string, 'Supply' | 'Demand'> = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const reqs = batch.map((id) => ({ method: 'GET', relative_url: `${id}?fields=creative{object_store_url,object_story_spec}` }));
    try {
      const res = await fetch(`${GRAPH}/?batch=${encodeURIComponent(JSON.stringify(reqs))}&access_token=${token}&include_headers=false`, { method: 'POST', cache: 'no-store' });
      const json: any = await res.json();
      if (Array.isArray(json)) {
        json.forEach((item: any, idx: number) => {
          let s: 'Supply' | 'Demand' = 'Demand';
          try {
            const d = JSON.parse(item.body);
            const url = d.creative?.object_store_url || d.creative?.object_story_spec?.link_data?.link || '';
            if (String(url).includes('quickpartner')) s = 'Supply';
          } catch {}
          side[batch[idx]] = s;
        });
      }
    } catch {}
  }
  return side;
}

async function buildReport(): Promise<FatigueReport> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN is missing in Vercel');

  // Window ends yesterday (IST) so every day in it is complete.
  const nowIst = Date.now() + 5.5 * 3600 * 1000;
  const endMs = Date.UTC(new Date(nowIst).getUTCFullYear(), new Date(nowIst).getUTCMonth(), new Date(nowIst).getUTCDate()) - DAY;
  const windowEnd = ymd(endMs);
  const windowStart = ymd(endMs - (WINDOW_DAYS - 1) * DAY);
  const recentStart = ymd(endMs - 6 * DAY);

  const [daily, last7] = await Promise.all([
    getAll(insightsUrl(token, 'ad_id,ad_name,adset_id,adset_name,campaign_name,impressions,clicks,spend,actions', windowStart, windowEnd, true)),
    getAll(insightsUrl(token, 'ad_id,frequency', recentStart, windowEnd, false)),
  ]);

  const rows: DailyRow[] = daily.map((r: any) => ({
    adId: r.ad_id,
    date: r.date_start,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    spend: Number(r.spend) || 0,
    installs: installsFrom(r.actions),
  }));

  const frequency7: Record<string, number> = {};
  last7.forEach((r: any) => { if (r.frequency) frequency7[r.ad_id] = Number(r.frequency); });

  const recentIds: string[] = [];
  const seen: Record<string, boolean> = {};
  daily.forEach((r: any) => {
    if (r.date_start >= recentStart && Number(r.impressions) > 0 && !seen[r.ad_id]) { seen[r.ad_id] = true; recentIds.push(r.ad_id); }
  });
  const sides = await detectSides(token, recentIds);

  const info: Record<string, AdInfo> = {};
  daily.forEach((r: any) => {
    if (!info[r.ad_id]) {
      info[r.ad_id] = {
        adId: r.ad_id,
        adName: r.ad_name,
        adsetId: r.adset_id,
        adsetName: r.adset_name,
        campaignName: r.campaign_name,
        side: sides[r.ad_id] || 'Demand',
      };
    }
  });

  return { windowStart, windowEnd, fetchedAt: new Date().toISOString(), ads: scoreAds(rows, info, frequency7, windowStart, windowEnd) };
}

// Recomputed at most every 3 hours, or when someone clicks Refresh.
export const getFatigueReport = unstable_cache(buildReport, ['creative-fatigue-v1'], { revalidate: 3 * 60 * 60, tags: ['creative-fatigue'] });
