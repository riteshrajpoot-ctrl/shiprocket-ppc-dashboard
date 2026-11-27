// STARK 2.0 action tracking: every recommendation gets a status (Done, Partly done, Not relevant, Not done),
// is frozen per week with its "before" numbers, and is measured 7 days after the action.
import { neon } from '@neondatabase/serverless';
import type { BusinessKey } from './businesses';
import { isAnyOrder, isFirstOrder, isPartner, type Tabs } from '../google/insights';

export type RecPage = 'google' | 'fatigue';
export type RecStatus = 'done' | 'partly' | 'skip' | 'not';
export type RecMetricKind = 'google_fo' | 'google_orders' | 'google_low_assets' | 'google_invalid' | 'meta_results' | 'meta_launch' | 'meta_low_delivery';

export type RecInput = { page: RecPage; verb: string; title: string; detail: string; impactText: string; targets: string[]; metric: RecMetricKind };
export type Measure = { spend?: number; results?: number; value?: number };
export type StoredRec = RecInput & { id: string; business: BusinessKey; weekStart: string; baseline: Measure | null; createdAt: string };
// changedOn = the day the change was really made (picked by the person, or taken from Google's change history).
export type StatusRow = { recId: string; status: RecStatus; note: string; by: string; updatedAt: string; changedOn: string | null };
export type Impact = {
  due: boolean; readyOn: string;
  before: Measure | null; after: Measure | null;
  resultsDelta: number | null; saving: number | null;
  summary: string; headline: string; good: boolean | null;
};

export const STATUS_LABEL: Record<RecStatus, string> = { done: 'Done', partly: 'Partly done', skip: 'Not relevant', not: 'Not done' };
const DAY = 86400000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
const inr = (v: number) => '₹' + Math.round(v).toLocaleString('en-IN');
const n = (v: unknown) => Number(v) || 0;
const istDay = (ms: number) => ymd(ms + 5.5 * 3600 * 1000);

// Monday (IST) of the week containing ms.
export function weekStartOf(ms: number = Date.now()): string {
  const d = toMs(istDay(ms));
  const dow = new Date(d).getUTCDay(); // 0 = Sunday
  return ymd(d - ((dow + 6) % 7) * DAY);
}
export const previousWeek = (w: string) => ymd(toMs(w) - 7 * DAY);

// Stable ID: same business, page, week, action and targets = same recommendation (so a status sticks).
function hash(s: string): string {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}
export function recId(business: string, weekStart: string, r: RecInput): string {
  const who = r.targets.length ? r.targets.slice().sort().join(',') : r.title.replace(/[\d,₹~.]+/g, '').toLowerCase();
  return hash([business, r.page, weekStart, r.verb, r.metric, who].join('|'));
}

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel');
  return neon(process.env.DATABASE_URL);
}

