'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, RefreshCw, ChevronDown, Bell, X, Send, Bot, ChevronRight, Zap, ArrowUp, ArrowDown, Pause } from 'lucide-react'

interface Campaign {
  campaign_name: string; campaign_id: string; objective: string
  spend: number; installs: number; clicks: number; leads: number
  impressions: number; cpi: number; ctr: number; cpl: number; frequency: number; reach: number; branch_installs: number; first_orders: number; cpo: number; install_to_order_rate: number
}
interface DailyRow { date: string; spend: number; installs: number; clicks: number; impressions: number; ctr: number; cpi: number }
interface Alert { severity: 'critical' | 'warning'; msg: string; time: string; category: string }
interface HealthItem { label: string; score: number; max: number }
interface BudgetSuggestion { campaign_id: string; campaign_name: string; current_spend: number; cpi: number; cpo: number; installs: number; first_orders: number; action: 'scale' | 'maintain' | 'reduce' | 'pause'; suggested_change_pct: number; reason: string }
interface MetricsData {
  campaigns: Campaign[]; daily: DailyRow[]; totals: any
  alerts: Alert[]; health: number; healthBreakdown: HealthItem[]; budgetSuggestions: BudgetSuggestion[]
}
interface ChatMessage { role: 'user' | 'assistant'; content: string }

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const labelFmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

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

function CpiColor({ val }: { val: number }) {
  if (!val) return <span className="text-xs text-slate-400">—</span>
  if (val <= 15) return <span className="text-xs font-medium text-emerald-600">₹{Math.round(val)}</span>
  if (val <= 30) return <span className="text-xs font-medium text-amber-600">₹{Math.round(val)}</span>
  return <span className="text-xs font-medium text-red-500">₹{Math.round(val)}</span>
}

function ObjBadge({ obj }: { obj: string }) {
  const map: Record<string, [string, string]> = {
    APP_INSTALLS: ['bg-blue-50 text-blue-800', 'Installs'], OUTCOME_APP_PROMOTION: ['bg-blue-50 text-blue-800', 'Installs'],
    OUTCOME_LEADS: ['bg-purple-50 text-purple-800', 'Leads'], LEAD_GENERATION: ['bg-purple-50 text-purple-800', 'Leads'],
    OUTCOME_AWARENESS: ['bg-amber-50 text-amber-800', 'Awareness'], BRAND_AWARENESS: ['bg-amber-50 text-amber-800', 'Awareness'],
  }
  const [style, label] = map[obj] || ['bg-slate-100 text-slate-600', obj]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>{label}</span>
}

function Skeleton() { return <div className="animate-pulse bg-slate-100 rounded-md h-4 w-full" /> }

