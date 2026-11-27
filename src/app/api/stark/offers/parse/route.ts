import { NextResponse } from 'next/server';
import { businessByKey } from '../../../../../lib/stark/businesses';
import { cleanRows, parseCsv, parseXlsx } from '../../../../../lib/stark/offers';
import { askClaude, parseJson } from '../../../../../lib/stark/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMAGE_PROMPT = `Read every offer, price, discount or cashback shown in this image (a Shiprocket marketing banner or offer sheet).
Return JSON only: {"offers": [{"claim": "short ad-ready wording, using the exact numbers shown", "type": "Price|Discount|Cashback|Speed|Coverage|Proof|Other", "value": "the number, e.g. 45 or 20%", "conditions": "who or where it applies, if shown", "valid_until": "YYYY-MM-DD if a date is shown, else empty"}]}
Only include what is actually written in the image. Don't guess numbers that aren't clearly visible.`;

// POST /api/stark/offers/parse  (form data: b, file)  -> offers read from a CSV, Excel file or image, for review. Nothing is saved here.
export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Upload a file' }, { status: 400 }); }
  const b = businessByKey(String(form.get('b') || '')).key;
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Upload a file' }, { status: 400 });
  const name = (file as File).name.toLowerCase();
  const type = (file as File).type;
  const buf = Buffer.from(await (file as File).arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) return NextResponse.json({ error: 'File is over 4 MB. Use a smaller image or a CSV.' }, { status: 400 });
  try {
    if (/\.csv$/.test(name) || type === 'text/csv') {
      return NextResponse.json(cleanRows(parseCsv(buf.toString('utf8')), 'CSV upload', b));
    }
    if (/\.xlsx$/.test(name)) {
      return NextResponse.json(cleanRows(parseXlsx(buf), 'Excel upload', b));
    }
    if (/^image\/(png|jpe?g|webp|gif)$/.test(type)) {
      const raw = await askClaude('You extract marketing offers from images accurately. You reply with JSON only.', [
        { type: 'image', source: { type: 'base64', media_type: type === 'image/jpg' ? 'image/jpeg' : type, data: buf.toString('base64') } },
        { type: 'text', text: IMAGE_PROMPT },
      ], 1500);
      const parsed = parseJson<{ offers?: Record<string, string>[] }>(raw);
      const rows = (parsed.offers || []).map((o) => ({ ...o, business: b, channels: 'All', active: 'yes' }));
      return NextResponse.json(cleanRows(rows, 'Image (read by Claude)', b));
    }
    return NextResponse.json({ error: 'Use a CSV, an Excel (.xlsx) file, or a PNG/JPG image. For .xls files, save as .xlsx first.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