let ready = false;
async function ensureTables(sql: any) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS stark_recs (
    id text PRIMARY KEY, business text NOT NULL, page text NOT NULL, week_start text NOT NULL,
    verb text NOT NULL, title text NOT NULL, detail text, impact_text text,
    targets jsonb NOT NULL DEFAULT '[]', metric text NOT NULL, baseline jsonb, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS stark_rec_status (
    rec_id text PRIMARY KEY, status text NOT NULL, note text, by_name text, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS stark_rec_results (
    rec_id text PRIMARY KEY, measured_at timestamptz NOT NULL DEFAULT now(), impact jsonb NOT NULL)`;
  await sql`ALTER TABLE stark_rec_status ADD COLUMN IF NOT EXISTS changed_on text`;
  await sql`CREATE TABLE IF NOT EXISTS stark_rec_dismissed (
    rec_id text NOT NULL, change_key text NOT NULL, by_name text, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (rec_id, change_key))`;
  ready = true;
}

// ---------- Measuring ----------

export type MeasureCtx = {
  google?: { tabs: Tabs; dataEnd: string; lowAssets: number };
  meta?: { adDaily: Record<string, [string, number, number][]>; dataEnd: string; launches: string[]; lowDelivery: number; resultMany: string };
};

function googleWindow(tabs: Tabs, targets: string[], start: string, end: string, metric: RecMetricKind): Measure {
  const set: Record<string, boolean> = {};
  targets.forEach((t) => { set[t] = true; });
  const inW = (d: string) => d >= start && d <= end;
  let spend = 0, results = 0, clicks = 0, invalid = 0;
  (tabs.campaigns_daily || []).forEach((r) => { if (set[String(r.campaign)] && inW(String(r.date).slice(0, 10))) spend += n(r.cost); });
  (tabs.conversions_daily || []).forEach((r) => {
    const a = String(r.conversion_action || '');
    if (!set[String(r.campaign)] || !inW(String(r.date).slice(0, 10)) || isPartner(a)) return;
    if (metric === 'google_fo' && isFirstOrder(a)) results += n(r.all_conversions);
    if (metric === 'google_orders' && isAnyOrder(a)) results += n(r.all_conversions);
  });
  if (metric === 'google_invalid') {
    (tabs.invalid_clicks_daily || []).forEach((r) => {
      if (set[String(r.campaign)] && inW(String(r.date).slice(0, 10))) { clicks += n(r.clicks); invalid += n(r.invalid_clicks); }
    });
    return { spend: Math.round(spend), value: clicks + invalid ? Math.round((invalid / (clicks + invalid)) * 1000) / 10 : 0 };
  }
  return { spend: Math.round(spend), results: Math.round(results) };
}

function metaWindow(adDaily: Record<string, [string, number, number][]>, targets: string[], start: string, end: string): Measure {
  let spend = 0, results = 0;
  targets.forEach((id) => (adDaily[id] || []).forEach((d) => { if (d[0] >= start && d[0] <= end) { spend += d[1]; results += d[2]; } }));
  return { spend: Math.round(spend), results: Math.round(results) };
}

// The "before" numbers saved when a recommendation first appears: the latest settled 7 days.
export function baselineFor(r: RecInput, ctx: MeasureCtx): Measure | null {
  if (r.metric.indexOf('google') === 0 && ctx.google) {
    const g = ctx.google;
    if (r.metric === 'google_low_assets') return { value: g.lowAssets };
    return googleWindow(g.tabs, r.targets, ymd(toMs(g.dataEnd) - 6 * DAY), g.dataEnd, r.metric);
  }
  if (r.metric.indexOf('meta') === 0 && ctx.meta) {
    const m = ctx.meta;
    if (r.metric === 'meta_low_delivery') return { value: m.lowDelivery };
    if (r.metric === 'meta_launch') {
      const s = ymd(toMs(m.dataEnd) - 6 * DAY);
      return { value: m.launches.filter((d) => d >= s && d <= m.dataEnd).length };
    }
    return metaWindow(m.adDaily, r.targets, ymd(toMs(m.dataEnd) - 6 * DAY), m.dataEnd);
  }
  return null;
}

const RESULT_WORD: Record<string, string> = { google_fo: 'first orders', google_orders: 'orders' };

// Before = the 7 days before the action (or the saved baseline); after = the 7 days from the action.
// "Not done" recommendations are measured from the start of their week, to show what happened anyway.
export function measure(rec: StoredRec, status: StatusRow | undefined, ctx: MeasureCtx): Impact | null {
  if (status && status.status === 'skip') return null;
  const acted = status && (status.status === 'done' || status.status === 'partly');
  const a = acted ? status!.changedOn || istDay(Date.parse(status!.updatedAt)) : rec.weekStart;
  const aMs = toMs(a);
  const afterEnd = ymd(aMs + 6 * DAY);
  const readyOn = ymd(aMs + 7 * DAY);
  const isGoogle = rec.metric.indexOf('google') === 0;
  const src = isGoogle ? ctx.google : ctx.meta;
  const none: Impact = { due: false, readyOn, before: null, after: null, resultsDelta: null, saving: null, summary: '', headline: '', good: null };
  if (!src) return none;
  const word = RESULT_WORD[rec.metric] || (ctx.meta ? ctx.meta.resultMany : 'results');

  // Count-type recommendations: compare the saved number with today's.
  if (rec.metric === 'google_low_assets' || rec.metric === 'meta_low_delivery') {
    if (Date.now() < toMs(readyOn)) return none;
    const before = rec.baseline && rec.baseline.value !== undefined ? rec.baseline.value : null;
    const after = rec.metric === 'google_low_assets' ? ctx.google!.lowAssets : ctx.meta!.lowDelivery;
    const what = rec.metric === 'google_low_assets' ? 'Low-rated assets' : 'Low-delivery ads';
    const diff = before === null ? null : after - before;
    return {
      due: true, readyOn, before: before === null ? null : { value: before }, after: { value: after }, resultsDelta: null, saving: null,
      summary: `${what}: ${before === null ? '—' : before} → ${after}.`,
      headline: diff === null ? '—' : diff < 0 ? `${diff} ${what.toLowerCase()}` : diff === 0 ? 'No change' : `+${diff} ${what.toLowerCase()}`,
      good: diff === null ? null : diff < 0,
    };
  }

  if (afterEnd > src.dataEnd) return none; // the 7 days after the action haven't fully settled yet
  const beforeStart = ymd(aMs - 7 * DAY), beforeEnd = ymd(aMs - DAY);

  if (rec.metric === 'meta_launch') {
    const launches = ctx.meta!.launches;
    const before = launches.filter((d) => d >= beforeStart && d <= beforeEnd).length;
    const after = launches.filter((d) => d >= a && d <= afterEnd).length;
    return { due: true, readyOn, before: { value: before }, after: { value: after }, resultsDelta: null, saving: null,
      summary: `New creatives launched: ${before} the week before, ${after} the week after.`, headline: `${after} launched`, good: after > 0 };
  }

  const win = (s: string, e: string): Measure => (isGoogle ? googleWindow(ctx.google!.tabs, rec.targets, s, e, rec.metric) : metaWindow(ctx.meta!.adDaily, rec.targets, s, e));
  const after = win(a, afterEnd);
  // If the "before" week has dropped out of the data, use the numbers saved when the recommendation appeared.
  const dataStart = isGoogle
    ? (ctx.google!.tabs.campaigns_daily || []).reduce((m, r) => (String(r.date).slice(0, 10) < m ? String(r.date).slice(0, 10) : m), '9999')
    : '0000';
  const before = beforeStart >= dataStart ? win(beforeStart, beforeEnd) : rec.baseline || win(beforeStart, beforeEnd);

  if (rec.metric === 'google_invalid') {
    const b = before.value ?? 0, af = after.value ?? 0;
    return { due: true, readyOn, before, after, resultsDelta: null, saving: null,
      summary: `Invalid clicks ${b}% → ${af}%.`, headline: `${b}% → ${af}%`, good: af < b };
  }

  const bs = before.spend || 0, br = before.results || 0, as = after.spend || 0, ar = after.results || 0;
  const cb = br ? bs / br : null, ca = ar ? as / ar : null;
  const saving = cb !== null && ca !== null ? Math.round((cb - ca) * ar) : null;
  // If spend moved a lot, raw before/after mostly reflects the spend change, so compare at the same spend:
  // extra results = results after − what the "before" cost per result would have bought with the "after" spend.
  const spendShift = bs ? Math.abs(as / bs - 1) : 1;
  const sameSpend = spendShift > 0.15 && cb !== null;
  const delta = sameSpend ? Math.round(ar - as / (cb as number)) : ar - br;
  const one = word.replace(/s$/, '');
  const summary = `Spend ${inr(bs)} → ${inr(as)}, ${word} ${br} → ${ar}${cb !== null && ca !== null ? `, cost per ${one} ${inr(cb)} → ${inr(ca)}` : ''}.` +
    (sameSpend ? ` Spend changed ${Math.round((as / bs - 1) * 100)}%, so results are compared at the same spend.` : '');
  let headline = `${delta >= 0 ? '+' : ''}${delta} ${word}${sameSpend ? ' at same spend' : ''}`;
  if (saving !== null && saving !== 0 && ca !== null && Math.abs(saving) >= Math.abs(delta) * ca) headline = saving > 0 ? `${inr(saving)} saved` : `${inr(-saving)} extra cost`;
  return { due: true, readyOn, before, after, resultsDelta: delta, saving, summary, headline, good: saving !== null ? saving >= 0 : delta >= 0 };
}

// ---------- Database ----------

function rowToRec(r: any): StoredRec {
  return {
    id: r.id, business: r.business, page: r.page, weekStart: r.week_start, verb: r.verb, title: r.title, detail: r.detail || '',
    impactText: r.impact_text || '', targets: r.targets || [], metric: r.metric, baseline: r.baseline || null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// Saves this week's recommendations (first sighting keeps its baseline) and returns them with their IDs.
export async function syncRecs(business: BusinessKey, recs: RecInput[], ctx: MeasureCtx): Promise<StoredRec[]> {
  const sql = db();
  await ensureTables(sql);
  const week = weekStartOf();
  const out: StoredRec[] = [];
  for (const r of recs) {
    const id = recId(business, week, r);
    const baseline = baselineFor(r, ctx);
    await sql`INSERT INTO stark_recs (id, business, page, week_start, verb, title, detail, impact_text, targets, metric, baseline)
      VALUES (${id}, ${business}, ${r.page}, ${week}, ${r.verb}, ${r.title}, ${r.detail}, ${r.impactText}, ${JSON.stringify(r.targets)}::jsonb, ${r.metric}, ${baseline ? JSON.stringify(baseline) : null}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    out.push({ ...r, id, business, weekStart: week, baseline, createdAt: new Date().toISOString() });
  }
  return out;
}

export async function listRecs(business: BusinessKey, fromWeek: string, page?: RecPage): Promise<StoredRec[]> {
  const sql = db();
  await ensureTables(sql);
  const rows = (page
    ? await sql`SELECT * FROM stark_recs WHERE business = ${business} AND page = ${page} AND week_start >= ${fromWeek} ORDER BY week_start DESC, created_at`
    : await sql`SELECT * FROM stark_recs WHERE business = ${business} AND week_start >= ${fromWeek} ORDER BY week_start DESC, created_at`) as any[];
  return rows.map(rowToRec);
}

export async function getStatuses(ids: string[]): Promise<Record<string, StatusRow>> {
  if (!ids.length) return {};
  const sql = db();
  await ensureTables(sql);
  const rows = (await sql`SELECT * FROM stark_rec_status WHERE rec_id = ANY(${ids})`) as any[];
  const out: Record<string, StatusRow> = {};
  rows.forEach((r) => { out[r.rec_id] = toStatus(r); });
  return out;
}

function toStatus(r: any): StatusRow {
  return { recId: r.rec_id, status: r.status, note: r.note || '', by: r.by_name || '', updatedAt: new Date(r.updated_at).toISOString(), changedOn: r.changed_on || null };
}

export async function setStatus(id: string, status: RecStatus, note: string, by: string, changedOn: string | null): Promise<StatusRow> {
  const sql = db();
  await ensureTables(sql);
  const exists = (await sql`SELECT week_start FROM stark_recs WHERE id = ${id}`) as any[];
  if (!exists.length) throw new Error('Unknown recommendation');
  let changed: string | null = null;
  if (status === 'done' || status === 'partly') {
    const today = istDay(Date.now());
    const earliest = ymd(toMs(exists[0].week_start) - 7 * DAY);
    changed = changedOn && /^\d{4}-\d\d-\d\d$/.test(changedOn) ? changedOn : today;
    if (changed > today) throw new Error('The change date can’t be in the future');
    if (changed < earliest) throw new Error('The change date is too long before this recommendation');
  }
  const rows = (await sql`INSERT INTO stark_rec_status (rec_id, status, note, by_name, updated_at, changed_on) VALUES (${id}, ${status}, ${note}, ${by}, now(), ${changed})
    ON CONFLICT (rec_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, by_name = EXCLUDED.by_name, updated_at = now(), changed_on = EXCLUDED.changed_on
    RETURNING *`) as any[];
  await sql`DELETE FROM stark_rec_results WHERE rec_id = ${id}`; // re-measure from the new change date
  return toStatus(rows[0]);
}

// "No, that change wasn't for this recommendation": remember it so it isn't suggested again.
export async function dismissChange(id: string, key: string, by: string): Promise<void> {
  const sql = db();
  await ensureTables(sql);
  await sql`INSERT INTO stark_rec_dismissed (rec_id, change_key, by_name) VALUES (${id}, ${key}, ${by}) ON CONFLICT DO NOTHING`;
}

export async function getDismissed(ids: string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {};
  const sql = db();
  await ensureTables(sql);
  const rows = (await sql`SELECT rec_id, change_key FROM stark_rec_dismissed WHERE rec_id = ANY(${ids})`) as any[];
  const out: Record<string, string[]> = {};
  rows.forEach((r) => { (out[r.rec_id] = out[r.rec_id] || []).push(r.change_key); });
  return out;
}

export async function getResults(ids: string[]): Promise<Record<string, Impact>> {
  if (!ids.length) return {};
  const sql = db();
  await ensureTables(sql);
  const rows = (await sql`SELECT rec_id, impact FROM stark_rec_results WHERE rec_id = ANY(${ids})`) as any[];
  const out: Record<string, Impact> = {};
  rows.forEach((r) => { out[r.rec_id] = r.impact; });
  return out;
}

// Stored result if there is one; otherwise measure now and store it once its week has settled.
export async function impactsFor(recs: StoredRec[], statuses: Record<string, StatusRow>, ctx: MeasureCtx): Promise<Record<string, Impact | null>> {
  const stored = await getResults(recs.map((r) => r.id));
  const sql = db();
  const out: Record<string, Impact | null> = {};
  for (const r of recs) {
    if (stored[r.id]) { out[r.id] = stored[r.id]; continue; }
    const m = measure(r, statuses[r.id], ctx);
    out[r.id] = m;
    if (m && m.due) await sql`INSERT INTO stark_rec_results (rec_id, impact) VALUES (${r.id}, ${JSON.stringify(m)}::jsonb) ON CONFLICT (rec_id) DO NOTHING`;
  }
  return out;
}
