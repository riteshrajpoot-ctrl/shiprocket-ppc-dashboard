import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getIntelligence } from '@/lib/competitors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/competitors            -> processed intelligence as JSON (for Slack, alarms, etc.)
// GET /api/competitors?refresh=1&key=SECRET -> re-read ads.json now
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('refresh') === '1') {
    if (url.searchParams.get('key') !== process.env.COMPETITOR_REFRESH_KEY) {
      return NextResponse.json({ error: 'Wrong or missing key' }, { status: 401 });
    }
    revalidateTag('competitor-intelligence');
  }
  try {
    return NextResponse.json(await getIntelligence());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
