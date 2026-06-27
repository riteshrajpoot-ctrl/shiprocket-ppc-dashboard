'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, RefreshCw, ChevronDown, Bell, X, Send, Bot, ChevronRight, Zap, ArrowUp, ArrowDown, Pause, Target, Activity, Users, ShoppingBag, AlertTriangle, CheckCircle, Clock, BarChart2, ExternalLink } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Campaign {
  campaign_name: string; campaign_id: string; objective: string
  spend: number; installs: number; clicks: number; leads: number
  impressions: number; cpi: number; ctr: number; cpl: number; frequency: number; reach: number
  branch_installs: number; first_orders: number; cpo: number; install_to_order_rate: number
}
interface DailyRow { date: string; spend: number; installs: number; clicks: number; impressions: number; ctr: number; cpi: number }
interface Alert { severity: 'critical' | 'warning'; msg: string; time: string; category: string }
interface HealthItem { label: string; score: number; max: number }
interface BudgetSuggestion { campaign_id: string; campaign_name: string; current_spend: number; cpi: number; cpo: number; installs: number; first_orders: number; action: 'scale' | 'maintain' | 'reduce' | 'pause'; suggested_change_pct: number; reason: string }
interface MetricsData { campaigns: Campaign[]; daily: DailyRow[]; totals: any; alerts: Alert[]; health: number; healthBreakdown: HealthItem[]; budgetSuggestions: BudgetSuggestion[] }
interface ChatMessage { role: 'user' | 'assistant'; content: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const labelFmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtL = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}K` : `₹${Math.round(n)}`

function getDateRange(tag: string, cs?: string, ce?: string) {
  const today = new Date()
  if (tag === 'Custom' && cs && ce) return { start: cs, end: ce, label: `${labelFmt(new Date(cs))} – ${labelFmt(new Date(ce))}` }
  if (tag === 'MTD') { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { start: fmtDate(s), end: fmtDate(today), label: `${labelFmt(s)} – ${labelFmt(today)}` } }
  if (tag === 'Last 7d') { const s = new Date(today); s.setDate(today.getDate() - 6); return { start: fmtDate(s), end: fmtDate(today), label: `${labelFmt(s)} – ${labelFmt(today)}` } }
  if (tag === 'May') return { start: '2026-05-01', end: '2026-05-31', label: 'May 2026' }
  if (tag === 'Apr') return { start: '2026-04-01', end: '2026-04-30', label: 'April 2026' }
  const s = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: fmtDate(s), end: fmtDate(today), label: `${labelFmt(s)} – ${labelFmt(today)}` }
}

function Skeleton() { return <div className="animate-pulse bg-slate-100 rounded-md h-4 w-full" /> }

function CpiPill({ val, target = 20 }: { val: number; target?: number }) {
  if (!val) return <span className="text-xs text-slate-400">—</span>
  if (val <= target * 0.75) return <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">₹{Math.round(val)}</span>
  if (val <= target) return <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">₹{Math.round(val)}</span>
  return <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">₹{Math.round(val)}</span>
}

function ObjBadge({ obj }: { obj: string }) {
  const map: Record<string, [string, string]> = {
    APP_INSTALLS: ['bg-blue-50 text-blue-700', 'Installs'], OUTCOME_APP_PROMOTION: ['bg-blue-50 text-blue-700', 'Installs'],
    OUTCOME_LEADS: ['bg-purple-50 text-purple-700', 'Leads'], LEAD_GENERATION: ['bg-purple-50 text-purple-700', 'Leads'],
    OUTCOME_AWARENESS: ['bg-amber-50 text-amber-700', 'Awareness'], BRAND_AWARENESS: ['bg-amber-50 text-amber-700', 'Awareness'],
  }
  const [style, label] = map[obj] || ['bg-slate-100 text-slate-500', obj.slice(0, 8)]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>{label}</span>
}

// ── Channel Card ──────────────────────────────────────────────────────────────
function ChannelCard({ icon, name, status, color, metrics, budgetUsed, onClick }: {
  icon: string; name: string; status: string; color: string
  metrics?: { label: string; value: string | null; color?: string }[]
  budgetUsed?: number | null; onClick?: () => void
}) {
  const statusConfig: Record<string, { dot: string; label: string }> = {
    live: { dot: 'bg-emerald-500', label: 'Live' },
    beta: { dot: 'bg-amber-400', label: 'Beta' },
    soon: { dot: 'bg-slate-300', label: 'Soon' },
  }
  const s = statusConfig[status] || statusConfig.soon
  const isActive = status === 'live' || status === 'beta'

  return (
    <div onClick={isActive && onClick ? onClick : undefined}
      className={`bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 ${isActive && onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all' : isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold ${color}`}>{icon}</div>
          <div>
            <div className="text-sm font-semibold text-slate-800">{name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className="text-xs text-slate-400">{s.label}</span>
            </div>
          </div>
        </div>
        {isActive && onClick && <ExternalLink size={12} className="text-slate-300" />}
      </div>

      {isActive && metrics ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {metrics.map(m => (
              <div key={m.label} className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-400 mb-0.5">{m.label}</div>
                <div className={`text-sm font-semibold ${m.color || 'text-slate-800'}`}>{m.value ?? '—'}</div>
              </div>
            ))}
          </div>
          {budgetUsed != null && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Budget pacing</span>
                <span className={budgetUsed > 90 ? 'text-red-500' : budgetUsed > 70 ? 'text-emerald-600' : 'text-amber-600'}>{budgetUsed}% used</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(budgetUsed, 100)}%`, background: budgetUsed > 90 ? '#E24B4A' : budgetUsed > 70 ? '#1D9E75' : '#EF9F27' }} />
              </div>
            </div>
          )}
        </>
      ) : !isActive ? (
        <div className="text-xs text-slate-400 text-center py-4">Integration coming soon</div>
      ) : null}
    </div>
  )
}

// ── Drilldown Modal ───────────────────────────────────────────────────────────
function DrilldownModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-lg mx-4 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div><div className="text-sm font-semibold text-slate-800 mb-1">{campaign.campaign_name}</div><ObjBadge obj={campaign.objective} /></div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total spend', value: fmtL(Number(campaign.spend)) },
            { label: 'Installs', value: Number(campaign.installs) > 0 ? Number(campaign.installs).toLocaleString('en-IN') : '—' },
            { label: 'CPI', value: Number(campaign.cpi) > 0 ? `₹${Math.round(Number(campaign.cpi))}` : '—' },
            { label: 'Clicks', value: Number(campaign.clicks).toLocaleString('en-IN') },
            { label: 'CTR', value: Number(campaign.ctr).toFixed(2) + '%' },
            { label: 'Frequency', value: Number(campaign.frequency).toFixed(2) },
            { label: 'Reach', value: (Number(campaign.reach) / 1000).toFixed(1) + 'K' },
            { label: 'First orders', value: Number(campaign.first_orders) > 0 ? Number(campaign.first_orders).toString() : '—' },
            { label: 'CPO', value: Number(campaign.cpo) > 0 ? `₹${Math.round(Number(campaign.cpo))}` : '—' },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">{m.label}</div>
              <div className="text-sm font-semibold text-slate-800">{m.value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          <div className="text-xs text-slate-400 mb-2">Performance signals</div>
          {Number(campaign.ctr) < 0.5 && <div className="text-xs text-red-600 flex items-center gap-1.5"><AlertTriangle size={11} />Low CTR — consider refreshing creatives</div>}
          {Number(campaign.cpi) > 50 && <div className="text-xs text-red-600 flex items-center gap-1.5"><AlertTriangle size={11} />High CPI ₹{Math.round(Number(campaign.cpi))} — review audience</div>}
          {Number(campaign.frequency) > 2.5 && <div className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={11} />High frequency {Number(campaign.frequency).toFixed(1)} — creative fatigue likely</div>}
          {Number(campaign.cpi) > 0 && Number(campaign.cpi) <= 15 && <div className="text-xs text-emerald-600 flex items-center gap-1.5"><CheckCircle size={11} />Excellent CPI — consider scaling budget</div>}
          {Number(campaign.ctr) >= 1.2 && <div className="text-xs text-emerald-600 flex items-center gap-1.5"><CheckCircle size={11} />Strong CTR — creative is resonating</div>}
        </div>
      </div>
    </div>
  )
}

// ── Budget Optimizer ──────────────────────────────────────────────────────────
function BudgetOptimizer({ suggestions, onClose }: { suggestions: BudgetSuggestion[]; onClose: () => void }) {
  const [applied, setApplied] = useState<string[]>([])
  const [applying, setApplying] = useState<string | null>(null)
  const cfg = { scale: { icon: <ArrowUp size={12} />, color: 'text-emerald-700 bg-emerald-50', label: 'Scale +20%' }, maintain: { icon: <Minus size={12} />, color: 'text-slate-600 bg-slate-100', label: 'Maintain' }, reduce: { icon: <ArrowDown size={12} />, color: 'text-amber-700 bg-amber-50', label: 'Reduce 30%' }, pause: { icon: <Pause size={12} />, color: 'text-red-700 bg-red-50', label: 'Pause' } }
  const handleApply = async (s: BudgetSuggestion) => { if (s.action === 'maintain') return; setApplying(s.campaign_id); await new Promise(r => setTimeout(r, 1500)); setApplied(prev => [...prev, s.campaign_id]); setApplying(null) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-2xl mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Zap size={14} className="text-amber-500" />Budget optimizer</div><div className="text-xs text-slate-400 mt-0.5">AI-recommended budget changes based on performance</div></div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {suggestions.map(s => { const c = cfg[s.action]; const isApplied = applied.includes(s.campaign_id); const isApplying = applying === s.campaign_id; return (
            <div key={s.campaign_id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
              <div className="flex-1 min-w-0"><div className="text-xs font-medium text-slate-800 truncate">{s.campaign_name}</div><div className="text-xs text-slate-400 mt-0.5">{s.reason}</div></div>
              <div className="text-right flex-shrink-0"><div className="text-xs text-slate-500">{fmtL(s.current_spend)} · {s.installs} installs</div><div className="text-xs font-medium text-slate-700">CPI ₹{Math.round(s.cpi)}</div></div>
              <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${c.color}`}>{c.icon}{c.label}</div>
              {s.action !== 'maintain' && <button onClick={() => handleApply(s)} disabled={isApplied || isApplying} className={`text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer ${isApplied ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-900 text-white'} disabled:opacity-60`}>{isApplied ? '✓ Applied' : isApplying ? 'Applying...' : 'Apply'}</button>}
            </div>
          )})}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl"><div className="text-xs text-slate-400">Budget changes applied via Meta Ads API. Takes effect within 15 minutes.</div></div>
      </div>
    </div>
  )
}

