'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, RefreshCw, ChevronDown, AlertTriangle, Bell } from 'lucide-react'

const CAMPAIGNS = [
  { name: 'Delivery Partner ACe', short: 'Delivery Partner ACe', date: '20 May 26', spend: 79598, installs: 13072, cpi: 6.1, ctr: 1.29, objective: 'Installs', objColor: 'blue' },
  { name: 'Partner Leads WA', short: 'Partner Leads WA', date: '27 May 26', spend: 23844, installs: 893, cpi: 26.7, ctr: 1.38, objective: 'Leads', objColor: 'purple' },
  { name: 'Meta ACI FOCFe', short: 'Meta ACI FOCFe', date: 'Apr 26', spend: 20723, installs: 422, cpi: 49.1, ctr: 0.76, objective: 'Installs', objColor: 'blue' },
  { name: '3W Test', short: '3W Test', date: '13 May 26', spend: 18211, installs: 496, cpi: 36.7, ctr: 0.56, objective: 'Installs', objColor: 'blue' },
  { name: '3W Lookalike', short: '3W Lookalike', date: '4 Jun 26', spend: 11941, installs: 244, cpi: 48.9, ctr: 0.61, objective: 'Installs', objColor: 'blue' },
  { name: 'Partner 3W Geo', short: 'Partner 3W Geo', date: '9 Jun 26', spend: 11463, installs: 635, cpi: 18.1, ctr: 0.89, objective: 'Installs', objColor: 'blue' },
  { name: 'Partner Heavy Generic', short: 'Partner Heavy', date: '12 Jun 26', spend: 4122, installs: 398, cpi: 10.4, ctr: 1.33, objective: 'Installs', objColor: 'blue' },
  { name: 'Influencer Boost', short: 'Influencer Boost', date: '27 May 26', spend: 2123, installs: 0, cpi: 0, ctr: 0.05, objective: 'Awareness', objColor: 'amber' },
  { name: 'Brand Awareness', short: 'Brand Awareness', date: '27 Apr 26', spend: 1639, installs: 0, cpi: 0, ctr: 0.10, objective: 'Awareness', objColor: 'amber' },
]

const TREND_DATA = {
  spend: {
    data: [9200,7800,8400,9100,10200,9800,10500,11200,10800,11600,12100,11800,13200,14200,13600,12800],
    color: '#378ADD', label: 'Daily spend (₹)',
    fmt: (v: number) => '₹' + Math.round(v).toLocaleString('en-IN'),
    avg: '₹10,812', peak: '₹14,200 (Jun 14)', low: '₹7,800 (Jun 2)'
  },
  installs: {
    data: [820,650,710,780,920,870,950,1100,1020,1180,1240,1180,1380,1520,1400,1230],
    color: '#1D9E75', label: 'Daily installs',
    fmt: (v: number) => Math.round(v).toLocaleString('en-IN'),
    avg: '1,010', peak: '1,520 (Jun 14)', low: '650 (Jun 2)'
  },
  clicks: {
    data: [1900,1600,1750,1900,2200,2100,2300,2500,2400,2700,2900,2750,3100,3400,3200,2900],
    color: '#534AB7', label: 'Daily clicks',
    fmt: (v: number) => Math.round(v).toLocaleString('en-IN'),
    avg: '2,503', peak: '3,400 (Jun 14)', low: '1,600 (Jun 2)'
  },
  ctr: {
    data: [0.72,0.68,0.70,0.75,0.82,0.80,0.85,0.90,0.87,0.92,0.95,0.91,0.98,1.02,0.99,0.94],
    color: '#EF9F27', label: 'CTR (%)',
    fmt: (v: number) => v.toFixed(2) + '%',
    avg: '0.87%', peak: '1.02% (Jun 14)', low: '0.68% (Jun 2)'
  },
  cpi: {
    data: [112,118,115,110,108,109,106,104,105,102,100,101,98,95,97,103],
    color: '#E24B4A', label: 'CPI (₹)',
    fmt: (v: number) => '₹' + Math.round(v),
    avg: '₹105', peak: '₹118 (Jun 2)', low: '₹95 (Jun 14)'
  },
}

const DAYS = ['Jun 1','Jun 2','Jun 3','Jun 4','Jun 5','Jun 6','Jun 7','Jun 8','Jun 9','Jun 10','Jun 11','Jun 12','Jun 13','Jun 14','Jun 15','Jun 16']

