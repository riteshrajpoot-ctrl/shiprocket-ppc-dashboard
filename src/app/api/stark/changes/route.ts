import { NextResponse } from 'next/server';
import { businessByKey } from '../../../../lib/stark/businesses';
import { cancelChange, listChanges, queueChanges, undoChange } from '../../../../lib/stark/changes';

export const dynamic = 'force-dynamic';

// GET  /api/stark/changes?b=quick                       -> recent ad-copy changes and their status
// POST /api/stark/changes { b, by, changes: [...] }     -> queue changes for the "STARK apply" script
// POST /api/stark/changes { action: 'undo'|'cancel', id, by }
export async function GET(req: Request) {
  const b = businessByKey(new URL(req.url).searchParams.get('b')).key;
  try { return NextResponse.json(await listChanges(b)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 }); }
  const by = String(body?.by || '').trim().slice(0, 60);
  if (!by) return NextResponse.json({ error: 'Please add your name' }, { status: 400 });
  try {
    if (body?.action === 'undo') return NextResponse.json(await undoChange(Number(body.id), by));
    if (body?.action === 'cancel') { await cancelChange(Number(body.id)); return NextResponse.json({ ok: true }); }
    const b = businessByKey(body?.b).key;
    const list = Array.isArray(body?.changes) ? body.changes.slice(0, 100) : [];
    if (!list.length) return NextResponse.json({ error: 'No changes to apply' }, { status: 400 });
    return NextResponse.json(await queueChanges(b, list, by));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