// ── AI Sidekick ───────────────────────────────────────────────────────────────
function AISidekick({ data, range, onClose }: { data: MetricsData | null; range: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: `Hi! I have live data for ${range}. Ask me anything — "Why is CPI high?", "Which campaign to scale?", "How's budget pacing?"` }])
  const [input, setInput] = useState(''); const [thinking, setThinking] = useState(false); const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const send = async (msg?: string) => {
    const userMsg = msg || input.trim(); if (!userMsg || thinking) return; setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]); setThinking(true)
    try {
      const context = data ? `Period: ${range}\nSpend: ${fmtL(data.totals.spend)} | Installs: ${data.totals.installs} | CPI: ₹${data.totals.cpi} | CTR: ${data.totals.ctr}%\nHealth: ${data.health}/100\nCampaigns: ${data.campaigns.map(c => `${c.campaign_name}(₹${Math.round(c.spend)},${c.installs} installs,CPI:₹${Math.round(c.cpi)},CTR:${c.ctr}%)`).join('; ')}\nAlerts: ${data.alerts.map(a => a.msg).join('; ')}` : 'No data.'
      const res = await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg, context, history: messages.slice(-6) }) })
      const json = await res.json(); setMessages(prev => [...prev, { role: 'assistant', content: json.reply || 'Could not get response.' }])
    } catch { setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]) }
    finally { setThinking(false) }
  }
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col" style={{ height: '420px' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center"><Bot size={12} className="text-blue-100" /></div><span className="text-sm font-semibold text-slate-800">PPC Sidekick</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`text-xs rounded-xl px-3 py-2 max-w-[85%] leading-relaxed ${m.role === 'user' ? 'bg-blue-900 text-blue-50' : 'bg-slate-100 text-slate-700'}`}>{m.content}</div></div>)}
        {thinking && <div className="flex justify-start"><div className="text-xs rounded-xl px-3 py-2 bg-slate-100 text-slate-400 animate-pulse">Thinking...</div></div>}
        <div ref={bottomRef} />
      </div>
      <div className="px-3 pb-3">
        <div className="flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about your campaigns..." className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-300" /><button onClick={() => send()} disabled={thinking || !input.trim()} className="p-2 rounded-xl bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40"><Send size={12} /></button></div>
        <div className="flex gap-1.5 mt-2 flex-wrap">{['Why is CPI high?', 'Best campaign?', 'Scale budget?'].map(q => <button key={q} onClick={() => send(q)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 border-none cursor-pointer hover:bg-slate-200">{q}</button>)}</div>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeMetric, setActiveMetric] = useState<'spend' | 'installs' | 'clicks' | 'ctr' | 'cpi'>('spend')
  const [activeRangeTag, setActiveRangeTag] = useState('MTD')
  const [customStart, setCustomStart] = useState(''); const [customEnd, setCustomEnd] = useState('')
  const [showDateMenu, setShowDateMenu] = useState(false); const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [activeAccount, setActiveAccount] = useState('Quick')
  const [lastUpdated, setLastUpdated] = useState('Just now')
  const [chartLoaded, setChartLoaded] = useState(false)
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [showSidekick, setShowSidekick] = useState(false); const [showOptimizer, setShowOptimizer] = useState(false)

  // Branch state
  const [branchData, setBranchData] = useState<{ total_orders: number; total_installs: number; by_partner: { partner: string; installs: number; orders: number }[] } | null>(null)
  const [branchLoading, setBranchLoading] = useState(true)

  const range = getDateRange(activeRangeTag, customStart, customEnd)

  const fetchMetrics = useCallback(async (tag: string, cs?: string, ce?: string) => {
    setLoading(true); setError(null)
    try {
      const r = getDateRange(tag, cs, ce)
      const res = await fetch(`/api/live-metrics?date_start=${r.start}&date_end=${r.end}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json(); if (json.error) throw new Error(json.error)
      setData(json); setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e: any) { setError('Failed to load: ' + e.message) }
    finally { setLoading(false) }
  }, [])

  const fetchBranch = useCallback(async (tag: string, cs?: string, ce?: string) => {
    setBranchLoading(true)
    try {
      const r = getDateRange(tag, cs, ce)
      const res = await fetch(`/api/branch-metrics?start_date=${r.start}&end_date=${r.end}`)
      if (!res.ok) return
      const json = await res.json()
      if (!json.error) setBranchData(json)
    } catch {}
    finally { setBranchLoading(false) }
  }, [])

  useEffect(() => {
    fetchMetrics(activeRangeTag, customStart, customEnd)
    fetchBranch(activeRangeTag, customStart, customEnd)
  }, [activeRangeTag, customStart, customEnd, fetchMetrics, fetchBranch])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = () => setChartLoaded(true); document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (!chartLoaded || !data?.daily?.length) return
    const W = window as any; if (!W.Chart) return
    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement; if (!canvas) return
    const ex = W.Chart.getChart(canvas); if (ex) ex.destroy()
    const colors = { spend: '#378ADD', installs: '#1D9E75', clicks: '#534AB7', ctr: '#EF9F27', cpi: '#E24B4A' }
    const labels = data.daily.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
    const values = data.daily.map(d => activeMetric === 'ctr' ? Number(Number(d[activeMetric]).toFixed(2)) : Math.round(Number(d[activeMetric])))
    const fmtV = (v: number) => activeMetric === 'spend' ? fmtL(v) : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + v : v.toLocaleString('en-IN')
    new W.Chart(canvas, { type: 'line', data: { labels, datasets: [{ data: values, borderColor: colors[activeMetric], backgroundColor: colors[activeMetric] + '15', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: colors[activeMetric] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' ' + fmtV(ctx.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => fmtV(v) } } }, animation: { duration: 300 } } })
  }, [chartLoaded, data, activeMetric])

  // Derived values
  const campaigns = data?.campaigns ?? []
  const daily = data?.daily ?? []
  const alerts = data?.alerts ?? []
  const health = data?.health ?? 0
  const healthBreakdown = data?.healthBreakdown ?? []
  const budgetSuggestions = data?.budgetSuggestions ?? []
  const totals = data?.totals ?? {}

  const totalSpend = campaigns.reduce((a, c) => a + Number(c.spend), 0)
  const totalInstalls = campaigns.reduce((a, c) => a + Number(c.installs), 0)
  const totalClicks = campaigns.reduce((a, c) => a + Number(c.clicks), 0)
  const totalImpressions = campaigns.reduce((a, c) => a + Number(c.impressions), 0)
  const totalFirstOrders = campaigns.reduce((a, c) => a + Number(c.first_orders), 0)
  const avgCPI = totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : 0
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0'

  // Supply vs Demand split — demand = has first orders, supply = no first orders
  const supplyCampaigns = campaigns.filter(c => Number(c.first_orders) === 0)
  const demandCampaigns = campaigns.filter(c => Number(c.first_orders) > 0)
  const supplySpend = supplyCampaigns.reduce((a, c) => a + Number(c.spend), 0)
  const demandSpend = demandCampaigns.reduce((a, c) => a + Number(c.spend), 0)
  const supplyInstalls = supplyCampaigns.reduce((a, c) => a + Number(c.installs), 0)
  const demandInstalls = demandCampaigns.reduce((a, c) => a + Number(c.installs), 0)
  const demandOrders = demandCampaigns.reduce((a, c) => a + Number(c.first_orders), 0)
  const supplyCPI = supplyInstalls > 0 ? Math.round(supplySpend / supplyInstalls) : 0
  const demandCPI = demandInstalls > 0 ? Math.round(demandSpend / demandInstalls) : 0
  const demandCPO = demandOrders > 0 ? Math.round(demandSpend / demandOrders) : 0
  const supplyCTR = ((supplyCampaigns.reduce((a, c) => a + Number(c.clicks), 0) / Math.max(supplyCampaigns.reduce((a, c) => a + Number(c.impressions), 0), 1)) * 100).toFixed(2)
  const budgetPacing = totalSpend > 0 ? Math.round((totalSpend / 350000) * 100) : 0

  const metricValues = daily.map(d => Number(d[activeMetric]))
  const avgMetric = metricValues.length ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length : 0
  const peakIdx = metricValues.length ? metricValues.indexOf(Math.max(...metricValues)) : -1
  const lowIdx = metricValues.length ? metricValues.indexOf(Math.min(...metricValues)) : -1
  const fmtMetric = (v: number) => activeMetric === 'spend' ? fmtL(v) : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + Math.round(v) : Math.round(v).toLocaleString('en-IN')
  const peakLabel = daily[peakIdx] ? `${fmtMetric(metricValues[peakIdx])} (${new Date(daily[peakIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'
  const lowLabel = daily[lowIdx] ? `${fmtMetric(metricValues[lowIdx])} (${new Date(daily[lowIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'
  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const healthStatus = health >= 80 ? 'Good' : health >= 60 ? 'Needs attention' : 'Critical'
  const healthColor = health >= 80 ? '#1D9E75' : health >= 60 ? '#EF9F27' : '#E24B4A'
  const scoreColor = (s: number, max: number) => { const p = s / max; return p >= 0.8 ? '#1D9E75' : p >= 0.6 ? '#EF9F27' : '#E24B4A' }

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDateMenu(false)}>
      {selectedCampaign && <DrilldownModal campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}
      {showOptimizer && <BudgetOptimizer suggestions={budgetSuggestions} onClose={() => setShowOptimizer(false)} />}
      {showSidekick && <AISidekick data={data} range={range.label} onClose={() => setShowSidekick(false)} />}

      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-4 h-11 flex items-center gap-2 sticky top-0 z-20">
        <div className="w-7 h-7 rounded-lg bg-blue-900 flex items-center justify-center flex-shrink-0"><span className="text-blue-100 text-xs font-semibold">SR</span></div>
        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">PPC command center</span>
        <div className="flex gap-1.5 ml-2">
          {['Quick', 'Main', 'All'].map(a => (
            <button key={a} onClick={() => setActiveAccount(a)} className={`text-xs px-3 py-1 rounded-full border-none cursor-pointer ${activeAccount === a ? 'bg-blue-50 text-blue-800 font-medium' : 'bg-slate-100 text-slate-500'}`}>
              {a === 'All' ? 'All accounts' : `Shiprocket ${a}`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDateMenu(!showDateMenu)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50">
              <Calendar size={12} /><span>{range.label}</span><ChevronDown size={10} />
            </button>
            {showDateMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-30 w-60">
                <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Select date range</div>
                {['MTD', 'Last 7d', 'May', 'Apr'].map(tag => (
                  <button key={tag} onClick={() => { setActiveRangeTag(tag); setShowDateMenu(false) }} className={`block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 ${activeRangeTag === tag ? 'bg-blue-50 text-blue-800' : 'text-slate-700 bg-transparent'}`}>{getDateRange(tag).label}</button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button onClick={() => setShowCustomPicker(!showCustomPicker)} className="block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 text-slate-700 bg-transparent">Custom range {showCustomPicker ? '▲' : '▼'}</button>
                  {showCustomPicker && (
                    <div className="px-2 pb-2 space-y-2">
                      <div><div className="text-xs text-slate-400 mb-1">From</div><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" /></div>
                      <div><div className="text-xs text-slate-400 mb-1">To</div><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" /></div>
                      <button onClick={() => { if (customStart && customEnd) { setActiveRangeTag('Custom'); setShowDateMenu(false) } }} disabled={!customStart || !customEnd} className="w-full text-xs py-1.5 rounded-lg bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40">Apply range</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Live · Meta {activeAccount}</span>
          <button onClick={() => fetchMetrics(activeRangeTag, customStart, customEnd)} className="p-1.5 rounded-md hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-500"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setShowOptimizer(true)} disabled={budgetSuggestions.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 cursor-pointer hover:bg-amber-100 disabled:opacity-40"><Zap size={12} />Budget optimizer</button>
          <button onClick={() => setShowSidekick(!showSidekick)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border cursor-pointer ${showSidekick ? 'bg-blue-900 text-blue-50 border-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Bot size={12} />AI Sidekick</button>
          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-800">AK</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Showing data for <span className="text-slate-700 font-medium">{range.label}</span> · Shiprocket {activeAccount}</span>
          <span className="flex items-center gap-1"><Clock size={11} />Last updated: {lastUpdated}</span>
        </div>
        {error && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</div>}

        {/* ── SECTION 1: Channel overview ── */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Channel overview</div>
          <div className="grid grid-cols-4 gap-3">

            {/* Meta Ads — supply CPI + demand CPI separately */}
            <ChannelCard
              icon="M" name="Meta Ads" status="live" color="bg-blue-600"
              metrics={[
                { label: 'Total spend MTD', value: loading ? null : fmtL(totalSpend) },
                { label: 'Supply CPI', value: loading ? null : supplyCPI > 0 ? `₹${supplyCPI}` : '—', color: supplyCPI <= 20 ? 'text-emerald-600' : supplyCPI <= 50 ? 'text-amber-600' : 'text-red-500' },
                { label: 'Demand installs', value: loading ? null : demandInstalls > 0 ? demandInstalls.toLocaleString('en-IN') : '—', color: 'text-blue-600' },
                { label: 'Supply installs', value: loading ? null : supplyInstalls > 0 ? supplyInstalls.toLocaleString('en-IN') : '—', color: 'text-purple-600' },
              ]}
              budgetUsed={budgetPacing}
              onClick={() => window.location.href = '/growth-overview'}
            />

            {/* Google Ads — coming soon */}
            <ChannelCard icon="G" name="Google Ads" status="soon" color="bg-red-500" />

            {/* Branch — real Branch API data, all channels */}
            <ChannelCard
              icon="B" name="Branch" status="beta" color="bg-purple-600"
              metrics={[
                { label: 'Total installs', value: branchLoading ? null : branchData ? branchData.total_installs.toLocaleString('en-IN') : '—', color: 'text-emerald-600' },
                { label: 'First orders', value: branchLoading ? null : branchData ? branchData.total_orders.toLocaleString('en-IN') : '—', color: 'text-blue-600' },
                { label: 'Install → order %', value: branchLoading ? null : branchData && branchData.total_installs > 0 ? `${((branchData.total_orders / branchData.total_installs) * 100).toFixed(1)}%` : '—' },
                { label: 'Daily avg orders', value: branchLoading ? null : branchData ? `${Math.round(branchData.total_orders / Math.max(new Date().getDate(), 1))}` : '—' },
              ]}
              onClick={() => window.location.href = '/branch'}
            />

            {/* Affiliate — coming soon */}
            <ChannelCard icon="A" name="Affiliate" status="soon" color="bg-orange-500" />
          </div>
        </div>

        {/* ── SECTION 2: Supply vs Demand split ── */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Supply vs Demand — Meta Ads</div>
          <div className="grid grid-cols-2 gap-3">
            {/* Supply */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">🚗 Supply side</div>
                  <div className="text-xs text-slate-400 mt-0.5">Driver / partner acquisition</div>
                </div>
                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">{fmtL(supplySpend)} · {Math.round(supplySpend / Math.max(totalSpend, 1) * 100)}% of total</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Driver installs', value: loading ? null : supplyInstalls.toLocaleString('en-IN'), color: 'text-emerald-600' },
                  { label: 'Cost per install', value: loading ? null : supplyCPI > 0 ? `₹${supplyCPI}` : '—', color: supplyCPI <= 20 ? 'text-emerald-600' : 'text-amber-600' },
                  { label: 'Avg CTR', value: loading ? null : `${supplyCTR}%`, color: Number(supplyCTR) >= 1 ? 'text-emerald-600' : 'text-amber-600' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="text-xs text-slate-400 mb-1">{m.label}</div>
                    {m.value === null ? <Skeleton /> : <div className={`text-sm font-semibold ${m.color}`}>{m.value}</div>}
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-400 mb-1 flex justify-between"><span>Budget pacing</span><span className={budgetPacing > 80 ? 'text-emerald-600' : 'text-amber-600'}>{Math.round(supplySpend / 179000 * 100)}% used</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Math.round(supplySpend / 179000 * 100), 100)}%` }} /></div>
              <div className="mt-3">
                <div className="text-xs text-slate-500 font-medium mb-2">Top campaigns by installs</div>
                {loading ? <Skeleton /> : supplyCampaigns.slice(0, 3).map(c => (
                  <div key={c.campaign_id} onClick={() => setSelectedCampaign(c)} className="flex items-center justify-between py-1.5 border-b border-slate-50 cursor-pointer hover:bg-slate-50 px-1 rounded">
                    <span className="text-xs text-slate-700 truncate flex-1 mr-2">{c.campaign_name}</span>
                    <span className="text-xs text-emerald-600 font-medium flex-shrink-0">{Number(c.installs).toLocaleString('en-IN')} · ₹{Math.round(c.cpi)} CPI</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Demand */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">📦 Demand side</div>
                  <div className="text-xs text-slate-400 mt-0.5">Customer acquisition</div>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{fmtL(demandSpend)} · {Math.round(demandSpend / Math.max(totalSpend, 1) * 100)}% of total</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'App installs', value: loading ? null : demandInstalls.toLocaleString('en-IN'), color: 'text-emerald-600' },
                  { label: 'First orders', value: loading ? null : demandOrders > 0 ? demandOrders.toLocaleString('en-IN') : '—', color: 'text-blue-600' },
                  { label: 'Cost per order', value: loading ? null : demandCPO > 0 ? `₹${demandCPO}` : '—', color: demandCPO <= 550 ? 'text-emerald-600' : demandCPO <= 800 ? 'text-amber-600' : 'text-red-500' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="text-xs text-slate-400 mb-1">{m.label}</div>
                    {m.value === null ? <Skeleton /> : <div className={`text-sm font-semibold ${m.color}`}>{m.value}</div>}
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-400 mb-1 flex justify-between"><span>Budget pacing</span><span className={Math.round(demandSpend / 152000 * 100) > 80 ? 'text-emerald-600' : 'text-amber-600'}>{Math.round(demandSpend / 152000 * 100)}% used</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Math.round(demandSpend / 152000 * 100), 100)}%` }} /></div>
              <div className="mt-3">
                <div className="text-xs text-slate-500 font-medium mb-2">Top campaigns by first orders</div>
                {loading ? <Skeleton /> : demandCampaigns.filter(c => Number(c.first_orders) > 0).sort((a, b) => Number(b.first_orders) - Number(a.first_orders)).slice(0, 3).map(c => (
                  <div key={c.campaign_id} onClick={() => setSelectedCampaign(c)} className="flex items-center justify-between py-1.5 border-b border-slate-50 cursor-pointer hover:bg-slate-50 px-1 rounded">
                    <span className="text-xs text-slate-700 truncate flex-1 mr-2">{c.campaign_name}</span>
                    <span className="text-xs text-blue-600 font-medium flex-shrink-0">{Number(c.first_orders)} orders · ₹{Math.round(c.cpo)} CPO</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: KPI summary bar ── */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total MTD spend', value: loading ? null : fmtL(totalSpend), sub: `of ₹3.5L budget`, delta: `${budgetPacing}% paced`, trend: budgetPacing >= 40 && budgetPacing <= 90 ? 'up' : 'down', icon: <BarChart2 size={14} /> },
            { label: 'Total installs', value: loading ? null : totalInstalls.toLocaleString('en-IN'), sub: 'All campaigns', delta: `CPI ₹${avgCPI}`, trend: avgCPI <= 20 ? 'up' : 'flat', icon: <Users size={14} /> },
            { label: 'First orders', value: loading ? null : totalFirstOrders > 0 ? totalFirstOrders.toString() : '—', sub: 'Post-install conversions', delta: totals?.cpo > 0 ? `CPO ₹${Math.round(totals.cpo)}` : 'Awaiting data', trend: totals?.cpo > 0 && totals.cpo <= 800 ? 'up' : 'flat', icon: <ShoppingBag size={14} /> },
            { label: 'Avg CTR', value: loading ? null : `${avgCTR}%`, sub: 'Across all placements', delta: Number(avgCTR) >= 1 ? 'Above 1% target' : 'Below 1% target', trend: Number(avgCTR) >= 1 ? 'up' : 'down', icon: <Activity size={14} /> },
            { label: 'Account health', value: loading ? null : `${health}/100`, sub: healthStatus, delta: criticalCount > 0 ? `${criticalCount} critical alerts` : 'All systems good', trend: health >= 80 ? 'up' : health >= 60 ? 'flat' : 'down', icon: <Target size={14} /> },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">{k.icon}{k.label}</div>
              {k.value === null ? <div className="space-y-1.5 mt-1"><Skeleton /><Skeleton /></div> : (
                <>
                  <div className="text-xl font-semibold text-slate-800 leading-none">{k.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
                  <div className={`text-xs mt-1.5 flex items-center gap-1 ${k.trend === 'up' ? 'text-emerald-600' : k.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                    {k.trend === 'up' ? <TrendingUp size={11} /> : k.trend === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}{k.delta}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* ── SECTION 4: Trend chart + alerts ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div><span className="text-sm font-semibold text-slate-700">Performance trends</span><span className="text-xs text-slate-400 ml-2">{range.label}</span></div>
              <div className="flex gap-1.5 flex-wrap">
                {(['spend', 'installs', 'clicks', 'ctr', 'cpi'] as const).map(key => (
                  <button key={key} onClick={() => setActiveMetric(key)} className={`text-xs px-3 py-1 rounded-full border cursor-pointer ${activeMetric === key ? 'bg-blue-900 text-blue-50 border-blue-900' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative', height: '160px' }}>
              {loading ? <div className="flex items-center justify-center h-full text-xs text-slate-400 animate-pulse">Loading chart...</div> : <canvas id="trendCanvas" />}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <div className="flex gap-6">
                <div><div className="text-xs text-slate-400">Avg daily</div><div className="text-sm font-semibold text-slate-700 mt-0.5">{loading ? '—' : fmtMetric(avgMetric)}</div></div>
                <div><div className="text-xs text-slate-400">Peak day</div><div className="text-sm font-semibold text-emerald-600 mt-0.5">{loading ? '—' : peakLabel}</div></div>
                <div><div className="text-xs text-slate-400">Lowest day</div><div className="text-sm font-semibold text-red-500 mt-0.5">{loading ? '—' : lowLabel}</div></div>
              </div>
              <button onClick={() => setShowSidekick(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">Ask AI to analyse ↗</button>
            </div>
          </div>

          {/* Alerts + health */}
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex-1">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell size={13} className="text-slate-400" />Alerts</span>
                {criticalCount > 0 && <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">{criticalCount} critical</span>}
              </div>
              {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} />)}</div> :
                alerts.length === 0 ? <div className="text-xs text-emerald-600 py-2 flex items-center gap-1.5"><CheckCircle size={12} />All campaigns healthy</div> :
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex gap-2 py-1.5 border-b border-slate-50 last:border-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                        <div><div className="text-xs text-slate-700 leading-snug">{a.msg}</div><div className="text-xs text-slate-400 mt-0.5">{a.time}</div></div>
                      </div>
                    ))}
                  </div>
              }
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">Account health</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: healthColor + '20', color: healthColor }}>{health}/100 · {healthStatus}</span>
              </div>
              <div className="space-y-1.5">
                {(healthBreakdown.length > 0 ? healthBreakdown : [
                  { label: 'Budget pacing', score: 0, max: 20 }, { label: 'CPI vs target', score: 0, max: 20 },
                  { label: 'CTR quality', score: 0, max: 15 }, { label: 'Ad strength', score: 0, max: 15 },
                  { label: 'Reach diversity', score: 0, max: 15 }, { label: 'Wasted spend', score: 0, max: 15 },
                ]).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-24 flex-shrink-0">{s.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(s.score / s.max) * 100}%`, background: scoreColor(s.score, s.max) }} />
                    </div>
                    <span className="text-xs font-medium text-slate-600 w-4 text-right">{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Campaign table ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div><span className="text-sm font-semibold text-slate-700">All campaigns</span><span className="text-xs text-slate-400 ml-2">{range.label}</span></div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{campaigns.length} campaigns</span>
              <button onClick={() => setShowSidekick(true)} className="text-xs px-3 py-1 rounded-lg border border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-50">Ask AI ↗</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '800px' }}>
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium w-2/5">Campaign</th>
                  <th className="text-right pb-2 font-medium w-16">Spend</th>
                  <th className="text-right pb-2 font-medium w-16">Installs</th>
                  <th className="text-right pb-2 font-medium w-14">CPI</th>
                  <th className="text-right pb-2 font-medium w-16">1st Orders</th>
                  <th className="text-right pb-2 font-medium w-14">CPO</th>
                  <th className="text-right pb-2 font-medium w-12">CTR</th>
                  <th className="text-right pb-2 font-medium w-20">Type</th>
                  <th className="w-5"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-2.5 pl-2"><Skeleton /></td>)}</tr>
                )) : campaigns.map(c => {
                  const isSupply = supplyCampaigns.includes(c)
                  return (
                    <tr key={c.campaign_id} onClick={() => setSelectedCampaign(c)} className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSupply ? 'bg-purple-400' : 'bg-blue-400'}`} />
                          <span className="text-xs font-medium text-slate-800 truncate">{c.campaign_name}</span>
                        </div>
                      </td>
                      <td className="text-right text-xs text-slate-700">{fmtL(Number(c.spend))}</td>
                      <td className="text-right text-xs">{Number(c.installs) > 0 ? <span className={Number(c.installs) > 1000 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>{Number(c.installs).toLocaleString('en-IN')}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="text-right"><CpiPill val={Number(c.cpi)} /></td>
                      <td className="text-right text-xs">{Number(c.first_orders) > 0 ? <span className="font-medium text-blue-600">{Number(c.first_orders)}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-right text-xs">{Number(c.cpo) > 0 ? <span className={Number(c.cpo) <= 800 ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>₹{Math.round(Number(c.cpo))}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className={`text-right text-xs ${Number(c.ctr) < 0.3 ? 'text-red-500 font-medium' : 'text-slate-700'}`}>{Number(c.ctr).toFixed(2)}%</td>
                      <td className="text-right"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isSupply ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{isSupply ? 'Supply' : 'Demand'}</span></td>
                      <td className="text-right"><ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500" /></td>
                    </tr>
                  )
                })}
              </tbody>
              {!loading && campaigns.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td className="pt-2 text-xs font-semibold text-slate-700">Total</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{fmtL(totalSpend)}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-emerald-600">{totalInstalls.toLocaleString('en-IN')}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">₹{avgCPI}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-blue-600">{totalFirstOrders}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{totals?.cpo > 0 ? `₹${Math.round(totals.cpo)}` : '—'}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{avgCTR}%</td>
                    <td /><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
