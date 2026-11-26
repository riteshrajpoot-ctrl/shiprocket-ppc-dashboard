'use client';

import { useEffect, useState } from 'react';

type Status = 'done' | 'partly' | 'skip' | 'not';
type Saved = { status: Status; by: string; note: string; updatedAt: string } | null;

const OPTIONS: { key: Status; label: string; on: string }[] = [
  { key: 'done', label: '✓ Done', on: 'border-emerald-600 bg-emerald-600 text-white' },
  { key: 'partly', label: 'Partly done', on: 'border-amber-500 bg-amber-500 text-white' },
  { key: 'skip', label: 'Not relevant', on: 'border-slate-600 bg-slate-600 text-white' },
  { key: 'not', label: 'Not done', on: 'border-slate-400 bg-slate-200 text-slate-900' },
];
const LABEL: Record<Status, string> = { done: 'Done', partly: 'Partly done', skip: 'Not relevant', not: 'Not done' };
const NAME_KEY = 'stark_name';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Done / Partly done / Not relevant / Not done buttons for one recommendation. Remembers your name on this computer.
export default function RecStatus({ id, initial }: { id: string; initial: Saved }) {
  const [saved, setSaved] = useState<Saved>(initial);
  const [name, setName] = useState('');
  const [askName, setAskName] = useState<Status | null>(null);
  const [note, setNote] = useState(initial?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try { setName(window.localStorage.getItem(NAME_KEY) || ''); } catch {}
  }, []);

  async function save(status: Status, by: string, noteText: string) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/stark/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, by, note: noteText }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setSaved({ status: json.status, by: json.by, note: json.note, updatedAt: json.updatedAt });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pick(status: Status) {
    if (!name.trim()) { setAskName(status); return; }
    save(status, name.trim(), status === 'done' || status === 'partly' ? note : '');
  }

  function confirmName() {
    const n = name.trim();
    if (!n || !askName) return;
    try { window.localStorage.setItem(NAME_KEY, n); } catch {}
    const s = askName;
    setAskName(null);
    save(s, n, '');
  }

  const current: Status = saved ? saved.status : 'not';
  const acted = saved && (saved.status === 'done' || saved.status === 'partly');

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Action status" className="flex flex-wrap gap-1.5">
        {OPTIONS.map((o) => {
          const on = current === o.key;
          return (
            <button key={o.key} type="button" disabled={busy} aria-pressed={on} onClick={() => pick(o.key)}
              className={`min-h-[34px] rounded-md border px-3 text-xs font-semibold disabled:opacity-60 ${on ? o.on : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      {askName && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
          <label className="text-xs text-slate-600" htmlFor={`name-${id}`}>Your name (saved on this computer)</label>
          <input id={`name-${id}`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmName(); }}
            className="min-h-[32px] rounded-md border border-slate-300 px-2 text-sm" autoFocus />
          <button type="button" onClick={confirmName} className="min-h-[32px] rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">Save</button>
        </div>
      )}
      {saved && saved.status !== 'not' && (
        <p className={`text-xs font-medium ${saved.status === 'done' ? 'text-emerald-700' : saved.status === 'partly' ? 'text-amber-800' : 'text-slate-600'}`}>
          {LABEL[saved.status]} by {saved.by} · {when(saved.updatedAt)}{saved.note ? ` · “${saved.note}”` : ''}
        </p>
      )}
      {acted && (
        <div className="flex flex-wrap gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you change? (optional)" aria-label="Note"
            className="min-h-[32px] flex-1 rounded-md border border-slate-200 px-2 text-xs" maxLength={280} />
          <button type="button" disabled={busy || note === (saved?.note || '')} onClick={() => saved && save(saved.status, saved.by || name, note)}
            className="min-h-[32px] rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold disabled:opacity-50">Save note</button>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