const DATE_RANGES = [
  { label: 'Jun 1–16, 2026', tag: 'MTD' },
  { label: 'Jun 10–16, 2026', tag: 'Last 7d' },
  { label: 'May 1–31, 2026', tag: 'May' },
  { label: 'Apr 1–30, 2026', tag: 'Apr' },
]

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

function CpiColor({ val }: { val: number }) {
  if (val === 0) return <span className="text-right text-xs text-slate-400">—</span>
  if (val <= 15) return <span className="text-right text-xs font-medium text-emerald-600">₹{val}</span>
  if (val <= 30) return <span className="text-right text-xs font-medium text-amber-600">₹{val}</span>
  return <span className="text-right text-xs font-medium text-red-500">₹{val}</span>
}

function ObjBadge({ obj }: { obj: string }) {
  const styles: Record<string, string> = {
    Installs: 'bg-blue-50 text-blue-800',
    Leads: 'bg-purple-50 text-purple-800',
    Awareness: 'bg-amber-50 text-amber-800',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[obj] || 'bg-slate-100 text-slate-600'}`}>{obj}</span>
}

export default function Dashboard() {
  const [activeMetric, setActiveMetric] = useState<keyof typeof TREND_DATA>('spend')
  const [dateRange, setDateRange] = useState(DATE_RANGES[0])
  const [showDateMenu, setShowDateMenu] = useState(false)
  const [activeAccount, setActiveAccount] = useState('Quick')
  const [lastUpdated, setLastUpdated] = useState('Just now')
  const [chartLoaded, setChartLoaded] = useState(false)

  const totalSpend = CAMPAIGNS.reduce((a, c) => a + c.spend, 0)
  const totalInstalls = CAMPAIGNS.reduce((a, c) => a + c.installs, 0)
  const avgCPI = Math.round(totalSpend / totalInstalls)
  const totalClicks = 38049
  const totalLeads = 239
  const healthScore = SCORE_ITEMS.reduce((a, s) => a + s.score, 0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    script.onload = () => setChartLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!chartLoaded) return
    const W = window as any
    if (!W.Chart) return

    const canvas = document.getElementById('trendCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    const m = TREND_DATA[activeMetric]
    new W.Chart(canvas, {
      type: 'line',
      data: {
        labels: DAYS,
        datasets: [{
          label: m.label, data: m.data,
          borderColor: m.color, backgroundColor: m.color + '15',
          borderWidth: 2, fill: true, tension: 0.4,
          pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: m.color,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ' ' + m.fmt(ctx.raw) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v: any) => m.fmt(v) } }
        },
        animation: { duration: 400 }
      }
    })
  }, [chartLoaded, activeMetric])

  useEffect(() => {
    if (!chartLoaded) return
    const W = window as any
    if (!W.Chart) return

    const canvas = document.getElementById('objCanvas') as HTMLCanvasElement
    if (!canvas) return
    const existing = W.Chart.getChart(canvas)
    if (existing) existing.destroy()

    new W.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['App Installs', 'Leads', 'Awareness'],
        datasets: [{ data: [145598, 23844, 3762], backgroundColor: ['#378ADD', '#534AB7', '#EF9F27'], borderWidth: 0 }]
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
  }, [chartLoaded])

  const m = TREND_DATA[activeMetric]

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
              <span>{dateRange.label}</span>
              <ChevronDown size={10} />
            </button>
            {showDateMenu && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-none p-1 z-30 w-52">
                <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Select date range</div>
                {DATE_RANGES.map(r => (
                  <button key={r.tag} onClick={() => { setDateRange(r); setShowDateMenu(false) }}
                    className={`block w-full text-left text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer hover:bg-slate-50 ${dateRange.tag === r.tag ? 'bg-blue-50 text-blue-800' : 'text-slate-700 bg-transparent'}`}>
                    {r.label} <span className="text-slate-400">({r.tag})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Live · Meta Quick
          </span>
          <button onClick={() => setLastUpdated('Just now')} className="p-1.5 rounded-md hover:bg-slate-100 border-none bg-transparent cursor-pointer text-slate-500">
            <RefreshCw size={13} />
          </button>
          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-800">AK</div>
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* Date context bar */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Showing data for <span className="text-slate-700 font-medium">{dateRange.label}</span> · Shiprocket {activeAccount}</span>
          <span>Last updated: {lastUpdated}</span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total spend', value: '₹1.73L', sub: `of ₹3.5L budget · ${dateRange.tag}`, delta: 'On track · 49% paced', trend: 'up' },
            { label: 'Total installs', value: totalInstalls.toLocaleString('en-IN'), sub: 'App installs · all campaigns', delta: '+12% vs last month', trend: 'up' },
            { label: 'Cost per install', value: `₹${avgCPI}`, sub: 'Target: ₹120', delta: '11% below target', trend: 'up' },
            { label: 'Total clicks', value: totalClicks.toLocaleString('en-IN'), sub: 'Avg CTR: 0.88%', delta: 'flat vs last week', trend: 'flat' },
            { label: 'Leads generated', value: totalLeads.toString(), sub: 'Cost per lead: ₹99.7', delta: '8% above ₹80 target', trend: 'down' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-xs text-slate-400 mb-1.5">{k.label}</div>
              <div className="text-xl font-semibold text-slate-800 leading-none">{k.value}</div>
              <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
              <div className={`text-xs mt-1.5 flex items-center gap-1 ${k.trend === 'up' ? 'text-emerald-600' : k.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                {k.trend === 'up' ? <TrendingUp size={11} /> : k.trend === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
                {k.delta}
              </div>
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <span className="text-sm font-semibold text-slate-700">Performance trends</span>
              <span className="text-xs text-slate-400 ml-2">{dateRange.label}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(TREND_DATA) as (keyof typeof TREND_DATA)[]).map(key => (
                <button key={key} onClick={() => setActiveMetric(key)}
                  className={`text-xs px-3 py-1 rounded-full border cursor-pointer ${activeMetric === key ? 'bg-blue-900 text-blue-50 border-blue-900' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', height: '180px' }}>
            <canvas id="trendCanvas" role="img" aria-label={`Daily ${activeMetric} trend for ${dateRange.label}`} />
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex gap-6">
              <div><div className="text-xs text-slate-400">Avg daily</div><div className="text-sm font-semibold text-slate-700 mt-0.5">{m.avg}</div></div>
              <div><div className="text-xs text-slate-400">Peak day</div><div className="text-sm font-semibold text-emerald-600 mt-0.5">{m.peak}</div></div>
              <div><div className="text-xs text-slate-400">Lowest day</div><div className="text-sm font-semibold text-red-500 mt-0.5">{m.low}</div></div>
            </div>
            <button
              onClick={() => { const w = window as any; w.open && w.location && (window.location.href = `/?ask=Analyse+the+daily+${activeMetric}+trend+for+Shiprocket+Quick+Meta+campaigns+${dateRange.label}.+What+caused+the+peak+and+dips?+Give+optimization+recommendations.`) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50">
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
                <span className="text-xs text-slate-400 ml-2">{dateRange.label}</span>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{CAMPAIGNS.length} campaigns live</span>
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
                {CAMPAIGNS.map(c => (
                  <tr key={c.name} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-2.5">
                      <div className="text-xs font-medium text-slate-800 truncate">{c.short}</div>
                      <div className="text-xs text-slate-400">{c.date}</div>
                    </td>
                    <td className="text-right text-xs text-slate-700">₹{(c.spend / 1000).toFixed(1)}K</td>
                    <td className="text-right text-xs">
                      {c.installs > 0 ? (
                        <span className={c.installs > 1000 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>
                          {c.installs.toLocaleString('en-IN')}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="text-right"><CpiColor val={Math.round(c.cpi)} /></td>
                    <td className={`text-right text-xs ${c.ctr < 0.3 ? 'text-red-500 font-medium' : 'text-slate-700'}`}>{c.ctr.toFixed(2)}%</td>
                    <td className="text-right"><ObjBadge obj={c.objective} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="pt-2 text-xs font-semibold text-slate-700">Total</td>
                  <td className="pt-2 text-right text-xs font-semibold text-slate-700">₹{(totalSpend / 100000).toFixed(2)}L</td>
                  <td className="pt-2 text-right text-xs font-semibold text-emerald-600">{totalInstalls.toLocaleString('en-IN')}</td>
                  <td className="pt-2 text-right text-xs font-semibold text-slate-700">₹{avgCPI}</td>
                  <td className="pt-2 text-right text-xs font-semibold text-slate-700">0.88%</td>
                  <td></td>
                </tr>
              </tfoot>
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
                <canvas id="objCanvas" role="img" aria-label="Spend by objective: App Installs 84%, Leads 14%, Awareness 2%">
                  App Installs ₹1.46L, Leads ₹23.8K, Awareness ₹3.8K
                </canvas>
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[
                  { color: '#378ADD', label: 'Installs', pct: '84%', val: '₹1.46L' },
                  { color: '#534AB7', label: 'Leads', pct: '14%', val: '₹23.8K' },
                  { color: '#EF9F27', label: 'Awareness', pct: '2%', val: '₹3.8K' },
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
