'use client';

import { useEffect, useState } from 'react';

type Status = 'done' | 'partly' | 'skip' | 'not';
type Saved = { status: Status; by: string; note: string; updatedAt: string; changedOn?: string | null } | null;
export type Detected = { key: string; date: string; when: string; by: string; summary: string } | null;

const OPTIONS: { key: Status; label: string; on: string }[] = [
  { key: 'done', label: '✓ Done', on: 'border-emerald-600 bg-emerald-600 text-white' },
  { key: 'partly', label: 'Partly done', on: 'border-amber-500 bg-amber-500 text-white' },
  { key: 'skip', label: 'Not relevant', on: 'border-slate-600 bg-slate-600 text-white' },
  { key: 'not', label: 'Not done', on: 'border-slate-400 bg-slate-200 text-slate-900' },
];
const LABEL: Record<Status, string> = { done: 'Done', partly: 'Partly done', skip: 'Not relevant', not: 'Not done' };
const NAME_KEY = 'stark_name';

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const dayLabel = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

type Pending = { kind: 'status'; status: Status; changedOn: string | null; note: string } | { kind: 'dismiss' };

// Done / Partly done / Not relevant / Not done for one recommendation, a "changed on" date,
// and, when STARK spotted a matching Google change, a one-click confirm. Remembers your name on this computer.
export default function RecStatus({ id, initial, detected }: { id: string; initial: Saved; detected?: Detected }) {
  const [saved, setSaved] = useState<Saved>(initial);
  const [name, setName] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState(initial?.note || '');
  const [changedOn, setChangedOn] = useState(initial?.changedOn || istToday());
  const [hideDetected, setHideDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try { setName(window.localStorage.getItem(NAME_KEY) || ''); } catch {}
  }, []);

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not save');
    return json;
  }

  async function run(p: Pending, by: string) {
    setBusy(true); setError('');
    try {
      if (p.kind === 'dismiss') {
        await post('/api/stark/dismiss', { id, key: detected?.key, by });
        setHideDetected(true);
      } else {
        const json = await post('/api/stark/status', { id, status: p.status, by, note: p.note, changedOn: p.changedOn });
        setSaved({ status: json.status, by: json.by, note: json.note, updatedAt: json.updatedAt, changedOn: json.changedOn });
        if (json.changedOn) setChangedOn(json.changedOn);
        setHideDetected(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function go(p: Pending) {
    if (!name.trim()) { setPending(p); return; }
    run(p, name.trim());
  }

  function confirmName() {
    const n = name.trim();
    if (!n) { setError('Enter your name first'); return; }
    try { window.localStorage.setItem(NAME_KEY, n); } catch {}
    const p = pending;
    setPending(null);
    if (p) run(p, n);
  }

  const current: Status = saved ? saved.status : 'not';
  const acted = !!saved && (saved.status === 'done' || saved.status === 'partly');
  const showDetected = !!detected && !hideDetected && !(saved && saved.status !== 'not');

  return (
    <div className="flex flex-col gap-2">
      {showDetected && detected && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">🔔 Change detected in Google Ads</p>
          <p className="mt-0.5">{detected.summary} · {detected.when} · {detected.by}</p>
          <p className="mt-0.5">Was this for this recommendation?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" disabled={busy} onClick={() => go({ kind: 'status', status: 'done', changedOn: detected.date, note: `Detected: ${detected.summary} (${detected.by})` })}
              className="min-h-[32px] rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60">Yes, mark Done</button>
            <button type="button" disabled={busy} onClick={() => go({ kind: 'status', status: 'partly', changedOn: detected.date, note: `Detected: ${detected.summary} (${detected.by})` })}
              className="min-h-[32px] rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 disabled:opacity-60">Partly done</button>
            <button type="button" disabled={busy} onClick={() => go({ kind: 'dismiss' })}
              className="min-h-[32px] rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-60">No, not this</button>
          </div>
        </div>
      )}

      <div role="group" aria-label="Action status" className="flex flex-wrap gap-1.5">
        {OPTIONS.map((o) => {
          const on = current === o.key;
          return (
            <button key={o.key} type="button" disabled={busy} aria-pressed={on}
              onClick={() => go({ kind: 'status', status: o.key, changedOn: o.key === 'done' || o.key === 'partly' ? changedOn : null, note: o.key === 'done' || o.key === 'partly' ? note : '' })}
              className={`min-h-[34px] rounded-md border px-3 text-xs font-semibold disabled:opacity-60 ${on ? o.on : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
              {o.label}
            </button>
          );
        })}
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
          <label className="text-xs text-slate-600" htmlFor={`name-${id}`}>Your name (saved on this computer)</label>
          <input id={`name-${id}`} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') confirmName(); }}
            className="min-h-[32px] rounded-md border border-slate-300 px-2 text-sm" autoFocus />
          <button type="button" onClick={confirmName} className="min-h-[32px] rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">Save</button>
        </div>
      )}

      {saved && saved.status !== 'not' && (
        <p className={`text-xs font-medium ${saved.status === 'done' ? 'text-emerald-700' : saved.status === 'partly' ? 'text-amber-800' : 'text-slate-600'}`}>
          {LABEL[saved.status]} by {saved.by} · marked {when(saved.updatedAt)}{saved.changedOn ? ` · changed ${dayLabel(saved.changedOn)}` : ''}{saved.note ? ` · “${saved.note}”` : ''}
        </p>
      )}

      {acted && saved && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600" htmlFor={`date-${id}`}>Changed on</label>
          <input id={`date-${id}`} type="date" value={changedOn} max={istToday()} onChange={(e) => setChangedOn(e.target.value)}
            className="min-h-[32px] rounded-md border border-slate-300 px-2 text-xs" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you change? (optional)" aria-label="Note"
            className="min-h-[32px] min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-xs" maxLength={280} />
          <button type="button" disabled={busy || (note === (saved.note || '') && changedOn === (saved.changedOn || ''))}
            onClick={() => go({ kind: 'status', status: saved.status, changedOn, note })}
            className="min-h-[32px] rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold disabled:opacity-50">Save</button>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
