// Spots Google Ads changes (from the daily script's change history) that match an open recommendation,
// so the team can confirm them with one click. Nothing is marked Done without a person confirming.
import type { Tabs } from '../google/insights';
import type { StatusRow, StoredRec } from './actions';

export type DetectedChange = { key: string; date: string; when: string; by: string; summary: string };

// Which kinds of Google change count as acting on each kind of recommendation.
const RELEVANT: Record<string, string[]> = {
  google_fo: ['CAMPAIGN_BUDGET', 'CAMPAIGN', 'AD_GROUP', 'AD_GROUP_BID_MODIFIER'],
  google_orders: ['CAMPAIGN', 'CAMPAIGN_CONVERSION_GOAL', 'CONVERSION_ACTION', 'CUSTOMER_CONVERSION_GOAL'],
  google_invalid: ['CAMPAIGN_CRITERION', 'AD_GROUP_CRITERION', 'CAMPAIGN', 'AD_GROUP'],
  google_low_assets: ['AD_GROUP_AD', 'AD_GROUP_ASSET', 'ASSET', 'CAMPAIGN_ASSET'],
};
const WHAT: Record<string, string> = {
  CAMPAIGN_BUDGET: 'Budget changed', CAMPAIGN: 'Campaign settings changed', AD_GROUP: 'Ad group changed', AD_GROUP_BID_MODIFIER: 'Bid adjustment changed',
  CAMPAIGN_CONVERSION_GOAL: 'Conversion goal changed', CONVERSION_ACTION: 'Conversion action changed', CUSTOMER_CONVERSION_GOAL: 'Account goal changed',
  CAMPAIGN_CRITERION: 'Targeting changed', AD_GROUP_CRITERION: 'Targeting changed', AD_GROUP_AD: 'Ads changed', AD_GROUP_ASSET: 'Assets changed',
  ASSET: 'Assets changed', CAMPAIGN_ASSET: 'Assets changed',
};
const short = (c: string) => c.replace(/^sr_quick_/i, '');
const fmt = (w: string) => {
  const d = new Date(w.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${d}${w.length >= 16 ? ', ' + w.slice(11, 16) : ''}`;
};

export function detectChanges(
  recs: StoredRec[], statuses: Record<string, StatusRow>, tabs: Tabs | undefined, dismissed: Record<string, string[]>,
): Record<string, DetectedChange> {
  const out: Record<string, DetectedChange> = {};
  if (!tabs) return out;
  const changes = tabs.changes_14d || [];
  recs.forEach((r) => {
    if (r.page !== 'google') return;
    const s = statuses[r.id];
    if (s && s.status !== 'not') return; // already answered
    const kinds = RELEVANT[r.metric] || [];
    const targets: Record<string, boolean> = {};
    r.targets.forEach((t) => { targets[t] = true; });
    // Changes made on or after the recommendation's week began, newest first, grouped by person and day.
    const hits = changes.filter((c) => {
      const when = String(c.when || '');
      if (when.slice(0, 10) < r.weekStart) return false;
      if (kinds.indexOf(String(c.what)) < 0) return false;
      if (r.targets.length && !targets[String(c.campaign)]) return false;
      return true;
    }).sort((a, b) => (String(b.when) > String(a.when) ? 1 : -1));
    if (!hits.length) return;
    const first = hits[0];
    const date = String(first.when).slice(0, 10);
    const by = String(first.by || 'someone');
    const group = hits.filter((c) => String(c.when).slice(0, 10) === date && String(c.by || 'someone') === by);
    const key = `${date}|${by}|${group.map((c) => `${c.what}:${c.campaign}`).sort().join(',')}`;
    if ((dismissed[r.id] || []).indexOf(key) >= 0) return;
    const whats: string[] = [];
    group.forEach((c) => { const w = WHAT[String(c.what)] || String(c.what); if (whats.indexOf(w) < 0) whats.push(w); });
    const camps: string[] = [];
    group.forEach((c) => { const n = short(String(c.campaign || '')); if (n && camps.indexOf(n) < 0) camps.push(n); });
    out[r.id] = {
      key, date, when: fmt(String(first.when)), by,
      summary: `${whats.join(', ')}${camps.length ? ` on ${camps.slice(0, 3).join(', ')}${camps.length > 3 ? ` and ${camps.length - 3} more` : ''}` : ''}`,
    };
  });
  return out;
}
