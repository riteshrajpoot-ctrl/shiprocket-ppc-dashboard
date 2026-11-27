import { NextResponse } from 'next/server';
import { dismissChange } from '../../../../lib/stark/actions';

export const dynamic = 'force-dynamic';

// POST /api/stark/dismiss  { id, key, by }  -> "No, that detected change wasn't for this recommendation"
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const id = String(body?.id || ''), key = String(body?.key || '').slice(0, 2000), by = String(body?.by || '').trim().slice(0, 60);
  if (!id || !key) return NextResponse.json({ error: 'Missing id or key' }, { status: 400 });
  if (!by) return NextResponse.json({ error: 'Please add your name' }, { status: 400 });
  try {
    await dismissChange(id, key, by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
