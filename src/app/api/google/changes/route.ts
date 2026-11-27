import { NextResponse } from 'next/server';
import { businessByKey } from '../../../../lib/stark/businesses';
import { pendingChanges, recordResults } from '../../../../lib/stark/changes';

export const dynamic = 'force-dynamic';

function authorised(req: Request) {
  const expected = process.env.STARK_INGEST_KEY;
  return !!expected && expected.length >= 16 && req.headers.get('x-stark-key') === expected;
}

// For the "STARK apply" Google Ads script only (same secret key as the daily data script).
// GET  /api/google/changes?b=quick   -> changes to apply (max 20 per run)
// POST /api/google/changes?b=quick   { results: [{ id, status, message }] } -> what the script did
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'Wrong or missing key' }, { status: 401 });
  const b = businessByKey(new URL(req.url).searchParams.get('b')).key;
  try { return NextResponse.json({ changes: await pendingChanges(b) }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'Wrong or missing key' }, { status: 401 });
  const b = businessByKey(new URL(req.url).searchParams.get('b')).key;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  try { return NextResponse.json({ updated: await recordResults(b, Array.isArray(body?.results) ? body.results : []) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
