import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { neon } from '@neondatabase/serverless';
import { businessByKey } from '../../../../lib/stark/businesses';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KEEP = 30; // snapshots kept per business (about a month of daily runs)

function authorised(req: Request, url: URL) {
  const expected = process.env.STARK_INGEST_KEY;
  const given = req.headers.get('x-stark-key') || url.searchParams.get('key');
  return !!expected && expected.length >= 16 && given === expected;
}

async function ensureTable(sql: any) {
  await sql`CREATE TABLE IF NOT EXISTS stark_google_snapshots (
    id bigserial PRIMARY KEY,
    business text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    generated_at text,
    payload jsonb NOT NULL
  )`;
}

// POST /api/google/ingest?b=quick   (from the Google Ads script, with header x-stark-key)
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!authorised(req, url)) return NextResponse.json({ error: 'Wrong or missing key' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'DATABASE_URL is missing in Vercel' }, { status: 500 });
  const b = businessByKey(url.searchParams.get('b')).key;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  if (!body || typeof body.tabs !== 'object') return NextResponse.json({ error: 'Missing tabs' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL);
  await ensureTable(sql);
  await sql`INSERT INTO stark_google_snapshots (business, generated_at, payload) VALUES (${b}, ${String(body.generated_at || '')}, ${JSON.stringify(body)}::jsonb)`;
  await sql`DELETE FROM stark_google_snapshots WHERE business = ${b} AND id NOT IN (
    SELECT id FROM stark_google_snapshots WHERE business = ${b} ORDER BY id DESC LIMIT ${KEEP})`;
  revalidateTag('google-gap');

  const rows: Record<string, number> = {};
  Object.keys(body.tabs).forEach((t) => { rows[t] = Array.isArray(body.tabs[t]) ? Math.max(0, body.tabs[t].length - 1) : 0; });
  return NextResponse.json({ ok: true, business: b, rows });
}

// GET /api/google/ingest?b=quick&key=YOUR_KEY  -> check what STARK last received (counts only, no data)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorised(req, url)) return NextResponse.json({ error: 'Wrong or missing key' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'DATABASE_URL is missing in Vercel' }, { status: 500 });
  const b = businessByKey(url.searchParams.get('b')).key;
  const sql = neon(process.env.DATABASE_URL);
  await ensureTable(sql);
  const last = (await sql`SELECT received_at, generated_at, payload FROM stark_google_snapshots WHERE business = ${b} ORDER BY id DESC LIMIT 1`) as any[];
  if (!last.length) return NextResponse.json({ business: b, received: false, note: 'Nothing received yet. Run the Google Ads script once.' });
  const p = last[0].payload || {};
  const rows: Record<string, number> = {};
  Object.keys(p.tabs || {}).forEach((t) => { rows[t] = Array.isArray(p.tabs[t]) ? Math.max(0, p.tabs[t].length - 1) : 0; });
  return NextResponse.json({ business: b, received: true, receivedAt: last[0].received_at, generatedAt: last[0].generated_at, account: p.account, rows, scriptLog: p.log });
}
