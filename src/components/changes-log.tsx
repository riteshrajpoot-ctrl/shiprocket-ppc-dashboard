'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Change = {
  id: number; campaign: string; adGroup: string; field: string; oldText: string; newText: string; pickedBy: string;
  createdAt: string; status: 'queued' | 'preview' | 'applied' | 'skipped' | 'error'; message: string; appliedAt: string | null; undoOf: number | null;
};
const CHIP: Record<string, string> = {
  queued: 'bg-sky-100 text-sky-900', preview: 'bg-violet-100 text-violet-800', applied: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-100 text-slate-700', error: 'bg-red-100 text-red-800',
};
const LABEL: Record<string, string> = { queued: 'Waiting for script', preview: 'Preview logged', applied: 'Applied', skipped: 'Skipped', error: 'Error' };
const short = (c: string) => c.replace(/^sr_quick_/i, '');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

// Every ad-copy change sent from STARK, its status from the "STARK apply" script, and Undo / Cancel.
export default function ChangesLog({ initial }: { initial: Change[] }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const router = useRouter();

  async function act(action: 'undo' | 'cancel', id: number) {
    let by = '';
    try { by = window.localStorage.getItem('stark_name') || ''; } catch {}
    if (!by) by = (window.prompt('Your name (saved on this computer)') || '').trim();
    if (!by) return;
    try { window.localStorage.setItem('stark_name', by); } catch {}
    setBusy(id); setError('');
    try {
      const res = await fetch('/api/stark/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, by }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not do that');
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(0); }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold">Change log</h2>
        <p className="text-sm text-slate-600">Ad-copy changes sent to Google Ads from STARK. The same record, with old and new text, is in the sheet tab “Changes”.</p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="w-[7rem] px-2 py-2 font-medium">Sent</th><th className="w-[16rem] px-2 py-2 font-medium">Ad group</th>
              <th className="px-2 py-2 font-medium">Old → new</th><th className="w-[11rem] px-2 py-2 font-medium">Status</th><th className="w-[6rem] px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 ? (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-slate-500">No changes sent yet.</td></tr>
            ) : initial.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-2 py-2 text-xs text-slate-600">{when(c.createdAt)}<br />{c.pickedBy}</td>
                <td className="break-all px-2 py-2 text-xs">{short(c.campaign)} › {c.adGroup}<br /><span className="text-slate-500">{c.field}{c.undoOf ? ` · undo of #${c.undoOf}` : ''}</span></td>
                <td className="px-2 py-2 text-xs"><span className="text-slate-500 line-through">{c.oldText}</span><br /><span className="font-semibold">{c.newText}</span></td>
                <td className="px-2 py-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${CHIP[c.status]}`}>{LABEL[c.status]}</span>
                  {c.appliedAt && <p className="mt-1 text-slate-500">{when(c.appliedAt)}</p>}
                  {c.message && c.status !== 'applied' && <p className="mt-1 text-slate-500">{c.message}</p>}
                </td>
                <td className="px-2 py-2 text-xs">
                  {c.status === 'applied' && <button type="button" disabled={!!busy} onClick={() => act('undo', c.id)} className="rounded-md border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50">Undo</button>}
                  {(c.status === 'queued' || c.status === 'preview' || c.status === 'error' || c.status === 'skipped') && <button type="button" disabled={!!busy} onClick={() => act('cancel', c.id)} className="rounded-md border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50">{c.status === 'queued' || c.status === 'preview' ? 'Cancel' : 'Remove'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
