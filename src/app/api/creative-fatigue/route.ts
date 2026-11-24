import { NextResponse } from 'next/server';
import { businessByKey } from '../../../lib/stark/businesses';
import { getFatigueReport, listActionTypes } from '../../../lib/fatigue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/creative-fatigue?b=lm|quick            -> every live Meta ad with its fatigue stage, as JSON
// GET /api/creative-fatigue?b=lm&debug=actions    -> the Meta action types the account reports (to check what "SignUp" is called)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const b = businessByKey(url.searchParams.get('b'));
  try {
    if (url.searchParams.get('debug') === 'actions') return NextResponse.json(await listActionTypes(b.key));
    return NextResponse.json(await getFatigueReport(b.key));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
