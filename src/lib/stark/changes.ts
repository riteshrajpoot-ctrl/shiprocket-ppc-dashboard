// Ad-copy changes proposed from STARK and applied by the "STARK apply" Google Ads script.
// STARK can only propose. The script copies proposals into the sheet tab "Approvals"; a change is applied
// only after someone types Yes in the sheet (limited to Shiprocket accounts). Results are reported back here.
import { neon } from '@neondatabase/serverless';
import type { BusinessKey } from './businesses';

// queued = proposed in STARK · awaiting = in the sheet, waiting for Yes/No · then applied / rejected / skipped / error
export type ChangeStatus = 'queued' | 'awaiting' | 'preview' | 'applied' | 'rejected' | 'skipped' | 'error';
export type AdChange = {
  id: number; business: BusinessKey; campaign: string; adGroup: string; field: 'Headline' | 'Description';
  oldText: string; newText: string; pickedBy: string; createdAt: string; status: ChangeStatus;
  message: string; appliedAt: string | null; undoOf: number | null;
};
export type ChangeInput = { campaign: string; adGroup: string; field: 'Headline' | 'Description'; oldText: string; newText: string };

const LIMIT = { Headline: 30, Description: 90 };

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel');
  return neon(process.env.DATABASE_URL);
}
let ready = false;
async function ensure(sql: any) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS stark_ad_changes (
    id bigserial PRIMARY KEY, business text NOT NULL, campaign text NOT NULL, ad_group text NOT NULL, field text NOT NULL,
    old_text text NOT NULL, new_text text NOT NULL, picked_by text, created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'queued', message text, applied_at timestamptz, undo_of bigint)`;
  ready = true;
}
const toChange = (r: any): AdChange => ({
  id: Number(r.id), business: r.business, campaign: r.campaign, adGroup: r.ad_group, field: r.field, oldText: r.old_text, newText: r.new_text,
  pickedBy: r.picked_by || '', createdAt: new Date(r.created_at).toISOString(), status: r.status, message: r.message || '',
  appliedAt: r.applied_at ? new Date(r.applied_at).toISOString() : null, undoOf: r.undo_of ? Number(r.undo_of) : null,
});

export async function queueChanges(business: BusinessKey, changes: ChangeInput[], by: string): Promise<AdChange[]> {
  const sql = db();
  await ensure(sql);
  const out: AdChange[] = [];
  for (const c of changes) {
    const field = c.field === 'Description' ? 'Description' : 'Headline';
    const newText = String(c.newText || '').trim();
    const oldText = String(c.oldText || '').trim();
    if (!c.campaign || !c.adGroup || !oldText || !newText) continue;
    if (newText.length > LIMIT[field]) throw new Error(`“${newText}” is over the ${LIMIT[field]}-character limit`);
    // A change already waiting for the same text isn't queued twice.
    const dup = (await sql`SELECT id FROM stark_ad_changes WHERE business = ${business} AND campaign = ${c.campaign} AND ad_group = ${c.adGroup}
      AND old_text = ${oldText} AND status IN ('queued', 'awaiting', 'preview')`) as any[];
    if (dup.length) continue;
    const rows = (await sql`INSERT INTO stark_ad_changes (business, campaign, ad_group, field, old_text, new_text, picked_by)
      VALUES (${business}, ${c.campaign}, ${c.adGroup}, ${field}, ${oldText}, ${newText}, ${by}) RETURNING *`) as any[];
    out.push(toChange(rows[0]));
  }
  return out;
}

export async function listChanges(business: BusinessKey, limit = 100): Promise<AdChange[]> {
  const sql = db();
  await ensure(sql);
  return ((await sql`SELECT * FROM stark_ad_changes WHERE business = ${business} ORDER BY id DESC LIMIT ${limit}`) as any[]).map(toChange);
}

// For the script: new proposals to copy into the sheet for approval.
export async function pendingChanges(business: BusinessKey, max = 50): Promise<AdChange[]> {
  const sql = db();
  await ensure(sql);
  return ((await sql`SELECT * FROM stark_ad_changes WHERE business = ${business} AND status IN ('queued', 'preview') ORDER BY id LIMIT ${max}`) as any[]).map(toChange);
}

export async function recordResults(business: BusinessKey, results: { id: number; status: ChangeStatus; message?: string }[]): Promise<number> {
  const sql = db();
  await ensure(sql);
  let n = 0;
  for (const r of results) {
    const status = ['awaiting', 'preview', 'applied', 'rejected', 'skipped', 'error'].indexOf(r.status) >= 0 ? r.status : 'error';
    const msg = String(r.message || '').slice(0, 500);
    await sql`UPDATE stark_ad_changes SET status = ${status}, message = ${msg}, applied_at = ${status === 'applied' ? new Date().toISOString() : null}
      WHERE id = ${Number(r.id)} AND business = ${business}`;
    n++;
  }
  return n;
}

// Undo = a new change that swaps the text back.
export async function undoChange(id: number, by: string): Promise<AdChange> {
  const sql = db();
  await ensure(sql);
  const rows = (await sql`SELECT * FROM stark_ad_changes WHERE id = ${id}`) as any[];
  if (!rows.length) throw new Error('Change not found');
  const c = toChange(rows[0]);
  if (c.status !== 'applied') throw new Error('Only applied changes can be undone');
  const ins = (await sql`INSERT INTO stark_ad_changes (business, campaign, ad_group, field, old_text, new_text, picked_by, undo_of)
    VALUES (${c.business}, ${c.campaign}, ${c.adGroup}, ${c.field}, ${c.newText}, ${c.oldText}, ${by}, ${c.id}) RETURNING *`) as any[];
  return toChange(ins[0]);
}

// Withdraw a proposal that hasn't reached the sheet yet, or clear a finished-but-unapplied one.
// Once a change is in the sheet, it's decided there (type No to reject it).
export async function cancelChange(id: number): Promise<void> {
  const sql = db();
  await ensure(sql);
  await sql`DELETE FROM stark_ad_changes WHERE id = ${id} AND status IN ('queued', 'preview', 'error', 'skipped', 'rejected')`;
}
