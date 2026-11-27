'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const [scope, setScope] = useState<'10' | '20' | 'all'>('10');
  const [skipDone, setSkipDone] = useState(true);
  const [batch, setBatch] = useState<{ total: number; done: number; failed: number; current: string[] } | null>(null);
  const stopRef = useRef(false);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');
  const [applyErr, setApplyErr] = useState('');
  const [applying, setApplying] = useState(false);

  // One ad group = one Claude call (kept under Vercel's 60-second limit per request).
  async function fetchOne(g: Group): Promise<boolean> {
    const key = g.campaign + '|' + g.adGroup;
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const res = await fetch('/api/stark/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b: business, campaign: g.campaign, adGroup: g.adGroup }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Claude could not suggest replacements');
      setResults((r) => ({ ...r, [key]: json }));
      setPicks((p) => { const n = { ...p }; Object.keys(n).forEach((k) => { if (k.indexOf(key + '|') === 0) delete n[k]; }); return n; });
      return true;
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message }));
      return false;
    }
  }

  async function suggest(g: Group) {
    const key = g.campaign + '|' + g.adGroup;
    setLoading(key);
    if (await fetchOne(g)) setOpen((o) => ({ ...o, [key]: true }));
    setLoading('');
  }

  // "Suggest for all": works through the busiest ad groups, two at a time, while the tab stays open.
  async function suggestAll() {
    const list = (scope === 'all' ? groups : groups.slice(0, Number(scope)))
      .filter((g) => !(skipDone && results[g.campaign + '|' + g.adGroup]));
    if (!list.length) return;
    stopRef.current = false;
    let next = 0, done = 0, failed = 0;
    const running: string[] = [];
    setBatch({ total: list.length, done: 0, failed: 0, current: [] });
    const worker = async () => {
      while (!stopRef.current && next < list.length) {
        const g = list[next++];
        const label = `${short(g.campaign)} › ${g.adGroup}`;
        running.push(label);
        setBatch({ total: list.length, done, failed, current: running.slice() });
        const ok = await fetchOne(g);
        running.splice(running.indexOf(label), 1);
        if (ok) done++; else failed++;
        setBatch({ total: list.length, done, failed, current: running.slice() });
      }
    };
    await Promise.all([worker(), worker()]);
    setBatch((b) => (b ? { ...b, current: [] } : b));
  }

  // Convenience: pick the first suggestion for every Low asset that doesn't have a pick yet.
  function pickFirstEverywhere() {
    setPicks((p) => {
      const n = { ...p };
      Object.keys(results).forEach((gk) => results[gk].items.forEach((it) => {
        const pk = gk + '|' + it.assetId;
        if (n[pk] === undefined && it.options.length) n[pk] = 0;
      }));
      return n;
    });
  }

  const running = !!batch && batch.current.length > 0;

  const picked = Object.keys(picks);

  // The picked replacements as rows: campaign, ad group, field, old text, new text.
  function pickedRows() {
    const rows: { campaign: string; adGroup: string; field: 'Headline' | 'Description'; oldText: string; newText: string }[] = [];
    picked.forEach((k) => {
      const parts = k.split('|');
      const r = results[parts[0] + '|' + parts[1]];
      const item = r && r.items.filter((i) => i.assetId === parts[2])[0];
      const o = item && item.options[picks[k]];
      if (r && item && o) rows.push({ campaign: r.campaign, adGroup: r.adGroup, field: item.field, oldText: item.current, newText: o.text });
    });
    return rows;
  }

  async function applyToGoogle() {
    let by = '';
    try { by = window.localStorage.getItem('stark_name') || ''; } catch {}
    if (!by) by = (window.prompt('Your name (saved on this computer)') || '').trim();
    if (!by) return;
    try { window.localStorage.setItem('stark_name', by); } catch {}
    setApplying(true); setApplyErr(''); setApplyMsg('');
    try {
      const res = await fetch('/api/stark/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b: business, by, changes: pickedRows() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not queue the changes');
      setApplyMsg(`${json.length} change${json.length === 1 ? '' : 's'} proposed. At its next run (hourly, or click Run in Google Ads) the “STARK apply” script adds them to the sheet tab “Approvals”. Type Yes in the Approve column to apply each one.`);
      setConfirming(false);
      setPicks({});
      router.refresh();
    } catch (e) {
      setApplyErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

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
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!picked.length} onClick={download}
            className="min-h-[38px] rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-40">Download picks (CSV)</button>
          <button type="button" disabled={!picked.length || applying} onClick={() => setConfirming(true)}
            className="min-h-[38px] rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40">Send {picked.length || ''} for approval</button>
        </div>
      </div>
      {applyMsg && <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{applyMsg}</p>}
      {confirming && (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-emerald-500 bg-white p-4">
          <p className="font-semibold">Send these {picked.length} changes for approval?</p>
          <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[720px] table-fixed text-xs">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="w-[30%] p-2 font-medium">Ad group</th><th className="w-[10%] p-2 font-medium">Field</th><th className="w-[30%] p-2 font-medium">Old (Low)</th><th className="w-[30%] p-2 font-medium">New</th></tr></thead>
              <tbody>
                {pickedRows().map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="break-all p-2">{short(r.campaign)} › {r.adGroup}</td><td className="p-2">{r.field}</td>
                    <td className="p-2 text-slate-500 line-through">{r.oldText}</td><td className="p-2 font-semibold">{r.newText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600">Nothing changes in Google Ads yet. The “STARK apply” script copies these into the sheet tab “Approvals” (old and new text). Each one is applied only after someone types Yes in its Approve cell; No rejects it.</p>
          {applyErr && <p className="text-sm text-red-700">{applyErr}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={applying} onClick={applyToGoogle} className="min-h-[38px] rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{applying ? 'Sending…' : 'Yes, send for approval'}</button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-[38px] rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-indigo-950">Suggest for several ad groups at once</p>
          <label className="flex items-center gap-2 text-sm text-indigo-950">
            Busiest
            <select value={scope} onChange={(e) => setScope(e.target.value as '10' | '20' | 'all')} disabled={running} className="min-h-[32px] rounded-md border border-indigo-300 bg-white px-2 text-sm">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="all">All {groups.length}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-indigo-950">
            <input type="checkbox" checked={skipDone} onChange={(e) => setSkipDone(e.target.checked)} disabled={running} />
            Skip ad groups that already have suggestions
          </label>
          {running ? (
            <button type="button" onClick={() => { stopRef.current = true; }} className="min-h-[36px] rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700">Stop after current</button>
          ) : (
            <button type="button" disabled={!hasOffers || !!loading} onClick={suggestAll} className="min-h-[36px] rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Suggest for all</button>
          )}
          <button type="button" disabled={!Object.keys(results).length} onClick={pickFirstEverywhere} className="min-h-[36px] rounded-md border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-900 disabled:opacity-50">Pick the first option everywhere</button>
        </div>
        {batch && (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-2 bg-indigo-600 transition-all" style={{ width: `${((batch.done + batch.failed) / batch.total) * 100}%` }} /></div>
            <p className="text-xs text-indigo-950">
              {batch.done + batch.failed} of {batch.total} ad groups done{batch.failed ? ` · ${batch.failed} failed (see the red notes; try them again)` : ''}
              {running ? ` · writing: ${batch.current.join(' and ')}. Keep this tab open.` : stopRef.current ? ' · stopped.' : ' · finished.'}
            </p>
          </div>
        )}
        <p className="text-xs text-indigo-900">Each ad group is one Claude call of about 15–30 seconds. Results appear below as they arrive; review them before downloading.</p>
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
              <button type="button" disabled={!!loading || !hasOffers || running} onClick={() => suggest(g)}
                className={`min-h-[36px] rounded-md px-3 text-sm font-semibold disabled:opacity-50 ${r ? 'border border-slate-300 bg-white' : 'bg-indigo-600 text-white'}`}>
                {loading === key || (batch && batch.current.indexOf(`${short(g.campaign)} › ${g.adGroup}`) >= 0) ? 'Claude is writing…' : r ? 'Suggest again' : 'Suggest replacements'}
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
