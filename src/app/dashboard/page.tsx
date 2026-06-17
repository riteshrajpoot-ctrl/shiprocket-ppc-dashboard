'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, RefreshCw, ChevronDown, Bell, X, Send, Bot, ChevronRight } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  campaign_name: string
  campaign_id: string
  objective: string
  spend: number
  installs: number
  clicks: number
  leads: number
  impressions: number
  cpi: number
  ctr: number
}

interface DailyRow {
  date: string
  spend: number
  installs: number
  clicks: number
  impressions: number
  ctr: number
  cpi: number
}

interface MetricsData {
  campaigns: Campaign[]
  daily: DailyRow[]
  totals?: any
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const labelFmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function getDateRange(tag: string, customStart?: string, customEnd?: string) {
  const today = new Date()
  if (tag === 'Custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd, label: `${labelFmt(new Date(customStart))} – ${labelFmt(new Date(customEnd))}` }
  }
  if (tag === 'MTD') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: fmtDate(start), end: fmtDate(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
  }
  if (tag === 'Last 7d') {
    const start = new Date(today); start.setDate(today.getDate() - 6)
    return { start: fmtDate(start), end: fmtDate(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
  }
  if (tag === 'May') return { start: '2026-05-01', end: '2026-05-31', label: 'May 2026' }
  if (tag === 'Apr') return { start: '2026-04-01', end: '2026-04-30', label: 'April 2026' }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: fmtDate(start), end: fmtDate(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
}

const DATE_RANGE_TAGS = ['MTD', 'Last 7d', 'May', 'Apr', 'Custom']

// ─── Static config ────────────────────────────────────────────────────────────

const SCORE_ITEMS = [
  { label: 'Budget pacing', score: 18, max: 20, color: '#1D9E75' },
  { label: 'CPI vs target', score: 17, max: 20, color: '#1D9E75' },
  { label: 'CTR quality', score: 12, max: 15, color: '#EF9F27' },
  { label: 'Ad strength', score: 11, max: 15, color: '#EF9F27' },
  { label: 'Reach diversity', score: 8, max: 15, color: '#E24B4A' },
  { label: 'Wasted spend', score: 5, max: 15, color: '#E24B4A' },
]

// ─── Small components ─────────────────────────────────────────────────────────

function CpiColor({ val }: { val: number }) {
  if (!val || val === 0) return <span className="text-xs text-slate-400">—</span>
  if (val <= 15) return <span className="text-xs font-medium text-emerald-600">₹{Math.round(val)}</span>
  if (val <= 30) return <span className="text-xs font-medium text-amber-600">₹{Math.round(val)}</span>
  return <span className="text-xs font-medium text-red-500">₹{Math.round(val)}</span>
}

function ObjBadge({ obj }: { obj: string }) {
  const map: Record<string, [string, string]> = {
    APP_INSTALLS: ['bg-blue-50 text-blue-800', 'Installs'],
    OUTCOME_APP_PROMOTION: ['bg-blue-50 text-blue-800', 'Installs'],
    OUTCOME_LEADS: ['bg-purple-50 text-purple-800', 'Leads'],
    LEAD_GENERATION: ['bg-purple-50 text-purple-800', 'Leads'],
    OUTCOME_AWARENESS: ['bg-amber-50 text-amber-800', 'Awareness'],
    BRAND_AWARENESS: ['bg-amber-50 text-amber-800', 'Awareness'],
    REACH: ['bg-amber-50 text-amber-800', 'Awareness'],
  }
  const [style, label] = map[obj] || ['bg-slate-100 text-slate-600', obj]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>{label}</span>
}

function Skeleton() {
  return <div className="animate-pulse bg-slate-100 rounded-md h-4 w-full" />
}

// ─── Campaign Drilldown Modal ─────────────────────────────────────────────────

function DrilldownModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-lg mx-4 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-800">{campaign.campaign_name}</div>
            <ObjBadge obj={campaign.objective} />
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total spend', value: `₹${(Number(campaign.spend) / 1000).toFixed(1)}K` },
            { label: 'Installs', value: Number(campaign.installs) > 0 ? Number(campaign.installs).toLocaleString('en-IN') : '—' },
            { label: 'CPI', value: Number(campaign.cpi) > 0 ? `₹${Math.round(Number(campaign.cpi))}` : '—' },
            { label: 'Clicks', value: Number(campaign.clicks).toLocaleString('en-IN') },
            { label: 'Impressions', value: (Number(campaign.impressions) / 1000).toFixed(1) + 'K' },
            { label: 'CTR', value: Number(campaign.ctr).toFixed(2) + '%' },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">{m.label}</div>
              <div className="text-base font-semibold text-slate-800">{m.value}</div>
            </div>
          ))}
        </div>

