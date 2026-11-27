'use client';

import { useState } from 'react';

type Option = { text: string; why: string; offerIds: number[] };
type Item = { assetId: string; field: 'Headline' | 'Description'; current: string; impressions: number; conversions: number; options: Option[]; removed: number };
type Result = { campaign: string; adGroup: string; findings: string; items: Item[]; createdAt: string };
type Group = { campaign: string; adGroup: string; lowText: number; strongText: number; lowImpressions: number };

const LIMIT = { Headline: 30, Description: 90 };
const short = (c: string) => c.replace(/^sr_quick_/i, '');
const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

// Per ad group: ask Claude for replacements, pick one per Low asset, download the picks as a CSV.
export default function RewritePanel({ business, groups, saved, offerNames, hasOffers }: {
  business: string; groups: Group[]; saved: Record<string, Result>; offerNames: Record<number, string>; hasOffers: boolean;
}) {
  const [results, setResults] = useState<Record<string, Result>>(saved);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    groups.slice(0, 1).forEach((g) => { o[g.campaign + '|' + g.adGroup] = true; });
    return o;
  });
  const [loading, setLoading] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, number>>({});

  async function suggest(g: Group) {
    const key = g.campaign + '|' + g.adGroup;
    setLoading(key); setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const res = await fetch('/api/stark/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b: business, campaign: g.campaign, adGroup: g.adGroup }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Claude could not suggest replacements');
      setResults((r) => ({ ...r, [key]: json }));
      setOpen((o) => ({ ...o, [key]: true }));
      setPicks((p) => { const n = { ...p }; Object.keys(n).forEach((k) => { if (k.indexOf(key + '|') === 0) delete n[k]; }); return n; });
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message }));
    } finally {
      setLoading('');
    }
  }

  const picked = Object.keys(picks);

  function download() {
    const head = ['Campaign', 'Ad group', 'Asset type', 'Current text (rated Low)', 'New text', 'Characters', 'Limit', 'Why', 'Offer used'];
    const lines = [head.map(csvCell).join(',')];
    picked.forEach((k) => {
      const parts = k.split('|');
      const gk = parts[0] + '|' + parts[1];
      const r = results[gk];
      const item = r && r.items.filter((i) => i.assetId === parts[2])[0];
      const o = item && item.options[picks[k]];
      if (!r || !item || !o) return;
      lines.push([r.campaign, r.adGroup, item.field, item.current, o.text, o.text.length, LIMIT[item.field], o.why, o.offerIds.map((id) => offerNames[id] || '').join('; ')].map(csvCell).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stark_${business}_asset_replacements_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="sticky top-[60px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 backdrop-blur">
        <p className="text-sm text-slate-700"><b>{picked.length}</b> replacement{picked.length === 1 ? '' : 's'} picked across {groups.length} ad groups with Low text</p>
        <button type="button" disabled={!picked.length} onClick={download}
          className="min-h-[38px] rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">Download picks (CSV)</button>
      </div>
      {!hasOffers && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Add your approved offers above first. Claude only writes prices and claims from that list.</p>}

      {groups.map((g) => {
        const key = g.campaign + '|' + g.adGroup;
        const r = results[key];
        const isOpen = !!open[key];
        return (
          <article key={key} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="min-w-0 text-left">
                <p className="break-all font-semibold">{short(g.campaign)} › {g.adGroup}</p>
                <p className="text-xs text-slate-500">{g.lowText} Low text asset{g.lowText > 1 ? 's' : ''} · {num(g.lowImpressions)} impressions · {g.strongText} Best/Good to learn from{r ? ` · suggested ${when(r.createdAt)}` : ''} · {isOpen ? 'hide' : 'show'}</p>
              </button>
              <button type="button" disabled={!!loading || !hasOffers} onClick={() => suggest(g)}
                className={`min-h-[36px] rounded-md px-3 text-sm font-semibold disabled:opacity-50 ${r ? 'border border-slate-300 bg-white' : 'bg-indigo-600 text-white'}`}>
                {loading === key ? 'Claude is writing…' : r ? 'Suggest again' : 'Suggest replacements'}
              </button>
            </div>
            {errors[key] && <p className="text-sm text-red-700">{errors[key]}</p>}
            {r && isOpen && (
              <>
                {r.findings && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><b>What Claude found:</b> {r.findings}</p>}
                {r.items.map((it) => {
                  const pk = key + '|' + it.assetId;
                  return (
                    <div key={it.assetId} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm"><span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">Low</span><span className="mr-2 text-xs text-slate-500">{it.field}</span><span className="text-slate-600 line-through decoration-slate-400">{it.current}</span></p>
                        <span className="text-xs tabular-nums text-slate-500">{num(it.impressions)} impr · {num(it.conversions)} conv</span>
                      </div>
                      {it.options.length === 0 && <p className="text-xs text-slate-500">No usable suggestion this time{it.removed ? ` (${it.removed} removed for breaking a rule)` : ''}. Try “Suggest again”.</p>}
                      {it.options.map((o, i) => {
                        const on = picks[pk] === i;
                        return (
                          <button key={i} type="button" aria-pressed={on}
                            onClick={() => setPicks((p) => { const n = { ...p }; if (on) delete n[pk]; else n[pk] = i; return n; })}
                            className={`flex items-start gap-3 rounded-md border p-3 text-left ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                            <span className={`mt-0.5 h-4 w-4 flex-none rounded-full border-2 ${on ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`} />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="break-words font-semibold">{o.text}</span>
                              <span className="text-xs text-slate-600">{o.why}</span>
                            </span>
                            <span className="flex flex-none flex-col items-end gap-1">
                              <span className="text-xs tabular-nums text-slate-500">{o.text.length}/{LIMIT[it.field]}</span>
                              {o.offerIds.map((id) => <span key={id} className="rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-800">{offerNames[id] || 'offer'}</span>)}
                            </span>
                          </button>
                        );
                      })}
                      {it.removed > 0 && it.options.length > 0 && <p className="text-xs text-slate-500">{it.removed} other suggestion{it.removed > 1 ? 's were' : ' was'} removed: too long, already used, or a number not in your approved offers.</p>}
                    </div>
                  );
                })}
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
