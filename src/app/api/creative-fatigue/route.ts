import { NextResponse } from 'next/server';
import { getFatigueReport } from '../../../lib/fatigue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/creative-fatigue -> every live Meta ad with its fatigue stage, as JSON (for Slack alerts later)
export async function GET() {
  try {
    return NextResponse.json(await getFatigueReport());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
