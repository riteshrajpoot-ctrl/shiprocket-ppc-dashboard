import { unstable_cache } from 'next/cache';
import { analyze, type Intelligence, type RawReport } from './analyze';

export * from './analyze';

export const ADS_URL = process.env.COMPETITOR_ADS_URL ?? 'https://sr-ad-intelligence.vercel.app/ads.json';

async function fetchReport(): Promise<RawReport> {
  // The raw file is several MB, larger than Next's 2 MB fetch cache, so skip that cache
  // and cache the small processed result below instead.
  const res = await fetch(ADS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Competitor report returned ${res.status}`);
  return (await res.json()) as RawReport;
}

// Processed once, then reused for 6 hours (or until /api/competitors?refresh=1).
export type CachedIntelligence = Intelligence & { fetchedAt: string };

export const getIntelligence = unstable_cache(
  async (): Promise<CachedIntelligence> => ({ ...analyze(await fetchReport()), fetchedAt: new Date().toISOString() }),
  ['competitor-intelligence-v1'],
  { revalidate: 6 * 60 * 60, tags: ['competitor-intelligence'] },
);
