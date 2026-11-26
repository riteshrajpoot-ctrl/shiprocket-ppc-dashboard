import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { BUSINESS_ORDER } from '../../../../lib/stark/businesses';
import { getStatuses, impactsFor, listRecs, previousWeek, syncRecs, weekStartOf, type MeasureCtx } from '../../../../lib/stark/actions';
import { loadFatigue, loadGoogle } from '../../../../lib/stark/context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Runs every Monday 6:00 AM IST (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// 1) refreshes the data, 2) freezes this week's recommendations with their "before" numbers,
// 3) measures the last 5 weeks' recommendations whose 7 days after the action have settled.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  revalidateTag('creative-fatigue');
  revalidateTag('google-gap');
  const base = new URL(req.url).origin;
  const report: Record<string, unknown> = { week: weekStartOf() };
  for (const b of BUSINESS_ORDER) {
    const ctx: MeasureCtx = {};
    try {
      const f = await loadFatigue(b);
      ctx.meta = f.ctx;
      await syncRecs(b, f.recs, ctx);
    } catch (e) { report[`${b}_fatigue`] = (e as Error).message; }
    try {
      const g = await loadGoogle(b, base);
      if (g) { ctx.google = g.ctx; await syncRecs(b, g.recs, ctx); }
    } catch (e) { report[`${b}_google`] = (e as Error).message; }
    try {
      let from = weekStartOf();
      for (let i = 0; i < 5; i++) from = previousWeek(from);
      const recs = await listRecs(b, from);
      const statuses = await getStatuses(recs.map((r) => r.id));
      const impacts = await impactsFor(recs, statuses, ctx);
      report[`${b}_measured`] = Object.keys(impacts).filter((k) => impacts[k] && impacts[k]!.due).length;
    } catch (e) { report[`${b}_measure`] = (e as Error).message; }
  }
  return NextResponse.json({ ok: true, ...report });
}
