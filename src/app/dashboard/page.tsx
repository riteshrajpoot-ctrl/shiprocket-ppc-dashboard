import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { neon } from '@neondatabase/serverless'

async function getCampaigns() {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    const rows = await sql`
      SELECT * FROM metrics_daily 
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY spend DESC
    `
    return rows
  } catch {
    return []
  }
}

export default async function Dashboard() {
  const campaigns = await getCampaigns()

  const totalSpend = campaigns.reduce((a, c) => a + Number(c.spend), 0)
  const totalClicks = campaigns.reduce((a, c) => a + Number(c.clicks), 0)
  const totalImpressions = campaigns.reduce((a, c) => a + Number(c.impressions), 0)
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : '0'

  const scoreItems = [
    { label: 'Budget pacing', score: 18, max: 20, color: 'bg-green-500' },
    { label: 'CpFTR vs target', score: 17, max: 20, color: 'bg-green-500' },
    { label: 'Quality score avg', score: 12, max: 15, color: 'bg-yellow-500' },
    { label: 'Ad strength', score: 11, max: 15, color: 'bg-yellow-500' },
    { label: 'Impression share', score: 8, max: 15, color: 'bg-red-500' },
    { label: 'Wasted spend', score: 5, max: 15, color: 'bg-red-500' },
  ]
  const totalScore = scoreItems.reduce((a, b) => a + b.score, 0)

  const alerts = [
    { severity: 'critical', message: 'Brand campaign overspending by 34% vs daily target', time: '2 hrs ago' },
    { severity: 'critical', message: 'CpFTR spiked to ₹2,140 on Non-Brand Broad — 66% above target', time: '4 hrs ago' },
    { severity: 'warning', message: 'Meta Quick budget exhausted at 2pm. 18 hrs remain', time: '6 hrs ago' },
    { severity: 'warning', message: 'CTR dropped 28% on Retargeting — check creative fatigue', time: 'Yesterday' },
  ]

  const metrics = [
    { label: 'Total spend (MTD)', value: `₹${(totalSpend/100000).toFixed(1)}L`, sub: 'of ₹79.5L budget', trend: 'up', delta: 'Live from Meta' },
    { label: 'Blended CpFTR', value: '₹1,284', sub: 'AOP target ₹1,338', trend: 'up', delta: '4% below target' },
    { label: 'Total clicks', value: totalClicks.toLocaleString('en-IN'), sub: `CTR: ${avgCTR}%`, trend: 'up', delta: 'Live from Meta' },
    { label: 'Impression share', value: '61.4%', sub: 'Lost: budget 18% · rank 21%', trend: 'flat', delta: 'flat vs last week' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <div className="w-8 h-8 bg-blue-800 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">SR</span>
        </div>
        <span className="font-semibold text-slate-800">PPC Command Center</span>
        <div className="flex gap-2 ml-4">
          {['Shiprocket Main', 'Shiprocket Quick', 'All accounts'].map((a, i) => (
            <span key={a} className={`text-xs px-3 py-1 rounded-full cursor-pointer ${i === 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{a}</span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-md">● Live data</span>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-800">AK</div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">{m.label}</div>
              <div className="text-2xl font-semibold text-slate-800">{m.value}</div>
              <div className="text-xs text-slate-400 mt-1">{m.sub}</div>
              <div className={`text-xs mt-2 flex items-center gap-1 ${m.trend === 'up' ? 'text-green-600' : m.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                {m.trend === 'up' ? <TrendingUp size={12}/> : m.trend === 'down' ? <TrendingDown size={12}/> : <Minus size={12}/>}
                {m.delta}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-slate-700">Account health score</span>
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Needs attention</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-5xl font-semibold text-slate-800">{totalScore}</div>
                <div className="text-xs text-slate-400 mt-1">out of 100</div>
              </div>
              <div className="flex-1 space-y-2">
                {scoreItems.map((s) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-32">{s.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${s.color}`} style={{width: `${(s.score/s.max)*100}%`}}></div>
                    </div>
                    <span className="text-xs font-medium text-slate-700 w-6 text-right">{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">Alerts</span>
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">4 critical</span>
            </div>
            <div className="space-y-3">
              {alerts.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                  <div>
                    <div className="text-xs text-slate-700 leading-snug">{a.message}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-700">Campaign performance — Live Meta data</span>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">● {campaigns.length} campaigns</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">Campaign</th>
                <th className="text-right pb-2 font-medium">Spend</th>
                <th className="text-right pb-2 font-medium">Clicks</th>
                <th className="text-right pb-2 font-medium">Impressions</th>
                <th className="text-right pb-2 font-medium">CTR</th>
                <th className="text-right pb-2 font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length > 0 ? campaigns.map((c) => (
                <tr key={c.campaign_id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3">
                    <div className="text-sm font-medium text-slate-800">{c.campaign_name}</div>
                  </td>
                  <td className="text-right text-sm font-medium text-slate-700">₹{Number(c.spend).toLocaleString('en-IN')}</td>
                  <td className="text-right text-sm text-slate-600">{Number(c.clicks).toLocaleString('en-IN')}</td>
                  <td className="text-right text-sm text-slate-600">{Number(c.impressions).toLocaleString('en-IN')}</td>
                  <td className="text-right text-sm text-slate-600">{Number(c.ctr).toFixed(2)}%</td>
                  <td className="text-right"><span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{c.account_id}</span></td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">No data yet — n8n sync will populate this</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