// ─── Drilldown Modal ──────────────────────────────────────────────────────────
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
            { label: 'Total spend', value: `₹${(Number(campaign.spend) / 1000).toFixed(1)}K` },
            { label: 'Installs', value: Number(campaign.installs) > 0 ? Number(campaign.installs).toLocaleString('en-IN') : '—' },
            { label: 'CPI', value: Number(campaign.cpi) > 0 ? `₹${Math.round(Number(campaign.cpi))}` : '—' },
            { label: 'Clicks', value: Number(campaign.clicks).toLocaleString('en-IN') },
            { label: 'Impressions', value: (Number(campaign.impressions) / 1000).toFixed(1) + 'K' },
            { label: 'CTR', value: Number(campaign.ctr).toFixed(2) + '%' },
            { label: 'Frequency', value: Number(campaign.frequency).toFixed(2) },
            { label: 'Reach', value: (Number(campaign.reach) / 1000).toFixed(1) + 'K' },
            { label: 'Leads', value: Number(campaign.leads) > 0 ? `${campaign.leads} (₹${Math.round(Number(campaign.cpl))} CPL)` : '—' },
            { label: 'Branch installs', value: Number(campaign.branch_installs) > 0 ? Number(campaign.branch_installs).toLocaleString('en-IN') : '—' },
            { label: 'First orders', value: Number(campaign.first_orders) > 0 ? Number(campaign.first_orders).toString() : '—' },
            { label: 'CPO', value: Number(campaign.cpo) > 0 ? `₹${Math.round(Number(campaign.cpo))}` : '—' },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">{m.label}</div>
              <div className="text-sm font-semibold text-slate-800">{m.value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-400 mb-2">Performance signals</div>
          <div className="space-y-1.5">
            {Number(campaign.ctr) < 0.5 && <div className="text-xs text-red-600">⚠ Low CTR — consider refreshing creatives</div>}
            {Number(campaign.cpi) > 50 && <div className="text-xs text-red-600">⚠ High CPI ₹{Math.round(Number(campaign.cpi))} — review audience targeting</div>}
            {Number(campaign.frequency) > 2.5 && <div className="text-xs text-amber-600">⚠ High frequency {Number(campaign.frequency).toFixed(1)} — creative fatigue likely</div>}
            {Number(campaign.cpi) > 0 && Number(campaign.cpi) <= 15 && <div className="text-xs text-emerald-600">✓ Excellent CPI — consider scaling budget</div>}
            {Number(campaign.ctr) >= 1.2 && <div className="text-xs text-emerald-600">✓ Strong CTR — creative is resonating</div>}
            {Number(campaign.installs) === 0 && !['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(campaign.objective) && <div className="text-xs text-amber-600">⚠ No installs tracked — check pixel setup</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Budget Optimizer ─────────────────────────────────────────────────────────
function BudgetOptimizer({ suggestions, onClose }: { suggestions: BudgetSuggestion[]; onClose: () => void }) {
  const [applying, setApplying] = useState<string | null>(null)
  const [applied, setApplied] = useState<string[]>([])

  const actionConfig = {
    scale: { icon: <ArrowUp size={12} />, color: 'text-emerald-700 bg-emerald-50', label: 'Scale +20%' },
    maintain: { icon: <Minus size={12} />, color: 'text-slate-600 bg-slate-100', label: 'Maintain' },
    reduce: { icon: <ArrowDown size={12} />, color: 'text-amber-700 bg-amber-50', label: 'Reduce 30%' },
    pause: { icon: <Pause size={12} />, color: 'text-red-700 bg-red-50', label: 'Pause' },
  }

  const handleApply = async (s: BudgetSuggestion) => {
    if (s.action === 'maintain') return
    setApplying(s.campaign_id)
    await new Promise(r => setTimeout(r, 1500))
    setApplied(prev => [...prev, s.campaign_id])
    setApplying(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-2xl mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Zap size={14} className="text-amber-500" />Budget optimizer</div>
            <div className="text-xs text-slate-400 mt-0.5">AI-recommended budget changes based on CPI performance</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {suggestions.map(s => {
            const cfg = actionConfig[s.action]
            const isApplied = applied.includes(s.campaign_id)
            const isApplying = applying === s.campaign_id
            return (
              <div key={s.campaign_id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-800 truncate">{s.campaign_name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.reason}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-slate-500">₹{(s.current_spend / 1000).toFixed(1)}K · {s.installs} installs · {s.first_orders > 0 ? s.first_orders + " orders" : "no orders yet"}</div>
                  <div className="text-xs font-medium text-slate-700">CPI ₹{Math.round(s.cpi)}</div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>
                  {cfg.icon}{cfg.label}
                </div>
                {s.action !== 'maintain' && (
                  <button
                    onClick={() => handleApply(s)}
                    disabled={isApplied || isApplying}
                    className={`text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer ${isApplied ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-900 text-white hover:bg-blue-800'} disabled:opacity-60`}>
                    {isApplied ? '✓ Applied' : isApplying ? 'Applying...' : 'Apply'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <div className="text-xs text-slate-400">💡 Budget changes are applied via Meta Ads API. Changes take effect within 15 minutes.</div>
        </div>
      </div>
    </div>
  )
}

// ─── AI Sidekick ──────────────────────────────────────────────────────────────
function AISidekick({ data, range, onClose }: { data: MetricsData | null; range: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Hi! I have live data for ${range}. Ask me anything — "Why is CPI high?", "Which campaign should I scale?", "How's budget pacing?"` }
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (msg?: string) => {
    const userMsg = msg || input.trim()
    if (!userMsg || thinking) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setThinking(true)
    try {
      const context = data ? `Period: ${range}
Spend: ₹${(data.totals.spend / 100000).toFixed(2)}L | Installs: ${data.totals.installs} | CPI: ₹${data.totals.cpi} | CTR: ${data.totals.ctr}%
Health score: ${data.health}/100
Campaigns: ${data.campaigns.map(c => `${c.campaign_name}(spend:₹${Math.round(c.spend)},installs:${c.installs},CPI:₹${Math.round(c.cpi)},CTR:${c.ctr}%,freq:${c.frequency})`).join('; ')}
Alerts: ${data.alerts.map(a => a.msg).join('; ')}` : 'No data.'

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context, history: messages.slice(-6) })
      })
      const json = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: json.reply || 'Could not get response.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally { setThinking(false) }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col" style={{ height: '420px' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center"><Bot size={12} className="text-blue-100" /></div>
          <span className="text-sm font-semibold text-slate-800">PPC Sidekick</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-xs rounded-xl px-3 py-2 max-w-[85%] leading-relaxed ${m.role === 'user' ? 'bg-blue-900 text-blue-50' : 'bg-slate-100 text-slate-700'}`}>{m.content}</div>
          </div>
        ))}
        {thinking && <div className="flex justify-start"><div className="text-xs rounded-xl px-3 py-2 bg-slate-100 text-slate-400 animate-pulse">Thinking...</div></div>}
        <div ref={bottomRef} />
      </div>
      <div className="px-3 pb-3">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about your campaigns..."
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-300 focus:bg-white" />
          <button onClick={() => send()} disabled={thinking || !input.trim()} className="p-2 rounded-xl bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40"><Send size={12} /></button>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {['Why is CPI high?', 'Best campaign?', 'Scale budget?'].map(q => (
            <button key={q} onClick={() => send(q)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 border-none cursor-pointer hover:bg-slate-200">{q}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeMetric, setActiveMetric] = useState<'spend' | 'installs' | 'clicks' | 'ctr' | 'cpi'>('spend')
  const [activeRangeTag, setActiveRangeTag] = useState('MTD')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showDateMenu, setShowDateMenu] = useState(false)
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [activeAccount, setActiveAccount] = useState('Quick')
  const [lastUpdated, setLastUpdated] = useState('Just now')
  const [chartLoaded, setChartLoaded] = useState(false)
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [showSidekick, setShowSidekick] = useState(false)
  const [showOptimizer, setShowOptimizer] = useState(false)

  const range = getDateRange(activeRangeTag, customStart, customEnd)

  const fetchMetrics = useCallback(async (tag: string, cs?: string, ce?: string) => {
    setLoading(true); setError(null)
    try {
      const r = getDateRange(tag, cs, ce)
      const res = await fetch(`/api/live-metrics?date_start=${r.start}&date_end=${r.end}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e: any) { setError('Failed to load: ' + e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMetrics(activeRangeTag, customStart, customEnd) }, [activeRangeTag, customStart, customEnd, fetchMetrics])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    s.onload = () => setChartLoaded(true)
    document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (!chartLoaded || !data?.daily?.length) return
    const W = window as any; if (!W.Chart) return
    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement; if (!canvas) return
    const ex = W.Chart.getChart(canvas); if (ex) ex.destroy()
    const colors = { spend: '#378ADD', installs: '#1D9E75', clicks: '#534AB7', ctr: '#EF9F27', cpi: '#E24B4A' }
    const labels = data.daily.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
    const values = data.daily.map(d => activeMetric === 'ctr' ? Number(Number(d[activeMetric]).toFixed(2)) : Math.round(Number(d[activeMetric])))
    const fmtV = (v: number) => activeMetric === 'spend' ? '₹' + v.toLocaleString('en-IN') : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + v : v.toLocaleString('en-IN')
    new W.Chart(canvas, { type: 'line', data: { labels, datasets: [{ data: values, borderColor: colors[activeMetric], backgroundColor: colors[activeMetric] + '15', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: colors[activeMetric] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' ' + fmtV(ctx.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => fmtV(v) } } }, animation: { duration: 300 } } })
  }, [chartLoaded, data, activeMetric])

  useEffect(() => {
    if (!chartLoaded || !data?.campaigns?.length) return
    const W = window as any; if (!W.Chart) return
    const canvas = document.getElementById('objCanvas') as HTMLCanvasElement; if (!canvas) return
    const ex = W.Chart.getChart(canvas); if (ex) ex.destroy()
    const iS = data.campaigns.filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
    const lS = data.campaigns.filter(c => ['OUTCOME_LEADS', 'LEAD_GENERATION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
    const aS = data.campaigns.filter(c => ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
    new W.Chart(canvas, { type: 'doughnut', data: { labels: ['Installs', 'Leads', 'Awareness'], datasets: [{ data: [iS, lS, aS], backgroundColor: ['#378ADD', '#534AB7', '#EF9F27'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ' ₹' + Math.round(c.raw).toLocaleString('en-IN') } } }, cutout: '70%' } })
  }, [chartLoaded, data])

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
  const totalLeads = campaigns.reduce((a, c) => a + Number(c.leads), 0)
  const totalImpressions = campaigns.reduce((a, c) => a + Number(c.impressions), 0)
  const avgCPI = totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : 0
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0'
  const leadSpend = campaigns.filter(c => ['OUTCOME_LEADS', 'LEAD_GENERATION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const installSpend = campaigns.filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const awarenessSpend = campaigns.filter(c => ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const installPct = totalSpend > 0 ? Math.round(installSpend / totalSpend * 100) : 0
  const leadPct = totalSpend > 0 ? Math.round(leadSpend / totalSpend * 100) : 0
  const awarenessPct = totalSpend > 0 ? Math.round(awarenessSpend / totalSpend * 100) : 0

  const metricValues = daily.map(d => Number(d[activeMetric]))
  const avgMetric = metricValues.length ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length : 0
  const peakIdx = metricValues.length ? metricValues.indexOf(Math.max(...metricValues)) : -1
  const lowIdx = metricValues.length ? metricValues.indexOf(Math.min(...metricValues)) : -1
  const fmtMetric = (v: number) => activeMetric === 'spend' ? '₹' + Math.round(v).toLocaleString('en-IN') : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + Math.round(v) : Math.round(v).toLocaleString('en-IN')
  const peakLabel = daily[peakIdx] ? `${fmtMetric(metricValues[peakIdx])} (${new Date(daily[peakIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'
  const lowLabel = daily[lowIdx] ? `${fmtMetric(metricValues[lowIdx])} (${new Date(daily[lowIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const healthStatus = health >= 80 ? 'Good' : health >= 60 ? 'Needs attention' : 'Critical'
  const healthBadgeColor = health >= 80 ? 'bg-emerald-50 text-emerald-700' : health >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
  const scoreColor = (s: number, max: number) => { const p = s / max; return p >= 0.8 ? '#1D9E75' : p >= 0.6 ? '#EF9F27' : '#E24B4A' }

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDateMenu(false)}>
      {selectedCampaign && <DrilldownModal campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}
      {showOptimizer && <BudgetOptimizer suggestions={budgetSuggestions} onClose={() => setShowOptimizer(false)} />}
      {showSidekick && <AISidekick data={data} range={range.label} onClose={() => setShowSidekick(false)} />}

      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-4 h-11 flex items-center gap-2 sticky top-0 z-20">
        <div className="w-7 h-7 rounded-lg bg-blue-900 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-100 text-xs font-semibold">SR</span>
        </div>
        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">PPC command center</span>
        <div className="flex gap-1.5 ml-2">
          {['Quick', 'Main', 'All'].map(a => (
            <button key={a} onClick={() => setActiveAccount(a)}
              className={`text-xs px-3 py-1 rounded-full border-none cursor-pointer ${activeAccount === a ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
              {a === 'All' ? 'All accounts' : `Shiprocket ${a}`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDateMenu(!showDateMenu)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50">
              <Calendar size={12} /><span>{range.label}</span><ChevronDown size={10} />
            </button>
            {showDateMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-30 w-60">
                <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Select date range</div>
                {['MTD', 'Last 7d', 'May', 'Apr'].map(tag => (
                  <button key={tag} onClick={() => { setActiveRangeTag(tag); setShowCustomPicker(false); setShowDateMenu(false) }}
                    className={`block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 ${activeRangeTag === tag ? 'bg-blue-50 text-blue-800' : 'text-slate-700 bg-transparent'}`}>
                    {getDateRange(tag).label}
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button onClick={() => setShowCustomPicker(!showCustomPicker)}
                    className="block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 text-slate-700 bg-transparent">
                    Custom range {showCustomPicker ? '▲' : '▼'}
                  </button>
                  {showCustomPicker && (
                    <div className="px-2 pb-2 space-y-2">
                      <div><div className="text-xs text-slate-400 mb-1">From</div><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" /></div>
                      <div><div className="text-xs text-slate-400 mb-1">To</div><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" /></div>
                      <button onClick={() => { if (customStart && customEnd) { setActiveRangeTag('Custom'); setShowDateMenu(false) } }} disabled={!customStart || !customEnd}
                        className="w-full text-xs py-1.5 rounded-lg bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40">Apply range</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>Live · Meta Quick
          </span>
          <button onClick={() => fetchMetrics(activeRangeTag, customStart, customEnd)} className="p-1.5 rounded-md hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-500">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowOptimizer(true)} disabled={budgetSuggestions.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 cursor-pointer hover:bg-amber-100 disabled:opacity-40">
            <Zap size={12} />Budget optimizer
          </button>
          <button onClick={() => setShowSidekick(!showSidekick)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border cursor-pointer ${showSidekick ? 'bg-blue-900 text-blue-50 border-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <Bot size={12} />AI Sidekick
          </button>
          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-800">AK</div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Showing data for <span className="text-slate-700 font-medium">{range.label}</span> · Shiprocket {activeAccount}</span>
          <span>Last updated: {lastUpdated}</span>
        </div>
        {error && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</div>}

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total spend', value: loading ? null : totalSpend >= 100000 ? `₹${(totalSpend / 100000).toFixed(2)}L` : `₹${Math.round(totalSpend / 1000)}K`, sub: `of ₹3.5L budget · ${activeRangeTag}`, delta: 'On track · 49% paced', trend: 'up' },
            { label: 'Total installs', value: loading ? null : totalInstalls.toLocaleString('en-IN'), sub: 'App installs · all campaigns', delta: '+12% vs last month', trend: 'up' },
            { label: 'Cost per install', value: loading ? null : avgCPI > 0 ? `₹${avgCPI}` : '—', sub: 'Target: ₹120', delta: avgCPI > 0 && avgCPI < 120 ? `${Math.round((1 - avgCPI / 120) * 100)}% below target` : avgCPI >= 120 ? `${Math.round((avgCPI / 120 - 1) * 100)}% above target` : '—', trend: avgCPI > 0 && avgCPI < 120 ? 'up' : 'down' },
            { label: 'Total clicks', value: loading ? null : totalClicks.toLocaleString('en-IN'), sub: `Avg CTR: ${avgCTR}%`, delta: 'flat vs last week', trend: 'flat' },
            { label: 'Leads generated', value: loading ? null : totalLeads.toString(), sub: totalLeads > 0 ? `Cost per lead: ₹${Math.round(leadSpend / totalLeads)}` : 'Cost per lead: —', delta: totals.cpl > 80 ? `₹${Math.round(totals.cpl)} CPL · above ₹80 target` : `₹${Math.round(totals.cpl)} CPL · on target`, trend: totals.cpl > 80 ? 'down' : 'up' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-xs text-slate-400 mb-1.5">{k.label}</div>
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

        {/* Trend chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div><span className="text-sm font-semibold text-slate-700">Performance trends</span><span className="text-xs text-slate-400 ml-2">{range.label}</span></div>
            <div className="flex gap-1.5 flex-wrap">
              {(['spend', 'installs', 'clicks', 'ctr', 'cpi'] as const).map(key => (
                <button key={key} onClick={() => setActiveMetric(key)}
                  className={`text-xs px-3 py-1 rounded-full border cursor-pointer ${activeMetric === key ? 'bg-blue-900 text-blue-50 border-blue-900' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', height: '180px' }}>
            {loading ? <div className="flex items-center justify-center h-full text-xs text-slate-400 animate-pulse">Loading chart...</div> : <canvas id="trendCanvas" />}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex gap-6">
              <div><div className="text-xs text-slate-400">Avg daily</div><div className="text-sm font-semibold text-slate-700 mt-0.5">{loading ? '—' : fmtMetric(avgMetric)}</div></div>
              <div><div className="text-xs text-slate-400">Peak day</div><div className="text-sm font-semibold text-emerald-600 mt-0.5">{loading ? '—' : peakLabel}</div></div>
              <div><div className="text-xs text-slate-400">Lowest day</div><div className="text-sm font-semibold text-red-500 mt-0.5">{loading ? '—' : lowLabel}</div></div>
            </div>
            <button onClick={() => setShowSidekick(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">Ask AI to analyse trend ↗</button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-5 gap-3">
          {/* Campaign table */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div><span className="text-sm font-semibold text-slate-700">Campaign performance</span><span className="text-xs text-slate-400 ml-2">{range.label}</span></div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{campaigns.length} campaigns</span>
            </div>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium w-2/5">Campaign</th>
                  <th className="text-right pb-2 font-medium w-16">Spend</th>
                  <th className="text-right pb-2 font-medium w-16">Installs</th>
                  <th className="text-right pb-2 font-medium w-12">CPI</th>
                  <th className="text-right pb-2 font-medium w-14">1st Orders</th>
                  <th className="text-right pb-2 font-medium w-12">CPO</th>
                  <th className="text-right pb-2 font-medium w-10">CTR</th>
                  <th className="text-right pb-2 font-medium w-20">Objective</th>
                  <th className="w-5"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="py-2.5 pl-2"><Skeleton /></td>)}</tr>
                )) : campaigns.map(c => (
                  <tr key={c.campaign_id} onClick={() => setSelectedCampaign(c)} className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <td className="py-2.5"><div className="text-xs font-medium text-slate-800 truncate">{c.campaign_name}</div></td>
                    <td className="text-right text-xs text-slate-700">₹{(Number(c.spend) / 1000).toFixed(1)}K</td>
                    <td className="text-right text-xs">{Number(c.installs) > 0 ? <span className={Number(c.installs) > 1000 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>{Number(c.installs).toLocaleString('en-IN')}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="text-right"><CpiColor val={Number(c.cpi)} /></td>
                    <td className="text-right text-xs">
                      {Number(c.first_orders) > 0
                        ? <span className="font-medium text-emerald-600">{Number(c.first_orders)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-right text-xs">
                      {Number(c.cpo) > 0
                        ? <span className={Number(c.cpo) <= 800 ? 'font-medium text-emerald-600' : Number(c.cpo) <= 1500 ? 'font-medium text-amber-600' : 'font-medium text-red-500'}>₹{Math.round(Number(c.cpo))}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`text-right text-xs ${Number(c.ctr) < 0.3 ? 'text-red-500 font-medium' : 'text-slate-700'}`}>{Number(c.ctr).toFixed(2)}%</td>
                    <td className="text-right"><ObjBadge obj={c.objective} /></td>
                    <td className="text-right"><ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500" /></td>
                  </tr>
                ))}
              </tbody>
              {!loading && campaigns.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td className="pt-2 text-xs font-semibold text-slate-700">Total</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">₹{(totalSpend / 100000).toFixed(2)}L</td>
                    <td className="pt-2 text-right text-xs font-semibold text-emerald-600">{totalInstalls.toLocaleString('en-IN')}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">₹{avgCPI}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-emerald-600">{campaigns.reduce((a,c) => a + Number(c.first_orders), 0)}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{totals?.cpo > 0 ? `₹${Math.round(totals.cpo)}` : '—'}</td>
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{avgCTR}%</td>
                    <td /><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Right column */}
          <div className="col-span-2 flex flex-col gap-3">
            {/* Health score */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700">Account health</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${healthBadgeColor}`}>{loading ? '—' : health}/100 · {healthStatus}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center flex-shrink-0">
                  <div className="text-4xl font-semibold text-slate-800 leading-none">{loading ? '—' : health}</div>
                  <div className="text-xs text-slate-400 mt-1">out of 100</div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {(healthBreakdown.length > 0 ? healthBreakdown : [
                    { label: 'Budget pacing', score: 0, max: 20 }, { label: 'CPI vs target', score: 0, max: 20 },
                    { label: 'CTR quality', score: 0, max: 15 }, { label: 'Ad strength', score: 0, max: 15 },
                    { label: 'Reach diversity', score: 0, max: 15 }, { label: 'Wasted spend', score: 0, max: 15 },
                  ]).map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-24 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(s.score / s.max) * 100}%`, background: scoreColor(s.score, s.max) }} />
                      </div>
                      <span className="text-xs font-medium text-slate-700 w-4 text-right">{s.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell size={13} className="text-slate-400" />Alerts</span>
                {criticalCount > 0 && <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">{criticalCount} critical</span>}
              </div>
              {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} />)}</div> :
                alerts.length === 0 ? <div className="text-xs text-emerald-600 py-2">✓ No active alerts — all campaigns healthy</div> :
                  alerts.map((a, i) => (
                    <div key={i} className="flex gap-2 py-2 border-b border-slate-50 last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div>
                        <div className="text-xs text-slate-700 leading-snug">{a.msg}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                      </div>
                    </div>
                  ))
              }
            </div>

            {/* Spend by objective */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Spend by objective</div>
              <div style={{ position: 'relative', height: '100px' }}>
                {loading ? <div className="flex items-center justify-center h-full"><Skeleton /></div> : <canvas id="objCanvas" />}
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[{ color: '#378ADD', label: 'Installs', pct: `${installPct}%` }, { color: '#534AB7', label: 'Leads', pct: `${leadPct}%` }, { color: '#EF9F27', label: 'Awareness', pct: `${awarenessPct}%` }].map(o => (
                  <div key={o.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: o.color }} />
                    <span className="text-xs text-slate-500">{o.label} <span className="font-medium text-slate-700">{o.pct}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
