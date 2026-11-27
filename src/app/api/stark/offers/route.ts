import { NextResponse } from 'next/server';
import { businessByKey } from '../../../../lib/stark/businesses';
import { listOffers, replaceOffers, cleanRows, type Offer } from '../../../../lib/stark/offers';

export const dynamic = 'force-dynamic';

// GET /api/stark/offers?b=quick            -> the approved offers list
// POST /api/stark/offers { b, offers, by }  -> replace the list with the reviewed one
export async function GET(req: Request) {
  const b = businessByKey(new URL(req.url).searchParams.get('b')).key;
  try { return NextResponse.json(await listOffers(b)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const b = businessByKey(body?.b).key;
  const by = String(body?.by || '').trim().slice(0, 60);
  if (!by) return NextResponse.json({ error: 'Please add your name' }, { status: 400 });
  const rows = Array.isArray(body?.offers) ? body.offers : [];
  // Re-clean whatever the browser sends, so the saved list always has the same shape.
  const { offers } = cleanRows(rows.map((o: Offer) => ({
    business: b, claim: o.claim, type: o.type, value: o.value, conditions: o.conditions, valid_from: o.validFrom || '', valid_until: o.validUntil || '',
    channels: o.channels, active: o.active ? 'yes' : 'no', notes: o.notes,
  })), String(rows[0]?.source || 'Edited in STARK'), b);
  try {
    return NextResponse.json(await replaceOffers(b, offers, by));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
