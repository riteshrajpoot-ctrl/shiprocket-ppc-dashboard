import { NextResponse } from 'next/server';
import { setStatus, type RecStatus } from '../../../../lib/stark/actions';

export const dynamic = 'force-dynamic';

const OK: RecStatus[] = ['done', 'partly', 'skip', 'not'];

// POST /api/stark/status  { id, status, note?, by }  -> saves a recommendation's status
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const id = String(body?.id || '');
  const status = String(body?.status || '') as RecStatus;
  const by = String(body?.by || '').trim().slice(0, 60);
  const note = String(body?.note || '').trim().slice(0, 280);
  if (!id || OK.indexOf(status) < 0) return NextResponse.json({ error: 'Missing id or invalid status' }, { status: 400 });
  if (!by) return NextResponse.json({ error: 'Please add your name' }, { status: 400 });
  try {
    return NextResponse.json(await setStatus(id, status, note, by));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
