'use client'

import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, RefreshCw, ChevronDown, Bell } from 'lucide-react'

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
  leads: number
  impressions: number
  ctr: number
  cpi: number
}

interface MetricsData {
  campaigns: Campaign[]
  daily: DailyRow[]
}

// ─── Date ranges ─────────────────────────────────────────────────────────────

function getDateRange(tag: string): { start: string; end: string; label: string } {
  const today = new Date('2026-06-17') // update to new Date() in production
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const labelFmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  if (tag === 'MTD') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: fmt(start), end: fmt(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
  }
  if (tag === 'Last 7d') {
    const start = new Date(today); start.setDate(today.getDate() - 6)
    return { start: fmt(start), end: fmt(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
  }
  if (tag === 'May') {
    return { start: '2026-05-01', end: '2026-05-31', label: 'May 2026' }
  }
  if (tag === 'Apr') {
    return { start: '2026-04-01', end: '2026-04-30', label: 'April 2026' }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: fmt(start), end: fmt(today), label: `${labelFmt(start)} – ${labelFmt(today)}` }
}

const DATE_RANGE_TAGS = ['MTD', 'Last 7d', 'May', 'Apr']

// ─── Static config ────────────────────────────────────────────────────────────

const SCORE_ITEMS = [
  { label: 'Budget pacing', score: 18, max: 20, color: '#1D9E75' },
  { label: 'CPI vs target', score: 17, max: 20, color: '#1D9E75' },
  { label: 'CTR quality', score: 12, max: 15, color: '#EF9F27' },
  { label: 'Ad strength', score: 11, max: 15, color: '#EF9F27' },
  { label: 'Reach diversity', score: 8, max: 15, color: '#E24B4A' },
  { label: 'Wasted spend', score: 5, max: 15, color: '#E24B4A' },
]

const ALERTS = [
  { severity: 'critical', msg: 'ACI FOCFe CPI ₹49 — 4× above Delivery Partner', time: 'Now · Meta Quick' },
  { severity: 'critical', msg: 'Influencer Boost CTR 0.05% — creative fatigue likely', time: '2 hrs ago' },
  { severity: 'critical', msg: 'Leads WA cost per lead ₹99.7 above ₹80 target', time: '4 hrs ago' },
  { severity: 'warning', msg: '3W Test frequency 2.05 — consider creative refresh', time: 'Yesterday' },
]

// ─── Small components ─────────────────────────────────────────────────────────

function CpiColor({ val }: { val: number }) {
  if (!val || val === 0) return <span className="text-xs text-slate-400">—</span>
  if (val <= 15) return <span className="text-xs font-medium text-emerald-600">₹{Math.round(val)}</span>
  if (val <= 30) return <span className="text-xs font-medium text-amber-600">₹{Math.round(val)}</span>
  return <span className="text-xs font-medium text-red-500">₹{Math.round(val)}</span>
}

function ObjBadge({ obj }: { obj: string }) {
  const styles: Record<string, string> = {
    APP_INSTALLS: 'bg-blue-50 text-blue-800',
    OUTCOME_APP_PROMOTION: 'bg-blue-50 text-blue-800',
    LEAD_GENERATION: 'bg-purple-50 text-purple-800',
    OUTCOME_LEADS: 'bg-purple-50 text-purple-800',
    BRAND_AWARENESS: 'bg-amber-50 text-amber-800',
    REACH: 'bg-amber-50 text-amber-800',
  }
  const labels: Record<string, string> = {
    APP_INSTALLS: 'Installs',
    OUTCOME_APP_PROMOTION: 'Installs',
    LEAD_GENERATION: 'Leads',
    OUTCOME_LEADS: 'Leads',
    BRAND_AWARENESS: 'Awareness',
    REACH: 'Awareness',
  }
  const style = styles[obj] || 'bg-slate-100 text-slate-600'
  const label = labels[obj] || obj
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>{label}</span>
}

function Skeleton() {
  return <div className="animate-pulse bg-slate-100 rounded-md h-4 w-full" />
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [activeMetric, setActiveMetric] = useState<'spend' | 'installs' | 'clicks' | 'ctr' | 'cpi'>('spend')
  const [activeRangeTag, setActiveRangeTag] = useState('MTD')
  const [showDateMenu, setShowDateMenu] = useState(false)
  const [activeAccount, setActiveAccount] = useState('Quick')
  const [lastUpdated, setLastUpdated] = useState('Just now')
  const [chartLoaded, setChartLoaded] = useState(false)
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch data whenever date range changes ──────────────────────────────────
  const fetchMetrics = useCallback(async (tag: string) => {
    setLoading(true)
    setError(null)
    try {
      const range = getDateRange(tag)
      const res = await fetch(`/api/live-metrics?date_start=${range.start}&date_end=${range.end}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json: MetricsData = await res.json()
      setData(json)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError('Failed to load data. Showing last known values.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics(activeRangeTag)
  }, [activeRangeTag, fetchMetrics])

  // ── Load Chart.js once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    script.onload = () => setChartLoaded(true)
    document.head.appendChild(script)
  }, [])

  // ── Render trend chart whenever data or metric changes ─────────────────────
  useEffect(() => {
    if (!chartLoaded || !data?.daily?.length) return
    const W = window as any
    if (!W.Chart) return

    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    const colors = { spend: '#378ADD', installs: '#1D9E75', clicks: '#534AB7', ctr: '#EF9F27', cpi: '#E24B4A' }
    const labels = data.daily.map(d => {
      const date = new Date(d.date)
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    })
    const values = data.daily.map(d => {
      if (activeMetric === 'spend') return Math.round(Number(d.spend))
      if (activeMetric === 'installs') return Math.round(Number(d.installs))
      if (activeMetric === 'clicks') return Math.round(Number(d.clicks))
      if (activeMetric === 'ctr') return Number(Number(d.ctr).toFixed(2))
      if (activeMetric === 'cpi') return Math.round(Number(d.cpi))
      return 0
    })

    const fmtVal = (v: number) => {
      if (activeMetric === 'spend') return '₹' + v.toLocaleString('en-IN')
      if (activeMetric === 'ctr') return v.toFixed(2) + '%'
      if (activeMetric === 'cpi') return '₹' + v
      return v.toLocaleString('en-IN')
    }

    new W.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: colors[activeMetric],
          backgroundColor: colors[activeMetric] + '15',
          borderWidth: 2, fill: true, tension: 0.4,
          pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: colors[activeMetric],
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ' ' + fmtVal(ctx.raw) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => fmtVal(v) } }
        },
        animation: { duration: 300 }
      }
    })
  }, [chartLoaded, data, activeMetric])

  // ── Render donut chart whenever data changes ───────────────────────────────
  useEffect(() => {
    if (!chartLoaded || !data?.campaigns?.length) return
    const W = window as any
    if (!W.Chart) return

    const canvas = document.getElementById('objCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    const installSpend = data.campaigns
      .filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective))
      .reduce((a, c) => a + Number(c.spend), 0)
    const leadSpend = data.campaigns
      .filter(c => ['LEAD_GENERATION', 'OUTCOME_LEADS'].includes(c.objective))
      .reduce((a, c) => a + Number(c.spend), 0)
    const awarenessSpend = data.campaigns
      .filter(c => ['BRAND_AWARENESS', 'REACH'].includes(c.objective))
      .reduce((a, c) => a + Number(c.spend), 0)

    new W.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['App Installs', 'Leads', 'Awareness'],
        datasets: [{ data: [installSpend, leadSpend, awarenessSpend], backgroundColor: ['#378ADD', '#534AB7', '#EF9F27'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: any) => ' ₹' + Math.round(c.raw).toLocaleString('en-IN') } }
        },
        cutout: '70%'
      }
    })
  }, [chartLoaded, data])

  // ── Derived KPIs from live data ────────────────────────────────────────────
  const campaigns = data?.campaigns ?? []
  const daily = data?.daily ?? []

  const totalSpend = campaigns.reduce((a, c) => a + Number(c.spend), 0)
  const totalInstalls = campaigns.reduce((a, c) => a + Number(c.installs), 0)
  const totalClicks = campaigns.reduce((a, c) => a + Number(c.clicks), 0)
  const totalLeads = campaigns.reduce((a, c) => a + Number(c.leads), 0)
  const avgCPI = totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : 0
  const totalImpressions = campaigns.reduce((a, c) => a + Number(c.impressions), 0)
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0'
  const healthScore = SCORE_ITEMS.reduce((a, s) => a + s.score, 0)

  // Trend stats for selected metric
  const metricValues = daily.map(d => Number(d[activeMetric]))
  const avgMetric = metricValues.length ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length : 0
  const peakIdx = metricValues.indexOf(Math.max(...metricValues))
  const lowIdx = metricValues.indexOf(Math.min(...metricValues))
  const fmtMetric = (v: number) => {
    if (activeMetric === 'spend') return '₹' + Math.round(v).toLocaleString('en-IN')
    if (activeMetric === 'ctr') return v.toFixed(2) + '%'
    if (activeMetric === 'cpi') return '₹' + Math.round(v)
    return Math.round(v).toLocaleString('en-IN')
  }
  const peakLabel = daily[peakIdx] ? `${fmtMetric(metricValues[peakIdx])} (${new Date(daily[peakIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'
  const lowLabel = daily[lowIdx] ? `${fmtMetric(metricValues[lowIdx])} (${new Date(daily[lowIdx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : '—'

  const range = getDateRange(activeRangeTag)

  // Objective breakdown percentages
  const installSpend = campaigns.filter(c => ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const leadSpend = campaigns.filter(c => ['LEAD_GENERATION', 'OUTCOME_LEADS'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const awarenessSpend = campaigns.filter(c => ['BRAND_AWARENESS', 'REACH'].includes(c.objective)).reduce((a, c) => a + Number(c.spend), 0)
  const installPct = totalSpend > 0 ? Math.round((installSpend / totalSpend) * 100) : 84
  const leadPct = totalSpend > 0 ? Math.round((leadSpend / totalSpend) * 100) : 14
  const awarenessPct = totalSpend > 0 ? Math.round((awarenessSpend / totalSpend) * 100) : 2

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDateMenu(false)}>

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
          {/* Date range picker */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowDateMenu(!showDateMenu)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50">
              <Calendar size={12} />
              <span>{range.label}</span>
              <ChevronDown size={10} />
            </button>
            {showDateMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-30 w-52">
                <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Select date range</div>
                {DATE_RANGE_TAGS.map(tag => (
                  <button key={tag} onClick={() => { setActiveRangeTag(tag); setShowDateMenu(false) }}
                    className={`block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 ${activeRangeTag === tag ? 'bg-blue-50 text-blue-800' : 'text-slate-700 bg-transparent'}`}>
                    {getDateRange(tag).label} <span className="text-slate-400">({tag})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Live · Meta Quick
          </span>
          <button onClick={() => fetchMetrics(activeRangeTag)} className="p-1.5 rounded-md hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-500">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-800">AK</div>
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* Date context + error bar */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Showing data for <span className="text-slate-700 font-medium">{range.label}</span> · Shiprocket {activeAccount}</span>
          <span>Last updated: {lastUpdated}</span>
        </div>
        {error && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3">
          {[
            {
              label: 'Total spend',
              value: loading ? null : totalSpend >= 100000 ? `₹${(totalSpend / 100000).toFixed(2)}L` : `₹${Math.round(totalSpend / 1000)}K`,
              sub: `of ₹3.5L budget · ${activeRangeTag}`,
              delta: 'On track · 49% paced', trend: 'up'
            },
            {
              label: 'Total installs',
              value: loading ? null : totalInstalls.toLocaleString('en-IN'),
              sub: 'App installs · all campaigns',
              delta: '+12% vs last month', trend: 'up'
            },
            {
              label: 'Cost per install',
              value: loading ? null : `₹${avgCPI}`,
              sub: 'Target: ₹120',
              delta: avgCPI < 120 ? `${Math.round((1 - avgCPI / 120) * 100)}% below target` : `${Math.round((avgCPI / 120 - 1) * 100)}% above target`,
              trend: avgCPI < 120 ? 'up' : 'down'
            },
            {
              label: 'Total clicks',
              value: loading ? null : totalClicks.toLocaleString('en-IN'),
              sub: `Avg CTR: ${avgCTR}%`,
              delta: 'flat vs last week', trend: 'flat'
            },
            {
              label: 'Leads generated',
              value: loading ? null : totalLeads.toString(),
              sub: totalLeads > 0 ? `Cost per lead: ₹${Math.round(leadSpend / totalLeads)}` : 'Cost per lead: —',
              delta: '8% above ₹80 target', trend: 'down'
            },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-xs text-slate-400 mb-1.5">{k.label}</div>
              {k.value === null ? (
                <div className="space-y-1.5 mt-1"><Skeleton /><Skeleton /></div>
              ) : (
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
            {loading ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 animate-pulse">Loading chart data...</div>
            ) : (
              <canvas id="trendCanvas" role="img" aria-label={`Daily ${activeMetric} trend for ${range.label}`} />
            )}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex gap-6">
              <div><div className="text-xs text-slate-400">Avg daily</div><div className="text-sm font-semibold text-slate-700 mt-0.5">{loading ? '—' : fmtMetric(avgMetric)}</div></div>
              <div><div className="text-xs text-slate-400">Peak day</div><div className="text-sm font-semibold text-emerald-600 mt-0.5">{loading ? '—' : peakLabel}</div></div>
              <div><div className="text-xs text-slate-400">Lowest day</div><div className="text-sm font-semibold text-red-500 mt-0.5">{loading ? '—' : lowLabel}</div></div>
            </div>
            <button className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">
              Ask AI to analyse trend ↗
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-5 gap-3">

          {/* Campaign table — 3 cols */}
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2.5"><Skeleton /></td>
                      <td className="py-2.5 pl-2"><Skeleton /></td>
                      <td className="py-2.5 pl-2"><Skeleton /></td>
                      <td className="py-2.5 pl-2"><Skeleton /></td>
                      <td className="py-2.5 pl-2"><Skeleton /></td>
                      <td className="py-2.5 pl-2"><Skeleton /></td>
                    </tr>
                  ))
                ) : campaigns.map(c => (
                  <tr key={c.campaign_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-2.5">
                      <div className="text-xs font-medium text-slate-800 truncate">{c.campaign_name.replace(/SR_Quick_|SR_Main_/i, '')}</div>
                    </td>
                    <td className="text-right text-xs text-slate-700">₹{(Number(c.spend) / 1000).toFixed(1)}K</td>
                    <td className="text-right text-xs">
                      {Number(c.installs) > 0 ? (
                        <span className={Number(c.installs) > 1000 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>
                          {Number(c.installs).toLocaleString('en-IN')}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="text-right"><CpiColor val={Number(c.cpi)} /></td>
                    <td className={`text-right text-xs ${Number(c.ctr) < 0.3 ? 'text-red-500 font-medium' : 'text-slate-700'}`}>{Number(c.ctr).toFixed(2)}%</td>
                    <td className="text-right"><ObjBadge obj={c.objective} /></td>
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
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Right column — 2 cols */}
          <div className="col-span-2 flex flex-col gap-3">

            {/* Health score */}
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

            {/* Alerts */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Bell size={13} className="text-slate-400" />
                  Alerts
                </span>
                <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">3 critical</span>
              </div>
              <div className="space-y-0">
                {ALERTS.map((a, i) => (
                  <div key={i} className="flex gap-2 py-2 border-b border-slate-50 last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div>
                      <div className="text-xs text-slate-700 leading-snug">{a.msg}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spend by objective */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Spend by objective</div>
              <div style={{ position: 'relative', height: '100px' }}>
                {loading ? (
                  <div className="flex items-center justify-center h-full"><Skeleton /></div>
                ) : (
                  <canvas id="objCanvas" role="img" aria-label="Spend by objective breakdown" />
                )}
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
