// Claude rewrites Low-rated Google text assets, learning from the Best and Good assets in the same ad group
// and using only approved offers. Every suggestion is checked before it is shown.
import { neon } from '@neondatabase/serverless';
import type { Tabs } from '../google/insights';
import type { BusinessKey } from './businesses';
import { askClaude, parseJson } from './claude';
import type { Offer } from './offers';

export type RewriteOption = { text: string; why: string; offerIds: number[] };
export type RewriteItem = { assetId: string; field: 'Headline' | 'Description'; current: string; impressions: number; conversions: number; options: RewriteOption[]; removed: number };
export type RewriteResult = { campaign: string; adGroup: string; findings: string; items: RewriteItem[]; createdAt: string };
export type GroupSummary = { campaign: string; adGroup: string; lowText: number; strongText: number; lowImpressions: number };

const LIMIT = { Headline: 30, Description: 90 } as const;
type Asset = { id: string; field: 'Headline' | 'Description'; text: string; performance: string; impressions: number; conversions: number };
const n = (v: unknown) => Number(v) || 0;

function liveTextAssets(tabs: Tabs): (Asset & { campaign: string; adGroup: string })[] {
  const active: Record<string, boolean> = {};
  (tabs.campaign_settings || []).forEach((s) => { if (String(s.status) === 'ENABLED') active[String(s.campaign)] = true; });
  const byKey: Record<string, Asset & { campaign: string; adGroup: string }> = {};
  (tabs.assets_30d || []).forEach((a) => {
    if (String(a.asset_type) !== 'TEXT' || String(a.enabled) !== 'yes' || !active[String(a.campaign)]) return;
    const field = String(a.field) === 'HEADLINE' ? 'Headline' : String(a.field) === 'DESCRIPTION' ? 'Description' : null;
    if (!field) return;
    const k = `${a.campaign}|${a.ad_group}|${a.asset_id}|${field}`;
    const x = byKey[k] || (byKey[k] = { id: String(a.asset_id), field, text: String(a.text_or_title || ''), performance: String(a.performance || '').toUpperCase(), impressions: 0, conversions: 0, campaign: String(a.campaign), adGroup: String(a.ad_group) });
    x.impressions += n(a.impressions); x.conversions += n(a.conversions);
  });
  return Object.keys(byKey).map((k) => byKey[k]);
}

export function listGroups(tabs: Tabs): GroupSummary[] {
  const g: Record<string, GroupSummary> = {};
  liveTextAssets(tabs).forEach((a) => {
    const k = a.campaign + '|' + a.adGroup;
    const x = g[k] || (g[k] = { campaign: a.campaign, adGroup: a.adGroup, lowText: 0, strongText: 0, lowImpressions: 0 });
    if (a.performance === 'LOW') { x.lowText++; x.lowImpressions += a.impressions; }
    if (a.performance === 'BEST' || a.performance === 'GOOD') x.strongText++;
  });
  return Object.keys(g).map((k) => g[k]).filter((x) => x.lowText > 0).sort((a, b) => b.lowImpressions - a.lowImpressions);
}

// Numbers a suggestion may contain: those in approved offers. "2W", "3W" and "4W" are vehicle names, not claims.
function allowedNumbers(offers: Offer[]): Record<string, boolean> {
  const ok: Record<string, boolean> = {};
  offers.forEach((o) => {
    ([o.claim, o.value, o.conditions].join(' ').match(/\d[\d,]*(\.\d+)?/g) || []).forEach((m) => { ok[m.replace(/,/g, '')] = true; });
  });
  return ok;
}
export function unapprovedNumbers(text: string, ok: Record<string, boolean>): string[] {
  const stripped = text.replace(/\b[2-4]\s?w(heeler)?s?\b/gi, ' ').replace(/\b(two|three|four)[- ]?wheelers?\b/gi, ' ');
  return (stripped.match(/\d[\d,]*(\.\d+)?/g) || []).map((m) => m.replace(/,/g, '')).filter((m) => !ok[m]);
}

const SYSTEM = `You are a performance copywriter for Shiprocket Quick's Google App campaigns (on-demand local delivery in Delhi NCR).
Rewrite each LOW-rated text asset so Google is more likely to serve it.

Rules:
- Give 2 or 3 options for every LOW asset. Each option takes a different angle (price, speed, use case, proof, offer).
- Headlines: at most 30 characters. Descriptions: at most 90 characters. Count carefully, including spaces and symbols.
- Prices, discounts, cashback, numbers and specific claims may ONLY come from APPROVED_OFFERS, using the same numbers. If an option uses an offer, list its id in offer_ids.
- Never invent numbers, guarantees or superlatives (lowest, cheapest, best, #1) unless an approved offer says so.
- Learn from the STRONG assets (Best and Good in the same ad group): what they lead with, their length and tone. Don't copy them word for word, and don't repeat a message the ad group already has many times.
- If several LOW assets say the same thing, give them clearly different angles.
- Keep brand and place names as written (Shiprocket Quick, Delhi NCR, 2W, 3W).
Reply with JSON only, no other text:
{"findings": "one or two plain sentences on why these assets are Low", "rewrites": [{"asset_id": "...", "options": [{"text": "...", "why": "short reason", "offer_ids": [1]}]}]}`;

