// STARK approved offers: the only prices, discounts and claims Claude may write into ads.
// Upload as CSV or Excel (the STARK template), or as an image that Claude reads and a person confirms.
import { neon } from '@neondatabase/serverless';
import { inflateRawSync } from 'zlib';
import type { BusinessKey } from './businesses';

export type Offer = {
  id?: number;
  business: BusinessKey;
  claim: string;
  type: string;
  value: string;
  conditions: string;
  validFrom: string | null;
  validUntil: string | null;
  channels: string;
  active: boolean;
  notes: string;
  source: string;
  updatedBy?: string;
  updatedAt?: string;
};

const TYPES = ['Price', 'Discount', 'Cashback', 'Speed', 'Coverage', 'Proof', 'Other'];
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel');
  return neon(process.env.DATABASE_URL);
}
let ready = false;
async function ensure(sql: any) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS stark_offers (
    id bigserial PRIMARY KEY, business text NOT NULL, claim text NOT NULL, type text, value text, conditions text,
    valid_from text, valid_until text, channels text, active boolean NOT NULL DEFAULT true, notes text, source text,
    updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
  ready = true;
}

const toOffer = (r: any): Offer => ({
  id: Number(r.id), business: r.business, claim: r.claim, type: r.type || 'Other', value: r.value || '', conditions: r.conditions || '',
  validFrom: r.valid_from || null, validUntil: r.valid_until || null, channels: r.channels || 'All', active: !!r.active,
  notes: r.notes || '', source: r.source || '', updatedBy: r.updated_by || '', updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listOffers(business: BusinessKey): Promise<Offer[]> {
  const sql = db();
  await ensure(sql);
  const rows = (await sql`SELECT * FROM stark_offers WHERE business = ${business} ORDER BY active DESC, id`) as any[];
  return rows.map(toOffer);
}

// Offers Claude may use right now: switched on, within their dates, and meant for Google.
export function usableOffers(all: Offer[], channel: 'Google' | 'Meta' = 'Google'): Offer[] {
  const today = istToday();
  return all.filter((o) => o.active && (!o.validFrom || o.validFrom <= today) && (!o.validUntil || o.validUntil >= today)
    && (!o.channels || /all/i.test(o.channels) || new RegExp(channel, 'i').test(o.channels)));
}

// Replaces the business's list with the uploaded or confirmed one.
export async function replaceOffers(business: BusinessKey, offers: Offer[], by: string): Promise<Offer[]> {
  const sql = db();
  await ensure(sql);
  await sql`DELETE FROM stark_offers WHERE business = ${business}`;
  for (const o of offers) {
    await sql`INSERT INTO stark_offers (business, claim, type, value, conditions, valid_from, valid_until, channels, active, notes, source, updated_by)
      VALUES (${business}, ${o.claim}, ${o.type}, ${o.value}, ${o.conditions}, ${o.validFrom}, ${o.validUntil}, ${o.channels}, ${o.active}, ${o.notes}, ${o.source}, ${by})`;
  }
  return listOffers(business);
}

export async function setOfferActive(id: number, active: boolean, by: string): Promise<void> {
  const sql = db();
  await ensure(sql);
  await sql`UPDATE stark_offers SET active = ${active}, updated_by = ${by}, updated_at = now() WHERE id = ${id}`;
}

// ---------- Cleaning rows from any source ----------

function excelDate(v: string): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d\d-\d\d/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000).toISOString().slice(0, 10); // Excel serial
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function cleanRows(rows: Record<string, string>[], source: string, fallback: BusinessKey): { offers: Offer[]; skipped: number } {
  const offers: Offer[] = [];
  let skipped = 0;
  rows.forEach((r) => {
    const get = (k: string) => String(r[k] ?? r[k.replace('_', ' ')] ?? '').trim();
    const claim = get('claim');
    const biz = get('business').toLowerCase();
    if (!claim || /^exact wording/i.test(claim)) { skipped++; return; } // empty or the template's help row
    const business: BusinessKey = biz === 'lm' || /last/i.test(biz) ? 'lm' : biz === 'quick' || /quick/i.test(biz) ? 'quick' : fallback;
    const type = TYPES.filter((t) => t.toLowerCase() === get('type').toLowerCase())[0] || 'Other';
    const active = !/^(no|n|false|0|off)$/i.test(get('active'));
    offers.push({
      business, claim: claim.slice(0, 120), type, value: get('value').slice(0, 30), conditions: get('conditions').slice(0, 160),
      validFrom: excelDate(get('valid_from')), validUntil: excelDate(get('valid_until')),
      channels: get('channels') || 'All', active, notes: get('notes').slice(0, 300), source,
    });
  });
  return { offers, skipped };
}

// ---------- CSV ----------

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return toObjects(rows);
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim()));
  if (nonEmpty.length < 2) return [];
  const head = nonEmpty[0].map((h) => String(h).trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = String(r[i] ?? ''); });
    return o;
  });
}

// ---------- Excel (.xlsx), read with Node's built-in zlib: first sheet only ----------

function unzip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a valid Excel file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lName = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lName + lExtra, local + 30 + lName + lExtra + size);
    if (/^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/.test(name)) out[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unxml = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref: string) => { const l = (ref.match(/^[A-Z]+/) || ['A'])[0]; let n = 0; for (let i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64); return n - 1; };

export function parseXlsx(buf: Buffer): Record<string, string>[] {
  const files = unzip(buf);
  const sheet = files['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new Error('Couldn’t find the first sheet in this Excel file');
  const shared: string[] = [];
  const ss = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : '';
  (ss.match(/<si>[\s\S]*?<\/si>/g) || []).forEach((si) => {
    shared.push(unxml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<t[^>]*>|<\/t>/g, '')).join('')));
  });
  const rows: string[][] = [];
  (sheet.toString('utf8').match(/<row[^>]*>[\s\S]*?<\/row>/g) || []).forEach((rowXml) => {
    const row: string[] = [];
    (rowXml.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []).forEach((c) => {
      const ref = (c.match(/r="([A-Z]+\d+)"/) || [])[1] || 'A1';
      const type = (c.match(/t="([^"]+)"/) || [])[1] || '';
      let v = '';
      if (type === 'inlineStr') v = unxml(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '');
      else {
        const raw = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
        v = type === 's' ? shared[Number(raw)] || '' : unxml(raw);
      }
      row[colIndex(ref)] = v;
    });
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    rows.push(row);
  });
  return toObjects(rows);
}
