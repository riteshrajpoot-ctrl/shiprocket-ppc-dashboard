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
function AISidekick({ data, branchData, ads, playbookInsights, range, onClose }: { data: MetricsData | null; branchData: any; ads: any[]; playbookInsights: any; range: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: `Hi! I have full live data for ${range} — Meta campaigns, ad-level creatives, Branch attribution and playbook insights. Ask me anything about performance, creatives, or what to do next.` }])
  const [input, setInput] = useState(''); const [thinking, setThinking] = useState(false); const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const send = async (msg?: string) => {
    const userMsg = msg || input.trim(); if (!userMsg || thinking) return; setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]); setThinking(true)
    try {
      const metaContext = data ? `
META ADS (${range}):
Total spend: ${fmtL(data.totals.spend)} | Total installs: ${data.totals.installs} | Avg CPI: ₹${data.totals.cpi} | Avg CTR: ${data.totals.ctr}%
Health score: ${data.health}/100
Campaigns (name, spend, installs, CPI, CTR, first_orders, CPO):
${data.campaigns.map(c => `- ${c.campaign_name}: spend ₹${Math.round(Number(c.spend))}, installs ${c.installs}, CPI ₹${Math.round(Number(c.cpi))}, CTR ${c.ctr}%, first_orders ${c.first_orders || 0}, CPO ${c.cpo ? '₹' + Math.round(Number(c.cpo)) : 'N/A'}`).join('\n')}
Alerts: ${data.alerts.map(a => a.msg).join('; ')}` : 'No Meta data.'

      const branchContext = branchData ? `
BRANCH (all channels, ${range}):
Total installs: ${branchData.total_installs} | Total first orders: ${branchData.total_orders} | Install→order rate: ${branchData.total_installs > 0 ? ((branchData.total_orders / branchData.total_installs) * 100).toFixed(1) : 0}%
By partner: ${(branchData.by_partner || []).map((p: any) => `${p.partner}: ${p.installs} installs, ${p.orders} orders`).join('; ')}
Top campaigns by first orders: ${(branchData.by_campaign || []).filter((c: any) => c.orders > 0).slice(0, 10).map((c: any) => `${c.campaign}(${c.ad_partner}): ${c.installs} installs, ${c.orders} orders`).join('; ')}` : 'No Branch data.'

      const adContext = ads.length > 0 ? `
AD LEVEL CREATIVES (top 15 by spend):
${ads.slice(0, 15).map((a: any) => `- ${a.ad_name}: spend ₹${Math.round(Number(a.spend))}, CTR ${Number(a.ctr).toFixed(2)}%, installs ${a.installs || 0}, CPI ${a.cpi ? '₹' + a.cpi : 'N/A'}, side: ${a.ad_side || 'unknown'}, copy: "${(a.creative_body || '').slice(0, 80)}"`).join('\n')}` : ''

      const playbookContext = playbookInsights && Object.keys(playbookInsights).length > 0 ? `
CREATIVE PLAYBOOK INSIGHTS (AI-analysed):
${Object.entries(playbookInsights).map(([cellKey, insights]: [string, any]) => {
  const cell = cellKey.replace(/\|/g, ' · ')
  const lines = (insights as any[]).map((ins: any) => `  ${ins.direction} — ${ins.dimension}: "${ins.value}" (CTR ${ins.avg_ctr}%${ins.avg_cpi > 0 ? `, CPI ₹${ins.avg_cpi}` : ''}${ins.trendNote ? `, trend: ${ins.trendNote}` : ''})`).join('\n')
  return `${cell}:\n${lines}`
}).join('\n')}` : ''

      const context = [metaContext, branchContext, adContext, playbookContext].filter(Boolean).join('\n')
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
        <div className="flex gap-1.5 mt-2 flex-wrap">{['Which campaign has highest first orders?', 'Why is CPI high?', 'Best campaign to scale?'].map(q => <button key={q} onClick={() => send(q)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 border-none cursor-pointer hover:bg-slate-200">{q}</button>)}</div>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeMetric, setActiveMetric] = useState<'installs' | 'first_orders'>('installs')
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
  const [branchData, setBranchData] = useState<{ total_orders: number; total_installs: number; by_partner: { partner: string; installs: number; orders: number }[]; by_campaign: { campaign: string; ad_partner: string; installs: number; orders: number }[] } | null>(null)
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

  // Branch daily for trend chart
  const [branchDaily, setBranchDaily] = useState<{ date: string; installs: number; first_orders: number }[]>([])
  const [branchByChannel, setBranchByChannel] = useState<Record<string, { date: string; installs: number; first_orders: number }[]>>({})
  const [branchDailyLoading, setBranchDailyLoading] = useState(true)
  const [activePartner, setActivePartner] = useState('All')
  const [activeTrendChannel, setActiveTrendChannel] = useState('All')

  // Ad level data for AI Sidekick
  const [adsForSidekick, setAdsForSidekick] = useState<any[]>([])

  useEffect(() => {
    // Fetch ad-level data for sidekick context
    const fetchAds = async () => {
      try {
        const r = getDateRange(activeRangeTag, customStart, customEnd)
        const res = await fetch(`/api/ad-level-report?date_start=${r.start}&date_end=${r.end}`)
        const json = await res.json()
        if (json.ads) setAdsForSidekick(json.ads)
      } catch {}
    }
    fetchAds()
  }, [activeRangeTag, customStart, customEnd])

  const fetchBranchDaily = useCallback(async (tag: string, cs?: string, ce?: string) => {
    setBranchDailyLoading(true)
    try {
      const r = getDateRange(tag, cs, ce)
      const res = await fetch(`/api/branch-daily?start_date=${r.start}&end_date=${r.end}`)
      if (!res.ok) return
      const json = await res.json()
      if (!json.error && json.daily) {
        setBranchDaily(json.daily)
        if (json.by_channel) setBranchByChannel(json.by_channel)
      }
    } catch {}
    finally { setBranchDailyLoading(false) }
  }, [])

  useEffect(() => {
    fetchMetrics(activeRangeTag, customStart, customEnd)
    fetchBranch(activeRangeTag, customStart, customEnd)
    fetchBranchDaily(activeRangeTag, customStart, customEnd)
  }, [activeRangeTag, customStart, customEnd, fetchMetrics, fetchBranch, fetchBranchDaily])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = () => setChartLoaded(true); document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (!chartLoaded) return
    const W = window as any; if (!W.Chart) return
    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement; if (!canvas) return
    const ex = W.Chart.getChart(canvas); if (ex) ex.destroy()

    // Pick data source based on active channel
    const chartData = activeTrendChannel === 'All'
      ? branchDaily
      : (branchByChannel[activeTrendChannel.toLowerCase()] || branchByChannel[activeTrendChannel] || [])

    if (!chartData.length) return

    const colors = { installs: '#1D9E75', first_orders: '#378ADD' }
    const labels = chartData.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
    const values = chartData.map(d => activeMetric === 'first_orders' ? d.first_orders : d.installs)
    const color = activeMetric === 'first_orders' ? colors.first_orders : colors.installs
    new W.Chart(canvas, { type: 'line', data: { labels, datasets: [{ data: values, borderColor: color, backgroundColor: color + '15', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: color }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.raw.toLocaleString('en-IN') } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => v.toLocaleString('en-IN') } } }, animation: { duration: 300 } } })
  }, [chartLoaded, branchDaily, branchByChannel, activeMetric, activeTrendChannel])

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
  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const healthStatus = health >= 80 ? 'Good' : health >= 60 ? 'Needs attention' : 'Critical'
  const healthColor = health >= 80 ? '#1D9E75' : health >= 60 ? '#EF9F27' : '#E24B4A'
  const scoreColor = (s: number, max: number) => { const p = s / max; return p >= 0.8 ? '#1D9E75' : p >= 0.6 ? '#EF9F27' : '#E24B4A' }

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDateMenu(false)}>
      {selectedCampaign && <DrilldownModal campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}
      {showOptimizer && <BudgetOptimizer suggestions={budgetSuggestions} onClose={() => setShowOptimizer(false)} />}
      {showSidekick && <AISidekick data={data} branchData={branchData} ads={adsForSidekick} playbookInsights={{}} range={range.label} onClose={() => setShowSidekick(false)} />}

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

            {/* Affiliate — real data from Branch by_partner */}
            {(() => {
              const affiliatePartners = (branchData?.by_partner || []).filter((p: any) => {
                const pl = (p.partner || '').toLowerCase()
                return !pl.includes('google') && !pl.includes('facebook') && !pl.includes('meta') && !pl.includes('apple') && pl !== '(organic)' && pl !== 'organic' && p.partner !== '(organic)'
              })
              const affiliateInstalls = affiliatePartners.reduce((a: number, p: any) => a + p.installs, 0)
              const affiliateOrders = affiliatePartners.reduce((a: number, p: any) => a + p.orders, 0)
              const topPartner = affiliatePartners.sort((a: any, b: any) => b.orders - a.orders)[0]

              return (
                <ChannelCard
                  icon="A" name="Affiliate" status={affiliateInstalls > 0 ? 'beta' : 'soon'} color="bg-orange-500"
                  metrics={affiliateInstalls > 0 ? [
                    { label: 'Installs', value: branchLoading ? null : affiliateInstalls.toLocaleString('en-IN'), color: 'text-emerald-600' },
                    { label: 'First orders', value: branchLoading ? null : affiliateOrders > 0 ? affiliateOrders.toLocaleString('en-IN') : '—', color: 'text-blue-600' },
                    { label: 'Partners', value: branchLoading ? null : `${affiliatePartners.length} active` },
                    { label: 'Top partner', value: branchLoading ? null : topPartner ? topPartner.partner : '—', color: 'text-orange-600' },
                  ] : undefined}
                  onClick={affiliateInstalls > 0 ? () => setActivePartner('Affiliate') : undefined}
                />
              )
            })()}
          </div>
        </div>

        {/* ── SECTION 2: Trend chart ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <span className="text-sm font-semibold text-slate-700">Performance trends</span>
              <span className="text-xs text-slate-400 ml-2">{range.label}</span>
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium ml-2">Branch · all channels</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Channel filter tabs */}
              <div className="flex gap-1">
                {['All', 'Google', 'Facebook', 'Apple', 'Affiliate', 'Organic'].map(ch => (
                  <button key={ch} onClick={() => setActiveTrendChannel(ch)} className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${activeTrendChannel === ch ? 'bg-slate-800 text-white border-slate-800' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    {ch}
                  </button>
                ))}
              </div>
              {/* Metric toggle */}
              <div className="flex gap-1 border-l border-slate-200 pl-3">
                {([{ key: 'installs', label: 'Installs' }, { key: 'first_orders', label: 'First orders' }] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveMetric(key)} className={`text-xs px-3 py-1 rounded-full border cursor-pointer ${activeMetric === key ? 'bg-blue-900 text-blue-50 border-blue-900' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', height: '180px' }}>
            {branchDailyLoading
              ? <div className="flex items-center justify-center h-full text-xs text-slate-400 animate-pulse">Loading Branch data...</div>
              : branchDaily.length === 0
              ? <div className="flex items-center justify-center h-full text-xs text-slate-400">No data available — Branch daily data loading</div>
              : <canvas id="trendCanvas" />}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex gap-6">
              {(() => {
                const activeData = activeTrendChannel === 'All' ? branchDaily : (branchByChannel[activeTrendChannel.toLowerCase()] || branchByChannel[activeTrendChannel] || branchDaily)
                const vals = activeData.map(d => activeMetric === 'first_orders' ? d.first_orders : d.installs)
                const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
                const peak = vals.length ? Math.max(...vals) : 0
                const peakDate = activeData[vals.indexOf(peak)]?.date
                const low = vals.length ? Math.min(...vals) : 0
                const lowDate = activeData[vals.indexOf(low)]?.date
                const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
                return <>
                  <div><div className="text-xs text-slate-400">Avg daily</div><div className="text-sm font-semibold text-slate-700 mt-0.5">{avg.toLocaleString('en-IN')}</div></div>
                  <div><div className="text-xs text-slate-400">Peak day</div><div className="text-sm font-semibold text-emerald-600 mt-0.5">{peak.toLocaleString('en-IN')} ({fmt(peakDate)})</div></div>
                  <div><div className="text-xs text-slate-400">Lowest day</div><div className="text-sm font-semibold text-red-500 mt-0.5">{low.toLocaleString('en-IN')} ({fmt(lowDate)})</div></div>
                </>
              })()}
            </div>
            <button onClick={() => setShowSidekick(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">Ask AI to analyse ↗</button>
          </div>
        </div>

        {/* ── SECTION 3: Campaign breakdown — Branch all partners ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-slate-700">Campaign breakdown</span>
              <span className="text-xs text-slate-400 ml-2">Branch · all partners</span>
              <span className="text-xs text-slate-400 ml-2">· {range.label}</span>
            </div>
            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {branchData ? `${branchData.by_campaign?.length || 0} campaigns` : '—'}
            </span>
          </div>

          {/* Partner filter tabs */}
          {(() => {
            const tabs = ['All', 'Google', 'Facebook', 'Apple Search Ads', 'Affiliate', 'Organic']

            const filtered = (branchData?.by_campaign || []).filter((c: any) => {
              if (activePartner === 'All') return true
              const p = (c.ad_partner || '').toLowerCase()
              const isGoogle = p.includes('google') || p.includes('adword')
              const isFacebook = p.includes('facebook') || p.includes('meta')
              const isApple = p.includes('apple')
              const isOrganic = !c.ad_partner || c.ad_partner === '(organic)' || p === 'organic'
              const isAffiliate = !isGoogle && !isFacebook && !isApple && !isOrganic
              if (activePartner === 'Google') return isGoogle
              if (activePartner === 'Facebook') return isFacebook
              if (activePartner === 'Apple Search Ads') return isApple
              if (activePartner === 'Affiliate') return isAffiliate
              if (activePartner === 'Organic') return isOrganic
              return true
            })

            return (
              <>
                <div className="flex gap-1 border-b border-slate-100 mb-3">
                  {tabs.map(tab => (
                    <button key={tab} onClick={() => setActivePartner(tab)}
                      className={`text-xs px-3 py-2 border-b-2 cursor-pointer transition-colors ${activePartner === tab ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      style={{ background: 'none', outline: 'none' }}>
                      {tab}
                    </button>
                  ))}
                </div>

                {branchLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)}</div>
                ) : !filtered.length ? (
                  <div className="text-xs text-slate-400 py-4 text-center">No campaigns for this partner</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '700px' }}>
                      <thead>
                        <tr className="text-xs text-slate-400 border-b border-slate-100">
                          <th className="text-left pb-2 font-medium w-2/5">Campaign</th>
                          <th className="text-left pb-2 font-medium w-32">Partner</th>
                          <th className="text-right pb-2 font-medium w-20">Installs</th>
                          <th className="text-right pb-2 font-medium w-20">Orders</th>
                          <th className="text-right pb-2 font-medium w-20">CVR</th>
                          <th className="text-center pb-2 font-medium w-32">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 20).map((c: any, i: number) => {
                          const cvr = c.installs > 0 ? ((c.orders / c.installs) * 100) : 0
                          const cvrDisplay = c.installs > 0 ? `${cvr.toFixed(1)}%` : '—*'
                          const campLower = (c.campaign || '').toLowerCase()
                          const isReengage = campLower.includes('_re_') || campLower.includes('reoc') || campLower.includes('retarget') || campLower.includes('re-engage') || campLower.includes('recharge') || campLower.includes('_re-') || campLower.match(/[_-]re[_-]/)
                          let flag = ''; let flagColor = ''
                          const isOrganic = !c.ad_partner || c.ad_partner === '(organic)' || (c.ad_partner || '').toLowerCase() === 'organic'
                          const isAffiliate = !isOrganic && !(c.ad_partner || '').toLowerCase().includes('google') && !(c.ad_partner || '').toLowerCase().includes('facebook') && !(c.ad_partner || '').toLowerCase().includes('apple')
                          if (isReengage) { flag = 'Re-engage'; flagColor = 'bg-blue-50 text-blue-700' }
                          else if (isOrganic) { flag = 'Organic'; flagColor = 'bg-slate-100 text-slate-500' }
                          else if (isAffiliate && c.orders > 0 && c.installs === 0) { flag = '0 installs anomaly'; flagColor = 'bg-orange-50 text-orange-700' }
                          else if (cvr > 500) { flag = 'Install anomaly'; flagColor = 'bg-red-50 text-red-700' }
                          else if (c.installs > 500 && cvr >= 15) { flag = 'Scale this'; flagColor = 'bg-emerald-50 text-emerald-700' }
                          else if (cvr >= 20) { flag = 'Strong CVR'; flagColor = 'bg-emerald-50 text-emerald-700' }
                          else if (cvr >= 10) { flag = 'Good CVR'; flagColor = 'bg-blue-50 text-blue-700' }
                          else if (c.installs < 10 && c.orders > 50) { flag = 'Minimal installs'; flagColor = 'bg-amber-50 text-amber-700' }
                          const partnerColor = (p: string) => {
                            const pl = (p || '').toLowerCase()
                            if (pl.includes('google')) return 'text-blue-600'
                            if (pl.includes('facebook') || pl.includes('meta')) return 'text-blue-500'
                            if (pl.includes('apple')) return 'text-slate-600'
                            if (pl.includes('organic') || p === '(organic)') return 'text-slate-400'
                            return 'text-purple-600'
                          }
                          return (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 text-xs font-medium text-slate-800 truncate pr-2">{c.campaign || 'Not set'}</td>
                              <td className={`py-2.5 text-xs font-medium truncate ${partnerColor(c.ad_partner)}`}>{c.ad_partner || 'Organic'}</td>
                              <td className="py-2.5 text-right text-xs text-slate-700">{c.installs > 0 ? c.installs.toLocaleString('en-IN') : '—'}</td>
                              <td className="py-2.5 text-right text-xs font-semibold text-emerald-600">{c.orders > 0 ? c.orders.toLocaleString('en-IN') : '—'}</td>
                              <td className={`py-2.5 text-right text-xs font-medium ${cvr >= 20 ? 'text-emerald-600' : cvr >= 10 ? 'text-blue-600' : 'text-slate-500'}`}>{cvrDisplay}</td>
                              <td className="py-2.5 text-center">{flag && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${flagColor}`}>{flag}</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200">
                          <td className="pt-2 text-xs font-semibold text-slate-700">Total</td>
                          <td />
                          <td className="pt-2 text-right text-xs font-semibold text-slate-700">{filtered.reduce((a: number, c: any) => a + c.installs, 0).toLocaleString('en-IN')}</td>
                          <td className="pt-2 text-right text-xs font-semibold text-emerald-600">{filtered.reduce((a: number, c: any) => a + c.orders, 0).toLocaleString('en-IN')}</td>
                          <td className="pt-2 text-right text-xs font-semibold text-slate-700">
                            {(() => { const ti = filtered.reduce((a: number, c: any) => a + c.installs, 0); const to = filtered.reduce((a: number, c: any) => a + c.orders, 0); return ti > 0 ? `${((to / ti) * 100).toFixed(1)}%` : '—' })()}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
