import { unstable_cache } from 'next/cache';
import { normName, type BranchCounts } from './insights';

// Branch installs and first orders (first_order_created_fe) for Google campaigns, read through the
// dashboard's existing /api/branch-metrics route (left unchanged). Keyed by normalised campaign name.
async function fetchBranch(base: string, start: string, end: string): Promise<BranchCounts> {
  const res = await fetch(`${base}/api/branch-metrics?start_date=${start}&end_date=${end}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Branch returned ${res.status}`);
  const json: any = await res.json();
  if (json.error) throw new Error(`Branch: ${json.error}`);
  const out: BranchCounts = {};
  (json.by_campaign || []).forEach((c: any) => {
    if (!/google/i.test(String(c.ad_partner || ''))) return;
    const k = normName(c.campaign);
    const x = out[k] || (out[k] = { installs: 0, orders: 0 });
    x.installs += Number(c.installs) || 0;
    x.orders += Number(c.orders) || 0;
  });
  return out;
}

export const getBranchGoogle = unstable_cache(fetchBranch, ['branch-google-v1'], { revalidate: 3 * 60 * 60, tags: ['google-gap'] });