        {Number(campaign.leads) > 0 && (
          <div className="bg-purple-50 rounded-xl p-3 mb-4">
            <div className="text-xs text-purple-600 mb-1">Leads generated</div>
            <div className="text-base font-semibold text-purple-800">{Number(campaign.leads)} leads · ₹{Math.round(Number(campaign.spend) / Number(campaign.leads))} CPL</div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-400 mb-2">Performance signals</div>
          <div className="space-y-1.5">
            {Number(campaign.ctr) < 0.5 && <div className="text-xs text-red-600 flex items-center gap-1.5">⚠ Low CTR — consider refreshing creatives</div>}
            {Number(campaign.cpi) > 50 && <div className="text-xs text-red-600 flex items-center gap-1.5">⚠ High CPI — review audience targeting</div>}
            {Number(campaign.cpi) > 0 && Number(campaign.cpi) <= 15 && <div className="text-xs text-emerald-600 flex items-center gap-1.5">✓ Excellent CPI — consider scaling budget</div>}
            {Number(campaign.ctr) >= 1.2 && <div className="text-xs text-emerald-600 flex items-center gap-1.5">✓ Strong CTR — creative is resonating</div>}
            {Number(campaign.installs) === 0 && campaign.objective !== 'OUTCOME_AWARENESS' && <div className="text-xs text-amber-600 flex items-center gap-1.5">⚠ No installs tracked — check pixel setup</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AI Sidekick ──────────────────────────────────────────────────────────────

function AISidekick({ data, range, onClose }: { data: MetricsData | null; range: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Hi! I'm your PPC Sidekick. I have live data for ${range}. Ask me anything — "Why is CPI high?", "Which campaign should I pause?", "How's budget pacing?"` }
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || thinking) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setThinking(true)

    try {
      const context = data ? `
Current period: ${range}
Total spend: ₹${(data.campaigns.reduce((a, c) => a + Number(c.spend), 0) / 100000).toFixed(2)}L
Total installs: ${data.campaigns.reduce((a, c) => a + Number(c.installs), 0).toLocaleString('en-IN')}
Avg CPI: ₹${data.totals?.cpi || 0}
Avg CTR: ${data.totals?.ctr || 0}%
Campaigns: ${data.campaigns.map(c => `${c.campaign_name} (spend: ₹${Math.round(Number(c.spend))}, installs: ${c.installs}, CPI: ₹${Math.round(Number(c.cpi))}, CTR: ${Number(c.ctr).toFixed(2)}%)`).join('; ')}
` : 'No data loaded yet.'

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context, history: messages.slice(-6) })
      })
      const json = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: json.reply || 'Sorry, could not get a response.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col" style={{ height: '420px' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center">
            <Bot size={12} className="text-blue-100" />
          </div>
          <span className="text-sm font-semibold text-slate-800">PPC Sidekick</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-400">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-xs rounded-xl px-3 py-2 max-w-[85%] leading-relaxed ${
              m.role === 'user'
                ? 'bg-blue-900 text-blue-50'
                : 'bg-slate-100 text-slate-700'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="text-xs rounded-xl px-3 py-2 bg-slate-100 text-slate-400 animate-pulse">Thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about your campaigns..."
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-300 focus:bg-white"
          />
          <button onClick={send} disabled={thinking || !input.trim()}
            className="p-2 rounded-xl bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40">
            <Send size={12} />
          </button>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {['Why is CPI high?', 'Best campaign?', 'Budget pacing?'].map(q => (
            <button key={q} onClick={() => { setInput(q); }}
              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 border-none cursor-pointer hover:bg-slate-200">
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

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

  const range = getDateRange(activeRangeTag, customStart, customEnd)

  const fetchMetrics = useCallback(async (tag: string, cs?: string, ce?: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = getDateRange(tag, cs, ce)
      const res = await fetch(`/api/live-metrics?date_start=${r.start}&date_end=${r.end}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e: any) {
      setError('Failed to load data. ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics(activeRangeTag, customStart, customEnd)
  }, [activeRangeTag, customStart, customEnd, fetchMetrics])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    script.onload = () => setChartLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!chartLoaded || !data?.daily?.length) return
    const W = window as any
    if (!W.Chart) return
    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    const colors = { spend: '#378ADD', installs: '#1D9E75', clicks: '#534AB7', ctr: '#EF9F27', cpi: '#E24B4A' }
    const labels = data.daily.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
    const values = data.daily.map(d => {
      const v = d[activeMetric]
      return activeMetric === 'ctr' ? Number(Number(v).toFixed(2)) : Math.round(Number(v))
    })
    const fmtV = (v: number) => activeMetric === 'spend' ? '₹' + v.toLocaleString('en-IN') : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + v : v.toLocaleString('en-IN')

    new W.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ data: values, borderColor: colors[activeMetric], backgroundColor: colors[activeMetric] + '15', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: colors[activeMetric] }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' ' + fmtV(ctx.raw) } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => fmtV(v) } }
        },
        animation: { duration: 300 }
      }
    })
  }, [chartLoaded, data, activeMetric])

  useEffect(() => {
    if (!chartLoaded || !data?.campaigns?.length) return
    const W = window as any
    if (!W.Chart) return
    const canvas = document.getElementById('objCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    const installSpend = data.campaigns.filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
    const leadSpend = data.campaigns.filter(c => ['OUTCOME_LEADS', 'LEAD_GENERATION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
    const awarenessSpend = data.campaigns.filter(c => ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)

    new W.Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Installs', 'Leads', 'Awareness'], datasets: [{ data: [installSpend, leadSpend, awarenessSpend], backgroundColor: ['#378ADD', '#534AB7', '#EF9F27'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ' ₹' + Math.round(c.raw).toLocaleString('en-IN') } } }, cutout: '70%' }
    })
  }, [chartLoaded, data])

  const campaigns = data?.campaigns ?? []
  const daily = data?.daily ?? []
  const totalSpend = campaigns.reduce((a, c) => a + Number(c.spend), 0)
  const totalInstalls = campaigns.reduce((a, c) => a + Number(c.installs), 0)
  const totalClicks = campaigns.reduce((a, c) => a + Number(c.clicks), 0)
  const totalLeads = campaigns.reduce((a, c) => a + Number(c.leads), 0)
  const totalImpressions = campaigns.reduce((a, c) => a + Number(c.impressions), 0)
  const avgCPI = totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : 0
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0'
  const healthScore = SCORE_ITEMS.reduce((a, s) => a + s.score, 0)
  const installSpend = campaigns.filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const leadSpend = campaigns.filter(c => ['OUTCOME_LEADS', 'LEAD_GENERATION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const awarenessSpend = campaigns.filter(c => ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const installPct = totalSpend > 0 ? Math.round((installSpend / totalSpend) * 100) : 0
  const leadPct = totalSpend > 0 ? Math.round((leadSpend / totalSpend) * 100) : 0
  const awarenessPct = totalSpend > 0 ? Math.round((awarenessSpend / totalSpend) * 100) : 0

  const metricValues = daily.map(d => Number(d[activeMetric]))
  const avgMetric = metricValues.length ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length : 0
  const peakIdx = metricValues.length ? metricValues.indexOf(Math.max(...metricValues)) : -1
  const lowIdx = metricValues.length ? metricValues.indexOf(Math.min(...metricValues)) : -1
  const fmtMetric = (v: number) => activeMetric === 'spend' ? '₹' + Math.round(v).toLocaleString('en-IN') : activeMetric === 'ctr' ? v.toFixed(2) + '%' : activeMetric === 'cpi' ? '₹' + Math.round(v) : Math.round(v).toLocaleString('en-IN')
  const peakLabel = daily[peakIdx] ? `${fmtMetric(metricValues[peakIdx])} (${new Date(daily[peakIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'
  const lowLabel = daily[lowIdx] ? `${fmtMetric(metricValues[lowIdx])} (${new Date(daily[lowIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => { setShowDateMenu(false) }}>

      {/* Drilldown modal */}
      {selectedCampaign && <DrilldownModal campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}

      {/* AI Sidekick */}
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
          {/* Date picker */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDateMenu(!showDateMenu)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50">
              <Calendar size={12} />
              <span>{range.label}</span>
              <ChevronDown size={10} />
            </button>
            {showDateMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-30 w-60">
                <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Select date range</div>
                {DATE_RANGE_TAGS.filter(t => t !== 'Custom').map(tag => (
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
                      <div>
                        <div className="text-xs text-slate-400 mb-1">From</div>
                        <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">To</div>
                        <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none" />
                      </div>
                      <button
                        onClick={() => { if (customStart && customEnd) { setActiveRangeTag('Custom'); setShowDateMenu(false) } }}
                        disabled={!customStart || !customEnd}
                        className="w-full text-xs py-1.5 rounded-lg bg-blue-900 text-blue-50 border-none cursor-pointer disabled:opacity-40">
                        Apply range
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Live · Meta Quick
          </span>
          <button onClick={() => fetchMetrics(activeRangeTag, customStart, customEnd)}
            className="p-1.5 rounded-md hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-500">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {/* AI Sidekick toggle */}
          <button onClick={() => setShowSidekick(!showSidekick)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border cursor-pointer ${showSidekick ? 'bg-blue-900 text-blue-50 border-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <Bot size={12} />
            AI Sidekick
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

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total spend', value: loading ? null : totalSpend >= 100000 ? `₹${(totalSpend / 100000).toFixed(2)}L` : `₹${Math.round(totalSpend / 1000)}K`, sub: `of ₹3.5L budget · ${activeRangeTag}`, delta: 'On track · 49% paced', trend: 'up' },
            { label: 'Total installs', value: loading ? null : totalInstalls.toLocaleString('en-IN'), sub: 'App installs · all campaigns', delta: '+12% vs last month', trend: 'up' },
            { label: 'Cost per install', value: loading ? null : `₹${avgCPI}`, sub: 'Target: ₹120', delta: avgCPI < 120 ? `${Math.round((1 - avgCPI / 120) * 100)}% below target` : `${Math.round((avgCPI / 120 - 1) * 100)}% above target`, trend: avgCPI > 0 && avgCPI < 120 ? 'up' : 'down' },
            { label: 'Total clicks', value: loading ? null : totalClicks.toLocaleString('en-IN'), sub: `Avg CTR: ${avgCTR}%`, delta: 'flat vs last week', trend: 'flat' },
            { label: 'Leads generated', value: loading ? null : totalLeads.toString(), sub: totalLeads > 0 ? `Cost per lead: ₹${Math.round(leadSpend / totalLeads)}` : 'Cost per lead: —', delta: '8% above ₹80 target', trend: 'down' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-xs text-slate-400 mb-1.5">{k.label}</div>
              {k.value === null ? <div className="space-y-1.5 mt-1"><Skeleton /><Skeleton /></div> : (
                <>
                  <div className="text-xl font-semibold text-slate-800 leading-none">{k.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
                  <div className={`text-xs mt-1.5 flex items-center gap-1 ${k.trend === 'up' ? 'text-emerald-600' : k.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                    {k.trend === 'up' ? <TrendingUp size={11} /> : k.trend === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
                    {k.delta}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <span className="text-sm font-semibold text-slate-700">Performance trends</span>
              <span className="text-xs text-slate-400 ml-2">{range.label}</span>
            </div>
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
            <button onClick={() => setShowSidekick(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">
              Ask AI to analyse trend ↗
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-5 gap-3">
          {/* Campaign table */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-semibold text-slate-700">Campaign performance</span>
                <span className="text-xs text-slate-400 ml-2">{range.label}</span>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{campaigns.length} campaigns</span>
            </div>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium w-2/5">Campaign</th>
                  <th className="text-right pb-2 font-medium w-16">Spend</th>
                  <th className="text-right pb-2 font-medium w-16">Installs</th>
                  <th className="text-right pb-2 font-medium w-12">CPI</th>
                  <th className="text-right pb-2 font-medium w-12">CTR</th>
                  <th className="text-right pb-2 font-medium w-20">Objective</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 6 }).map((_, j) => <td key={j} className="py-2.5 pl-2"><Skeleton /></td>)}
                  </tr>
                )) : campaigns.map(c => (
                  <tr key={c.campaign_id}
                    onClick={() => setSelectedCampaign(c)}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <td className="py-2.5">
                      <div className="text-xs font-medium text-slate-800 truncate">{c.campaign_name}</div>
                    </td>
                    <td className="text-right text-xs text-slate-700">₹{(Number(c.spend) / 1000).toFixed(1)}K</td>
                    <td className="text-right text-xs">
                      {Number(c.installs) > 0
                        ? <span className={Number(c.installs) > 1000 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>{Number(c.installs).toLocaleString('en-IN')}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="text-right"><CpiColor val={Number(c.cpi)} /></td>
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
                    <td className="pt-2 text-right text-xs font-semibold text-slate-700">{avgCTR}%</td>
                    <td /><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Right column */}
          <div className="col-span-2 flex flex-col gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700">Account health</span>
                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{healthScore}/100 · Needs attention</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center flex-shrink-0">
                  <div className="text-4xl font-semibold text-slate-800 leading-none">{healthScore}</div>
                  <div className="text-xs text-slate-400 mt-1">out of 100</div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {SCORE_ITEMS.map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-24 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.score / s.max) * 100}%`, background: s.color }} />
                      </div>
                      <span className="text-xs font-medium text-slate-700 w-4 text-right">{s.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Bell size={13} className="text-slate-400" />Alerts</span>
                <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">3 critical</span>
              </div>
              {[
                { s: 'critical', msg: 'ACI FOCFe CPI ₹70 — high vs target', time: 'Now' },
                { s: 'critical', msg: 'Influencer Boost CTR 0.05% — creative fatigue', time: '2 hrs ago' },
                { s: 'critical', msg: 'Leads WA CPL ₹96 above ₹80 target', time: '4 hrs ago' },
                { s: 'warning', msg: '3W Test frequency 2.0 — refresh creatives', time: 'Yesterday' },
              ].map((a, i) => (
                <div key={i} className="flex gap-2 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${a.s === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div>
                    <div className="text-xs text-slate-700 leading-snug">{a.msg}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Spend by objective</div>
              <div style={{ position: 'relative', height: '100px' }}>
                {loading ? <div className="flex items-center justify-center h-full"><Skeleton /></div> : <canvas id="objCanvas" />}
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[
                  { color: '#378ADD', label: 'Installs', pct: `${installPct}%` },
                  { color: '#534AB7', label: 'Leads', pct: `${leadPct}%` },
                  { color: '#EF9F27', label: 'Awareness', pct: `${awarenessPct}%` },
                ].map(o => (
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
