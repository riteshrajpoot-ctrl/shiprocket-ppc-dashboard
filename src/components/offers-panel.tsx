'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Offer = {
  id?: number; business: string; claim: string; type: string; value: string; conditions: string;
  validFrom: string | null; validUntil: string | null; channels: string; active: boolean; notes: string; source: string;
  updatedBy?: string; updatedAt?: string;
};
const TYPES = ['Price', 'Discount', 'Cashback', 'Speed', 'Coverage', 'Proof', 'Other'];
const NAME_KEY = 'stark_name';
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const expired = (o: Offer) => !!o.validUntil && o.validUntil < istToday();

// Approved offers: upload a CSV/Excel list or an image (Claude reads it), review, then save. Switch offers on or off.
export default function OffersPanel({ business, initial }: { business: string; initial: Offer[] }) {
  const [offers, setOffers] = useState<Offer[]>(initial);
  const [review, setReview] = useState<Offer[] | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const router = useRouter(); // refreshes the rest of the page (e.g. the Suggest buttons) after the list changes
  const sheetRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setName(window.localStorage.getItem(NAME_KEY) || ''); } catch {} }, []);

  function needName(): string | null {
    const n = name.trim();
    if (!n) { setError('Add your name first (box on the right), so STARK knows who changed the list.'); return null; }
    try { window.localStorage.setItem(NAME_KEY, n); } catch {}
    return n;
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(''); setBusy(/^image\//.test(file.type) ? 'Claude is reading the image…' : 'Reading the file…');
    try {
      const form = new FormData();
      form.append('b', business);
      form.append('file', file);
      const res = await fetch('/api/stark/offers/parse', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the file');
      const list: Offer[] = (json.offers || []).filter((o: Offer) => o.business === business);
      if (!list.length) throw new Error('No offers found for this business in that file.');
      setReview(list);
      setReviewNote(/^image\//.test(file.type)
        ? `Claude read ${list.length} offer${list.length > 1 ? 's' : ''} from ${file.name}. Check each one; fix anything it misread.`
        : `${list.length} offer${list.length > 1 ? 's' : ''} found in ${file.name}${json.skipped ? ` (${json.skipped} empty or help rows skipped)` : ''}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      if (sheetRef.current) sheetRef.current.value = '';
      if (imageRef.current) imageRef.current.value = '';
    }
  }

  async function saveReview() {
    const by = needName();
    if (!by || !review) return;
    setBusy('Saving…'); setError('');
    try {
      const res = await fetch('/api/stark/offers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b: business, offers: review, by }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setOffers(json); setReview(null);
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function toggle(o: Offer) {
    const by = needName();
    if (!by || !o.id) return;
    const next = offers.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x));
    setOffers(next);
    const res = await fetch('/api/stark/offers/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, active: !o.active, by }) });
    if (!res.ok) { setOffers(offers); setError('Could not change that offer'); return; }
    router.refresh();
  }

  const edit = (i: number, k: keyof Offer, v: string | boolean) => setReview((r) => (r ? r.map((o, j) => (j === i ? { ...o, [k]: v } : o)) : r));
  const last = offers.reduce((m, o) => (o.updatedAt && o.updatedAt > m.at ? { at: o.updatedAt, by: o.updatedBy || '' } : m), { at: '', by: '' });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Approved offers and prices</h2>
          <p className="text-sm text-slate-600">The only prices and claims Claude may write. {last.at ? `Updated ${when(last.at)}${last.by ? ` by ${last.by}` : ''}.` : 'No list yet.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name" aria-label="Your name"
            className="min-h-[36px] w-32 rounded-md border border-slate-300 px-2 text-sm" />
          <input ref={sheetRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" disabled={!!busy} onClick={() => sheetRef.current?.click()} className="min-h-[36px] rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-60">Upload list (Excel or CSV)</button>
          <button type="button" disabled={!!busy} onClick={() => imageRef.current?.click()} className="min-h-[36px] rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-60">Upload image of offers</button>
          <a href="/stark-offers-template.xlsx" download className="text-sm font-semibold text-indigo-700 underline underline-offset-2">Template</a>
        </div>
      </div>
      {busy && <p className="text-sm text-slate-600">{busy}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {review && (
        <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">{reviewNote} Saving replaces the current list.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-amber-900"><tr><th className="p-1.5 font-medium">Claim</th><th className="p-1.5 font-medium">Type</th><th className="p-1.5 font-medium">Value</th><th className="p-1.5 font-medium">Conditions</th><th className="p-1.5 font-medium">Valid until</th><th className="p-1.5 font-medium">Use</th><th /></tr></thead>
              <tbody>
                {review.map((o, i) => (
                  <tr key={i}>
                    <td className="p-1"><input value={o.claim} onChange={(e) => edit(i, 'claim', e.target.value)} className="w-full rounded border border-amber-200 px-2 py-1" /></td>
                    <td className="p-1"><select value={o.type} onChange={(e) => edit(i, 'type', e.target.value)} className="rounded border border-amber-200 px-1 py-1">{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                    <td className="p-1"><input value={o.value} onChange={(e) => edit(i, 'value', e.target.value)} className="w-20 rounded border border-amber-200 px-2 py-1" /></td>
                    <td className="p-1"><input value={o.conditions} onChange={(e) => edit(i, 'conditions', e.target.value)} className="w-full rounded border border-amber-200 px-2 py-1" /></td>
                    <td className="p-1"><input type="date" value={o.validUntil || ''} onChange={(e) => edit(i, 'validUntil', e.target.value)} className="rounded border border-amber-200 px-1 py-1" /></td>
                    <td className="p-1"><input type="checkbox" checked={o.active} onChange={(e) => edit(i, 'active', e.target.checked)} aria-label="Use this offer" /></td>
                    <td className="p-1"><button type="button" onClick={() => setReview((r) => (r ? r.filter((_, j) => j !== i) : r))} className="text-xs text-red-700 underline">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={saveReview} className="min-h-[36px] rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">Save {review.length} offers</button>
            <button type="button" onClick={() => setReview(null)} className="min-h-[36px] rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-slate-200"><th className="px-2 py-2 font-medium">Claim Claude may use</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 font-medium">Conditions</th><th className="px-2 py-2 font-medium">Valid until</th><th className="px-2 py-2 font-medium">Source</th><th className="px-2 py-2 font-medium">Use</th></tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-slate-500">No approved offers yet. Upload the template or an image of your latest offers.</td></tr>
            ) : offers.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 font-medium">{o.claim}</td>
                <td className="px-2 py-2 text-slate-600">{o.type}</td>
                <td className="px-2 py-2 text-slate-600">{o.conditions}</td>
                <td className={`px-2 py-2 ${expired(o) ? 'text-red-700' : 'text-slate-600'}`}>{o.validUntil || 'Ongoing'}{expired(o) ? ' (expired)' : ''}</td>
                <td className="px-2 py-2 text-slate-600">{o.source}</td>
                <td className="px-2 py-2">
                  <button type="button" aria-pressed={o.active} onClick={() => toggle(o)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${o.active && !expired(o) ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                    {o.active ? (expired(o) ? 'On (expired)' : 'On') : 'Off'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
