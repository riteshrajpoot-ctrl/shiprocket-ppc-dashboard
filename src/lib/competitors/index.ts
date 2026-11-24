import { unstable_cache } from 'next/cache';
import { analyze, type Intelligence, type RawReport } from './analyze';
import { scopeReport } from './scope';
import type { BusinessKey } from '../stark/businesses';

export * from './analyze';

export const ADS_URL = process.env.COMPETITOR_ADS_URL ?? 'https://sr-ad-intelligence.vercel.app/ads.json';

async function fetchReport(): Promise<RawReport> {
  // The raw file is several MB, larger than Next's 2 MB fetch cache, so skip that cache
  // and cache the small processed result below instead.
  const res = await fetch(ADS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Competitor report returned ${res.status}`);
  return (await res.json()) as RawReport;
}

export type CachedIntelligence = Intelligence & { fetchedAt: string; business: BusinessKey; tracked: string[]; notTracked: string[] };

async function build(key: BusinessKey): Promise<CachedIntelligence> {
  const scoped = scopeReport(await fetchReport(), key);
  return { ...analyze(scoped.report), fetchedAt: new Date().toISOString(), business: key, tracked: scoped.tracked, notTracked: scoped.notTracked };
}

// One cache per business: processed once, then reused for 6 hours (or until Refresh).
const cached: Record<BusinessKey, () => Promise<CachedIntelligence>> = {
  lm: unstable_cache(() => build('lm'), ['competitor-intelligence-v2-lm'], { revalidate: 6 * 60 * 60, tags: ['competitor-intelligence'] }),
  quick: unstable_cache(() => build('quick'), ['competitor-intelligence-v2-quick'], { revalidate: 6 * 60 * 60, tags: ['competitor-intelligence'] }),
};
export const getIntelligence = (key: BusinessKey) => cached[key]();