export async function generateRewrites(tabs: Tabs, campaign: string, adGroup: string, offers: Offer[]): Promise<RewriteResult> {
  const assets = liveTextAssets(tabs).filter((a) => a.campaign === campaign && a.adGroup === adGroup);
  const low = assets.filter((a) => a.performance === 'LOW').sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  if (!low.length) throw new Error('This ad group has no Low-rated text assets');
  const strong = assets.filter((a) => a.performance === 'BEST' || a.performance === 'GOOD').sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  // If the ad group has few strong lines, add the account's most-shown Best lines as extra examples.
  const extra = strong.length >= 5 ? [] : liveTextAssets(tabs).filter((a) => a.performance === 'BEST' && a.adGroup !== adGroup).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
  const input = {
    campaign, ad_group: adGroup,
    approved_offers: offers.map((o) => ({ id: o.id, claim: o.claim, conditions: o.conditions })),
    strong_in_this_ad_group: strong.map((a) => ({ field: a.field, text: a.text, rating: a.performance, impressions: a.impressions, conversions: Math.round(a.conversions) })),
    best_elsewhere_in_account: extra.map((a) => ({ field: a.field, text: a.text, impressions: a.impressions })),
    low_to_rewrite: low.map((a) => ({ asset_id: a.id, field: a.field, text: a.text, impressions: a.impressions, conversions: Math.round(a.conversions) })),
  };
  const raw = await askClaude(SYSTEM, `APPROVED_OFFERS and assets:\n${JSON.stringify(input, null, 1)}`, 4000);
  const parsed = parseJson<{ findings?: string; rewrites?: { asset_id: string; options: { text: string; why: string; offer_ids?: number[] }[] }[] }>(raw);

  const ok = allowedNumbers(offers);
  const existing: Record<string, boolean> = {};
  assets.forEach((a) => { existing[a.text.trim().toLowerCase()] = true; });
  const usedAcross: Record<string, boolean> = {}; // the same new line is offered for one Low asset only
  const items: RewriteItem[] = low.map((a) => {
    const r = (parsed.rewrites || []).filter((x) => String(x.asset_id) === a.id)[0];
    let removed = 0;
    const options: RewriteOption[] = [];
    ((r && r.options) || []).forEach((o) => {
      const text = String(o.text || '').trim();
      if (!text || text.length > LIMIT[a.field] || existing[text.toLowerCase()] || usedAcross[text.toLowerCase()] || unapprovedNumbers(text, ok).length) { removed++; return; }
      if (options.length < 3) usedAcross[text.toLowerCase()] = true;
      options.push({ text, why: String(o.why || '').slice(0, 140), offerIds: (o.offer_ids || []).filter((id) => offers.some((x) => x.id === id)) });
    });
    return { assetId: a.id, field: a.field, current: a.text, impressions: a.impressions, conversions: Math.round(a.conversions), options: options.slice(0, 3), removed };
  });
  return { campaign, adGroup, findings: String(parsed.findings || '').slice(0, 400), items, createdAt: new Date().toISOString() };
}

// ---------- Saving suggestions so a reload doesn't call Claude again ----------

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel');
  return neon(process.env.DATABASE_URL);
}
let ready = false;
async function ensure(sql: any) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS stark_rewrites (
    business text NOT NULL, campaign text NOT NULL, ad_group text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    result jsonb NOT NULL, PRIMARY KEY (business, campaign, ad_group))`;
  ready = true;
}
export async function saveRewrite(business: BusinessKey, r: RewriteResult): Promise<void> {
  const sql = db();
  await ensure(sql);
  await sql`INSERT INTO stark_rewrites (business, campaign, ad_group, result) VALUES (${business}, ${r.campaign}, ${r.adGroup}, ${JSON.stringify(r)}::jsonb)
    ON CONFLICT (business, campaign, ad_group) DO UPDATE SET result = EXCLUDED.result, created_at = now()`;
}
export async function savedRewrites(business: BusinessKey): Promise<Record<string, RewriteResult>> {
  const sql = db();
  await ensure(sql);
  const rows = (await sql`SELECT campaign, ad_group, result FROM stark_rewrites WHERE business = ${business}`) as any[];
  const out: Record<string, RewriteResult> = {};
  rows.forEach((r) => { out[r.campaign + '|' + r.ad_group] = r.result; });
  return out;
}
