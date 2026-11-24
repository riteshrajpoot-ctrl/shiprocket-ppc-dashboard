import { unstable_cache } from 'next/cache';
import { neon } from '@neondatabase/serverless';
import type { BusinessKey } from '../stark/businesses';

// Latest Google Ads snapshot sent by the daily script, as tabs of rows (first row = headers).
export type GoogleSnapshot = {
  business: BusinessKey;
  receivedAt: string;
  generatedAt: string;
  tabs: Record<string, Record<string, string | number>[]>;
};

function toObjects(rows: any[][]): Record<string, string | number>[] {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const head = rows[0].map(String);
  return rows.slice(1).map((r) => {
    const o: Record<string, string | number> = {};
    head.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

async function load(b: BusinessKey): Promise<GoogleSnapshot | null> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel');
  const sql = neon(process.env.DATABASE_URL);
  const rows = (await sql`SELECT received_at, generated_at, payload FROM stark_google_snapshots WHERE business = ${b} ORDER BY id DESC LIMIT 1`) as any[];
  if (!rows.length) return null;
  const p = rows[0].payload || {};
  const tabs: GoogleSnapshot['tabs'] = {};
  Object.keys(p.tabs || {}).forEach((t) => { tabs[t] = toObjects(p.tabs[t]); });
  return { business: b, receivedAt: new Date(rows[0].received_at).toISOString(), generatedAt: String(rows[0].generated_at || ''), tabs };
}

const cached: Record<BusinessKey, () => Promise<GoogleSnapshot | null>> = {
  lm: unstable_cache(() => load('lm'), ['google-gap-v1-lm'], { revalidate: 3600, tags: ['google-gap'] }),
  quick: unstable_cache(() => load('quick'), ['google-gap-v1-quick'], { revalidate: 3600, tags: ['google-gap'] }),
};
export const getGoogleSnapshot = (b: BusinessKey) => cached[b]();
