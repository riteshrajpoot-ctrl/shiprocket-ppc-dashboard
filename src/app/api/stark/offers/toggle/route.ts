import { NextResponse } from 'next/server';
import { setOfferActive } from '../../../../../lib/stark/offers';

export const dynamic = 'force-dynamic';

// POST /api/stark/offers/toggle { id, active, by } -> switch one offer on or off
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const id = Number(body?.id), by = String(body?.by || '').trim().slice(0, 60);
  if (!id || !by) return NextResponse.json({ error: 'Missing offer or name' }, { status: 400 });
  try { await setOfferActive(id, !!body.active, by); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
