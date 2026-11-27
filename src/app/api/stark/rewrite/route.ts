import { NextResponse } from 'next/server';
import { businessByKey } from '../../../../lib/stark/businesses';
import { getGoogleSnapshot } from '../../../../lib/google';
import { listOffers, usableOffers } from '../../../../lib/stark/offers';
import { generateRewrites, saveRewrite } from '../../../../lib/stark/rewrite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/stark/rewrite { b, campaign, adGroup } -> Claude's suggestions for that ad group's Low text assets
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const b = businessByKey(body?.b).key;
  const campaign = String(body?.campaign || ''), adGroup = String(body?.adGroup || '');
  if (!campaign || !adGroup) return NextResponse.json({ error: 'Missing campaign or ad group' }, { status: 400 });
  if (b !== 'quick') return NextResponse.json({ error: 'Google data is connected for Shiprocket Quick only so far' }, { status: 400 });
  try {
    const snap = await getGoogleSnapshot(b);
    if (!snap) return NextResponse.json({ error: 'No Google data yet' }, { status: 400 });
    const offers = usableOffers(await listOffers(b));
    if (!offers.length) return NextResponse.json({ error: 'Add your approved offers first, so Claude knows which prices and claims it may use.' }, { status: 400 });
    const result = await generateRewrites(snap.tabs, campaign, adGroup, offers);
    await saveRewrite(b, result);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
