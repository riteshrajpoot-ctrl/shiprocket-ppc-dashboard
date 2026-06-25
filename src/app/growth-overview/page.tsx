// Sidebar nav: { href: "/growth-overview", label: "Growth Overview", icon: "chart-pie" }
'use client'
import { useState, useEffect } from 'react'

// ── TARGETS — update these any time ──────────────────────────
const SUPPLY_CPI_TARGET = 20       // ₹ per driver install
const DEMAND_CPO_TARGET = 550      // ₹ per first order
const MONTHLY_BUDGET = 350000      // ₹3.5L total monthly budget
// ─────────────────────────────────────────────────────────────

interface SideData {
  spend: number; impressions: number; clicks: number; installs: number
  orders?: number; campaigns: number; ctr: string; cpi: number | null
  cpo?: number | null; cpc: number | null; pacingPct: number
  dailyRate: number; projectedMonthEnd: number
  projectedInstalls?: number; projectedOrders?: number
  topAds: { name: string; spend: number; installs: number; ctr: number; cpi: number | null }[]
  topCampaigns?: { name: string; spend: number; installs: number; orders: number; cpo: number | null; ctr: string }[]
}
interface MgmtData {
  dateStart: string; dateEnd: string; dayOfMonth: number
  daysInMonth: number; monthPct: number
  supply: SideData; demand: SideData
  total: { spend: number; installs: number; impressions: number; supplySharePct: number; demandSharePct: number; daysLeft: number }
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
const fmtL = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${fmt(n)}`
const fmtK = (n: number) => n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${fmt(n)}`

export default function GrowthOverviewPage() {
  const [data, setData] = useState<MgmtData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split('T')[0])

  // Tool states
  const [allocPct, setAllocPct] = useState(71)
  const [extraMode, setExtraMode] = useState(false)
  const [extraAmt, setExtraAmt] = useState(50000)
  const [extraSplit, setExtraSplit] = useState(60)
  const [wifTab, setWifTab] = useState<'cpo' | 'cpi' | 'ctr'>('cpo')
  const [wifSpend, setWifSpend] = useState(78000)
  const [wifTarget, setWifTarget] = useState(DEMAND_CPO_TARGET)
  const [wifCpi, setWifCpi] = useState(9)
  const [wifCpiSpend, setWifCpiSpend] = useState(189000)
  const [wifCtr, setWifCtr] = useState(0.8)

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/management-metrics?date_start=${dateStart}&date_end=${dateEnd}`)
      const json = await res.json()
      if (json.error) { setError(json.error); setLoading(false); return }
      setData(json)
      // Sync tool defaults to live data
      if (json.demand?.spend) setWifSpend(json.demand.spend)
      if (json.demand?.cpi) setWifCpi(json.supply?.cpi || 9)
      if (json.supply?.spend) setWifCpiSpend(json.supply.spend)
      if (json.demand?.ctr) setWifCtr(parseFloat(json.demand.ctr))
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ── Sub-components ─────────────────────────────────────────

  const PacingBar = ({ pct, elapsed }: { pct: number; elapsed: number }) => {
    const color = pct > elapsed + 10 ? '#E24B4A' : pct < elapsed - 10 ? '#EF9F27' : '#1D9E75'
    const status = pct > elapsed + 10 ? 'Ahead of pace' : pct < elapsed - 10 ? 'Behind pace' : 'On track'
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>Budget pacing</span>
          <span style={{ fontSize: 11, fontWeight: 500, color }}>{pct}% used</span>
        </div>
        <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>Day {data?.dayOfMonth}/{data?.daysInMonth} · {elapsed}% elapsed</span>
          <span style={{ fontSize: 10, fontWeight: 500, color }}>{status}</span>
        </div>
      </div>
    )
  }

  const MetricPill = ({ val, target, label, invert }: { val: number; target: number; label: string; invert?: boolean }) => {
    const good = invert ? val > target : val < target
    return (
      <span style={{
        fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
        background: good ? '#EAF3DE' : '#FCEBEB',
        color: good ? '#27500A' : '#791F1F'
      }}>{label}</span>
    )
  }

  const TopAds = ({ ads, side, topCampaigns }: { ads: SideData['topAds']; side: 'supply' | 'demand'; topCampaigns?: SideData['topCampaigns'] }) => (
    <div>
      {side === 'demand' && topCampaigns && topCampaigns.length > 0 ? (
        <>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Top campaigns by first orders</p>
          {topCampaigns.slice(0, 5).map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '.5px solid #F3F4F6' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', width: 14, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{fmtK(c.spend)} spend · {c.ctr}% CTR</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: 0 }}>
                  {c.orders > 0 ? `${fmt(c.orders)} orders` : `${fmt(c.installs)} installs`}
                </p>
                {c.cpo
                  ? <p style={{ fontSize: 10, color: c.cpo < DEMAND_CPO_TARGET ? '#059669' : '#DC2626', margin: 0 }}>₹{c.cpo} CPO</p>
                  : <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>no orders yet</p>
                }
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Top ads by installs</p>
          {ads.slice(0, 4).map((ad, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '.5px solid #F3F4F6' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', width: 14, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name}</p>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{fmtK(ad.spend)} · {Number(ad.ctr).toFixed(2)}% CTR</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: 0 }}>{fmt(ad.installs)}</p>
                {ad.cpi && <p style={{ fontSize: 10, color: ad.cpi < 15 ? '#059669' : ad.cpi < 40 ? '#D97706' : '#DC2626', margin: 0 }}>₹{ad.cpi} CPI</p>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  // ── Budget simulator ──────────────────────────────────────
  const BudgetSimulator = () => {
    const remaining = data ? Math.max(0, MONTHLY_BUDGET - data.total.spend) : 83000
    const supplyCpi = data?.supply.cpi || 9
    const demandCpo = data?.demand.cpo || 375

    if (!extraMode) {
      const s = remaining * (allocPct / 100)
      const d = remaining * (1 - allocPct / 100)
      return (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['Remaining budget', 'Extra budget'].map((lbl, i) => (
              <button key={lbl} onClick={() => setExtraMode(i === 1)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: '.5px solid', borderColor: !extraMode && i === 0 ? '#AFA9EC' : extraMode && i === 1 ? '#AFA9EC' : '#E5E7EB',
                background: (!extraMode && i === 0) || (extraMode && i === 1) ? '#EEEDFE' : 'transparent',
                color: (!extraMode && i === 0) || (extraMode && i === 1) ? '#3C3489' : '#6B7280',
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#6B7280', width: 80, flexShrink: 0 }}>Supply %</span>
            <input type="range" min={0} max={100} value={allocPct} step={1} style={{ flex: 1 }} onChange={e => setAllocPct(+e.target.value)} />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111827', width: 36, textAlign: 'right' }}>{allocPct}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '.5px solid #DDD6FE' }}>
              <p style={{ fontSize: 10, color: '#7C3AED', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supply gets</p>
              <p style={{ fontSize: 18, fontWeight: 500, color: '#3C3489', margin: '0 0 2px' }}>{fmtK(s)}</p>
              <p style={{ fontSize: 10, color: '#7C3AED', margin: 0 }}>~{fmt(s / supplyCpi)} installs</p>
            </div>
            <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '.5px solid #BFDBFE' }}>
              <p style={{ fontSize: 10, color: '#185FA5', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demand gets</p>
              <p style={{ fontSize: 18, fontWeight: 500, color: '#185FA5', margin: '0 0 2px' }}>{fmtK(d)}</p>
              <p style={{ fontSize: 10, color: '#185FA5', margin: 0 }}>~{fmt(d / demandCpo)} orders</p>
            </div>
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>Remaining budget: {fmtK(remaining)} (of {fmtL(MONTHLY_BUDGET)} monthly)</p>
        </div>
      )
    }

    const s = extraAmt * (extraSplit / 100)
    const d = extraAmt * (1 - extraSplit / 100)
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['Remaining budget', 'Extra budget'].map((lbl, i) => (
            <button key={lbl} onClick={() => setExtraMode(i === 1)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '.5px solid', borderColor: !extraMode && i === 0 ? '#AFA9EC' : extraMode && i === 1 ? '#AFA9EC' : '#E5E7EB',
              background: (!extraMode && i === 0) || (extraMode && i === 1) ? '#EEEDFE' : 'transparent',
              color: (!extraMode && i === 0) || (extraMode && i === 1) ? '#3C3489' : '#6B7280',
            }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#6B7280', width: 80, flexShrink: 0 }}>Extra (₹K)</span>
          <input type="range" min={10000} max={500000} value={extraAmt} step={5000} style={{ flex: 1 }} onChange={e => setExtraAmt(+e.target.value)} />
          <span style={{ fontSize: 12, fontWeight: 500, width: 44, textAlign: 'right' }}>{fmtK(extraAmt)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: '#6B7280', width: 80, flexShrink: 0 }}>To supply</span>
          <input type="range" min={0} max={100} value={extraSplit} step={5} style={{ flex: 1 }} onChange={e => setExtraSplit(+e.target.value)} />
          <span style={{ fontSize: 12, fontWeight: 500, width: 44, textAlign: 'right' }}>{extraSplit}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '.5px solid #DDD6FE' }}>
            <p style={{ fontSize: 10, color: '#7C3AED', margin: '0 0 3px' }}>Supply gets</p>
            <p style={{ fontSize: 18, fontWeight: 500, color: '#3C3489', margin: '0 0 2px' }}>{fmtK(s)}</p>
            <p style={{ fontSize: 10, color: '#7C3AED', margin: 0 }}>~{fmt(s / supplyCpi)} installs</p>
          </div>
          <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '.5px solid #BFDBFE' }}>
            <p style={{ fontSize: 10, color: '#185FA5', margin: '0 0 3px' }}>Demand gets</p>
            <p style={{ fontSize: 18, fontWeight: 500, color: '#185FA5', margin: '0 0 2px' }}>{fmtK(d)}</p>
            <p style={{ fontSize: 10, color: '#185FA5', margin: 0 }}>~{fmt(d / demandCpo)} orders</p>
          </div>
        </div>
      </div>
    )
  }

  // ── What-if planner ───────────────────────────────────────
  const WhatIfPlanner = () => {
    const demandCpo = data?.demand.cpo || 375
    const supplyCpiActual = data?.supply.cpi || 9
    const totalImpressions = data ? data.supply.impressions + data.demand.impressions : 479000
    const installRate = data && data.total.impressions > 0 ? data.total.installs / (data.supply.clicks + data.demand.clicks) : 0.393

    return (
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['cpo', 'cpi', 'ctr'] as const).map(t => (
            <button key={t} onClick={() => setWifTab(t)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '.5px solid', borderColor: wifTab === t ? '#AFA9EC' : '#E5E7EB',
              background: wifTab === t ? '#EEEDFE' : 'transparent',
              color: wifTab === t ? '#3C3489' : '#6B7280',
            }}>{t === 'cpo' ? 'Demand CPO' : t === 'cpi' ? 'Supply CPI' : 'CTR impact'}</button>
          ))}
        </div>

        {wifTab === 'cpo' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280', width: 100, flexShrink: 0 }}>Monthly spend</span>
              <input type="range" min={50000} max={500000} value={wifSpend} step={5000} style={{ flex: 1 }} onChange={e => setWifSpend(+e.target.value)} />
              <span style={{ fontSize: 12, fontWeight: 500, width: 50, textAlign: 'right' }}>{fmtK(wifSpend)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#6B7280', width: 100, flexShrink: 0 }}>Target CPO</span>
              <input type="range" min={200} max={1000} value={wifTarget} step={25} style={{ flex: 1 }} onChange={e => setWifTarget(+e.target.value)} />
              <span style={{ fontSize: 12, fontWeight: 500, width: 50, textAlign: 'right' }}>₹{wifTarget}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: 'center', background: '#F0FDF4', borderRadius: 8, padding: '10px', border: '.5px solid #A7F3D0' }}>
                <p style={{ fontSize: 10, color: '#065F46', margin: '0 0 4px' }}>At actual CPO ₹{demandCpo}</p>
                <p style={{ fontSize: 26, fontWeight: 500, color: '#059669', margin: 0 }}>{fmt(wifSpend / demandCpo)}</p>
                <p style={{ fontSize: 10, color: '#6B7280', margin: 0 }}>first orders</p>
              </div>
              <div style={{ textAlign: 'center', background: '#EFF6FF', borderRadius: 8, padding: '10px', border: '.5px solid #BFDBFE' }}>
                <p style={{ fontSize: 10, color: '#185FA5', margin: '0 0 4px' }}>At target CPO ₹{wifTarget}</p>
                <p style={{ fontSize: 26, fontWeight: 500, color: '#185FA5', margin: 0 }}>{fmt(wifSpend / wifTarget)}</p>
                <p style={{ fontSize: 10, color: '#6B7280', margin: 0 }}>first orders</p>
              </div>
            </div>
            {demandCpo < wifTarget ? (
              <div style={{ background: '#F0FDF4', border: '.5px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065F46', lineHeight: 1.5 }}>
                Beating target by ₹{wifTarget - demandCpo}. Current efficiency generates {fmt(wifSpend / demandCpo - wifSpend / wifTarget)} extra orders at no additional cost.
              </div>
            ) : (
              <div style={{ background: '#FFFBEB', border: '.5px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                CPO above target. Improve creative CTR or reduce spend to bring CPO to ₹{wifTarget}.
              </div>
            )}
          </div>
        )}

        {wifTab === 'cpi' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280', width: 100, flexShrink: 0 }}>Supply spend</span>
              <input type="range" min={50000} max={500000} value={wifCpiSpend} step={5000} style={{ flex: 1 }} onChange={e => setWifCpiSpend(+e.target.value)} />
              <span style={{ fontSize: 12, fontWeight: 500, width: 50, textAlign: 'right' }}>{fmtK(wifCpiSpend)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#6B7280', width: 100, flexShrink: 0 }}>CPI (₹)</span>
              <input type="range" min={5} max={100} value={wifCpi} step={1} style={{ flex: 1 }} onChange={e => setWifCpi(+e.target.value)} />
              <span style={{ fontSize: 12, fontWeight: 500, width: 50, textAlign: 'right' }}>₹{wifCpi}</span>
            </div>
            <div style={{ textAlign: 'center', background: '#F5F3FF', borderRadius: 10, padding: '16px', border: '.5px solid #DDD6FE' }}>
              <p style={{ fontSize: 11, color: '#7C3AED', margin: '0 0 6px' }}>Projected driver installs</p>
              <p style={{ fontSize: 36, fontWeight: 500, color: '#3C3489', margin: '0 0 4px' }}>{fmt(wifCpiSpend / wifCpi)}</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>at ₹{wifCpi} CPI · actual ₹{supplyCpiActual}</p>
            </div>
            {wifCpi > supplyCpiActual && (
              <div style={{ background: '#FFFBEB', border: '.5px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E', lineHeight: 1.5, marginTop: 8 }}>
                At ₹{wifCpi} vs actual ₹{supplyCpiActual}, you would lose {fmt(wifCpiSpend / supplyCpiActual - wifCpiSpend / wifCpi)} installs. Protect current CPI.
              </div>
            )}
          </div>
        )}

        {wifTab === 'ctr' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280', width: 100, flexShrink: 0 }}>Target CTR</span>
              <input type="range" min={0.1} max={3} value={wifCtr} step={0.05} style={{ flex: 1 }} onChange={e => setWifCtr(+e.target.value)} />
              <span style={{ fontSize: 12, fontWeight: 500, width: 50, textAlign: 'right' }}>{wifCtr.toFixed(2)}%</span>
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12 }}>Based on {fmt(totalImpressions)} total impressions this period</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: 'center', background: '#F9FAFB', borderRadius: 8, padding: '10px', border: '.5px solid #E5E7EB' }}>
                <p style={{ fontSize: 10, color: '#6B7280', margin: '0 0 4px' }}>Projected clicks</p>
                <p style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>{fmt(totalImpressions * (wifCtr / 100))}</p>
              </div>
              <div style={{ textAlign: 'center', background: '#F9FAFB', borderRadius: 8, padding: '10px', border: '.5px solid #E5E7EB' }}>
                <p style={{ fontSize: 10, color: '#6B7280', margin: '0 0 4px' }}>Projected installs</p>
                <p style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>{fmt(totalImpressions * (wifCtr / 100) * installRate)}</p>
              </div>
            </div>
            <div style={{
              background: wifCtr >= 1 ? '#F0FDF4' : '#FFFBEB',
              border: `.5px solid ${wifCtr >= 1 ? '#A7F3D0' : '#FDE68A'}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 12,
              color: wifCtr >= 1 ? '#065F46' : '#92400E', lineHeight: 1.5
            }}>
              {wifCtr >= 1 ? `CTR ${wifCtr.toFixed(2)}% — above 1% benchmark. Safe to scale spend.` : `CTR ${wifCtr.toFixed(2)}% — below 1% benchmark. Fix creative hooks before increasing spend.`}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Early warning signals ─────────────────────────────────
  const Signals = ({ d }: { d: MgmtData }) => {
    const signals = []
    const supplyCtr = parseFloat(d.supply.ctr)
    const demandCtr = parseFloat(d.demand.ctr)
    const demandCpo = d.demand.cpo || 0
    const remaining = Math.max(0, MONTHLY_BUDGET - d.total.spend)
    const ordersAtRisk = d.demand.dailyRate > 0 ? Math.round(remaining / (d.demand.spend / (d.demand.orders || 1))) : 0

    if (d.supply.pacingPct < d.monthPct - 5) signals.push({ color: '#EF9F27', text: `Supply behind pace (${d.supply.pacingPct}% used, ${d.monthPct}% elapsed)`, action: `Consider adding ₹${fmt(d.supply.dailyRate * 0.2)}/day in final week.` })
    if (d.demand.pacingPct < d.monthPct - 10) signals.push({ color: '#E24B4A', text: `Demand under-paced — ${ordersAtRisk}+ orders being left on table`, action: `Budget ${d.monthPct - d.demand.pacingPct}% behind. At ₹${demandCpo} CPO, remaining ₹${fmt(remaining)} = ~${fmt(remaining / demandCpo)} more orders.` })
    if (demandCpo > 0 && demandCpo < DEMAND_CPO_TARGET) signals.push({ color: '#059669', text: `Demand CPO ₹${demandCpo} — ₹${DEMAND_CPO_TARGET - demandCpo} below ₹${DEMAND_CPO_TARGET} target`, action: 'Safe to increase demand spend without breaching CPO target.' })
    if (demandCtr < 1) signals.push({ color: '#E24B4A', text: `Demand CTR at ${demandCtr.toFixed(2)}% — below 1% benchmark`, action: 'Hook redesign needed. Use Creative Intelligence to test alternatives before scaling.' })
    if (supplyCtr >= 1) signals.push({ color: '#059669', text: `Supply CTR ${supplyCtr.toFixed(2)}% — above 1% benchmark`, action: 'Creatives performing well. Safe to scale supply spend.' })
    if (d.supply.cpi && d.supply.cpi < SUPPLY_CPI_TARGET) signals.push({ color: '#059669', text: `Supply CPI ₹${d.supply.cpi} — well below ₹${SUPPLY_CPI_TARGET} target`, action: `Every ₹${d.supply.cpi} acquires one driver. High efficiency — increase supply budget.` })
    if (d.demand.installs > 0 && (d.demand.orders || 0) / d.demand.installs < 0.12) {
      const convRate = (((d.demand.orders || 0) / d.demand.installs) * 100).toFixed(1)
      signals.push({ color: '#EF9F27', text: `Install-to-order conversion at ${convRate}% — below 15% benchmark`, action: 'Post-install onboarding or offer clarity may be limiting conversions. Review app UX.' })
    }

    if (signals.length === 0) signals.push({ color: '#059669', text: 'All metrics within healthy range', action: 'No immediate action required.' })

    return (
      <div>
        {signals.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, marginTop: 4 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: '0 0 2px', lineHeight: 1.4 }}>{s.text}</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: 0, lineHeight: 1.4 }}>{s.action}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '.5px solid #E5E7EB', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>M</div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#111827', margin: 0 }}>Growth Overview</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Demand vs Supply — separated</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} style={{ padding: '5px 10px', border: '.5px solid #E5E7EB', borderRadius: 6, fontSize: 13 }} />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>to</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} style={{ padding: '5px 10px', border: '.5px solid #E5E7EB', borderRadius: 6, fontSize: 13 }} />
          <button onClick={fetchData} style={{ padding: '6px 16px', borderRadius: 6, background: '#4F46E5', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: '80px 0', color: '#6B7280' }}><div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div><p style={{ fontSize: 14 }}>Loading management metrics...</p></div>}
        {error && <div style={{ background: '#FEF2F2', border: '.5px solid #FECACA', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}><p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>Error: {error}</p></div>}

        {data && !loading && (
          <>
            {/* ── Summary strip ── */}
            <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
              {[
                { label: 'Total MTD spend', val: fmtL(data.total.spend), sub: `${dateStart} to ${dateEnd}`, subColor: '#9CA3AF' },
                { label: 'Supply spend', val: fmtL(data.supply.spend), sub: `${data.total.supplySharePct}% of total`, subColor: '#7C3AED', valColor: '#3C3489' },
                { label: 'Demand spend', val: fmtL(data.demand.spend), sub: `${data.total.demandSharePct}% of total`, subColor: '#1D4ED8', valColor: '#185FA5' },
                { label: 'Day of month', val: `${data.dayOfMonth} / ${data.daysInMonth}`, sub: `${data.monthPct}% elapsed`, subColor: '#9CA3AF' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '0 20px', borderRight: '.5px solid #E5E7EB' }}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', margin: '0 0 3px' }}>{item.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 500, color: item.valColor || '#111827', margin: '0 0 2px' }}>{item.val}</p>
                  <p style={{ fontSize: 11, color: item.subColor, margin: 0 }}>{item.sub}</p>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', padding: '0 0 0 20px' }}>
                <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', margin: '0 0 4px' }}>Supply CPI &nbsp;|&nbsp; Demand CPO</p>
                  <p style={{ fontSize: 14, margin: '0 0 2px' }}>
                    <span style={{ color: '#7C3AED', fontWeight: 500 }}>₹{data.supply.cpi ?? '—'}</span>
                    <span style={{ color: '#D1D5DB', margin: '0 8px' }}>|</span>
                    <span style={{ color: data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET ? '#059669' : '#DC2626', fontWeight: 500 }}>₹{data.demand.cpo ?? 'via Branch'}</span>
                  </p>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>different objectives — not comparable</p>
                </div>
              </div>
            </div>

            {/* ── Supply + Demand panels ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {(['supply', 'demand'] as const).map(side => {
                const m = data[side]
                const isSupply = side === 'supply'
                const headerBg = isSupply ? '#F5F3FF' : '#EFF6FF'
                const accentColor = isSupply ? '#3C3489' : '#185FA5'
                const lightColor = isSupply ? '#7C3AED' : '#1D4ED8'
                const boxBg = isSupply ? '#F5F3FF' : '#EFF6FF'
                const boxBorder = isSupply ? '#DDD6FE' : '#BFDBFE'

                return (
                  <div key={side} style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ background: headerBg, padding: '14px 18px', borderBottom: '.5px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: accentColor, margin: '0 0 2px' }}>
                          {isSupply ? '🚗 Supply side — driver acquisition' : '📦 Demand side — customer acquisition'}
                        </p>
                        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{m.campaigns} campaigns · {m.impressions >= 100000 ? `${(m.impressions / 100000).toFixed(1)}L` : fmt(m.impressions)} impressions</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 20, fontWeight: 500, color: '#111827', margin: 0 }}>{fmtL(m.spend)}</p>
                        <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>total spend</p>
                      </div>
                    </div>

                    <div style={{ padding: 18 }}>
                      {/* Primary metrics box */}
                      <div style={{ background: boxBg, border: `.5px solid ${boxBorder}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                        {isSupply ? (
                          <>
                            <div>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Driver installs</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: accentColor, margin: '0 0 4px' }}>{fmt(m.installs)}</p>
                              <p style={{ fontSize: 10, color: lightColor, margin: 0 }}>partners onboarded</p>
                            </div>
                            <div style={{ borderLeft: `.5px solid ${boxBorder}`, borderRight: `.5px solid ${boxBorder}` }}>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Cost per install</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: accentColor, margin: '0 0 4px' }}>₹{m.cpi ?? '—'}</p>
                              {m.cpi && <MetricPill val={m.cpi} target={SUPPLY_CPI_TARGET} label={m.cpi < SUPPLY_CPI_TARGET ? `₹${SUPPLY_CPI_TARGET - m.cpi} below target` : `₹${m.cpi - SUPPLY_CPI_TARGET} above target`} />}
                            </div>
                            <div>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Avg CTR</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: accentColor, margin: '0 0 4px' }}>{m.ctr}%</p>
                              <MetricPill val={parseFloat(m.ctr)} target={1} label={parseFloat(m.ctr) >= 1 ? 'Above 1% target' : 'Below 1% target'} invert />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>App installs</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: accentColor, margin: '0 0 4px' }}>{fmt(m.installs)}</p>
                              <p style={{ fontSize: 10, color: lightColor, margin: 0 }}>customers acquired</p>
                            </div>
                            <div style={{ borderLeft: `.5px solid ${boxBorder}`, borderRight: `.5px solid ${boxBorder}` }}>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>First orders</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: m.orders ? accentColor : '#9CA3AF', margin: '0 0 4px' }}>{m.orders ? fmt(m.orders) : 'Branch'}</p>
                              <p style={{ fontSize: 10, color: lightColor, margin: 0 }}>post-install conversions</p>
                            </div>
                            <div>
                              <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Cost per order</p>
                              <p style={{ fontSize: 22, fontWeight: 500, color: m.cpo && m.cpo < DEMAND_CPO_TARGET ? '#059669' : m.cpo ? '#DC2626' : '#9CA3AF', margin: '0 0 4px' }}>
                                {m.cpo ? `₹${m.cpo}` : 'Branch'}
                              </p>
                              {m.cpo && <MetricPill val={m.cpo} target={DEMAND_CPO_TARGET} label={m.cpo < DEMAND_CPO_TARGET ? `₹${DEMAND_CPO_TARGET - m.cpo} below target` : `₹${m.cpo - DEMAND_CPO_TARGET} above target`} />}
                            </div>
                          </>
                        )}
                      </div>

                      {/* CPO progress bar — demand only */}
                      {!isSupply && m.cpo && (
                        <div style={{ background: m.cpo < DEMAND_CPO_TARGET ? '#F0FDF4' : '#FEF2F2', border: `.5px solid ${m.cpo < DEMAND_CPO_TARGET ? '#A7F3D0' : '#FECACA'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: m.cpo < DEMAND_CPO_TARGET ? '#065F46' : '#DC2626' }}>CPO vs target</span>
                            <span style={{ fontSize: 12, color: '#6B7280' }}>₹{m.cpo} actual · ₹{DEMAND_CPO_TARGET} target</span>
                          </div>
                          <div style={{ height: 8, background: m.cpo < DEMAND_CPO_TARGET ? '#D1FAE5' : '#FEE2E2', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ width: `${Math.min((m.cpo / DEMAND_CPO_TARGET) * 100, 100)}%`, height: '100%', background: m.cpo < DEMAND_CPO_TARGET ? '#1D9E75' : '#E24B4A', borderRadius: 4 }} />
                          </div>
                          <p style={{ fontSize: 11, color: m.cpo < DEMAND_CPO_TARGET ? '#059669' : '#DC2626', margin: 0, fontWeight: 500 }}>
                            {m.cpo < DEMAND_CPO_TARGET ? `₹${DEMAND_CPO_TARGET - m.cpo} headroom — ${Math.round(((DEMAND_CPO_TARGET - m.cpo) / DEMAND_CPO_TARGET) * 100)}% below target` : `₹${m.cpo - DEMAND_CPO_TARGET} above target — reduce spend or fix creatives`}
                          </p>
                        </div>
                      )}

                      <PacingBar pct={m.pacingPct} elapsed={data.monthPct} />

                      {/* Funnel */}
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Funnel</p>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {[
                            { label: 'Impressions', val: m.impressions >= 100000 ? `${(m.impressions / 100000).toFixed(1)}L` : fmt(m.impressions) },
                            { label: 'Clicks', val: fmt(m.clicks) },
                            { label: 'Installs', val: fmt(m.installs) },
                            ...(!isSupply && m.orders ? [{ label: 'Orders', val: fmt(m.orders) }] : [])
                          ].map((step, i, arr) => (
                            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                              <div style={{ flex: 1, background: '#F9FAFB', border: '.5px solid #E5E7EB', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <p style={{ fontSize: 10, color: '#6B7280', margin: '0 0 2px' }}>{step.label}</p>
                                <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', margin: 0 }}>{step.val}</p>
                              </div>
                              {i < arr.length - 1 && <span style={{ fontSize: 11, color: '#D1D5DB', padding: '0 2px', flexShrink: 0 }}>→</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      <TopAds ads={m.topAds} side={side} topCampaigns={m.topCampaigns} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Smart tools row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Budget simulator */}
              <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: '#7C3AED' }}>⚡</span>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111827', margin: 0 }}>Budget allocation simulator</p>
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>Redistribute remaining budget and see projected outcomes instantly</p>
                <BudgetSimulator />
              </div>

              {/* Month-end forecaster */}
              <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: '#185FA5' }}>🔭</span>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111827', margin: 0 }}>Month-end forecaster</p>
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>Projected outcomes at current daily run rate</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[
                    { label: 'Supply daily rate', val: `₹${fmt(data.supply.dailyRate)}/day`, color: '#3C3489', bg: '#F5F3FF', border: '#DDD6FE' },
                    { label: 'Demand daily rate', val: `₹${fmt(data.demand.dailyRate)}/day`, color: '#185FA5', bg: '#EFF6FF', border: '#BFDBFE' },
                  ].map(item => (
                    <div key={item.label} style={{ background: item.bg, border: `.5px solid ${item.border}`, borderRadius: 8, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, color: '#6B7280', margin: '0 0 4px' }}>{item.label}</p>
                      <p style={{ fontSize: 14, fontWeight: 500, color: item.color, margin: 0 }}>{item.val}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Projected month-end</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ background: '#F5F3FF', border: '.5px solid #DDD6FE', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: '#7C3AED', margin: '0 0 4px' }}>Supply total spend</p>
                    <p style={{ fontSize: 18, fontWeight: 500, color: '#3C3489', margin: '0 0 2px' }}>{fmtL(data.supply.projectedMonthEnd)}</p>
                    <p style={{ fontSize: 10, color: '#7C3AED', margin: 0 }}>~{fmt(data.supply.projectedInstalls || 0)} driver installs</p>
                  </div>
                  <div style={{ background: '#EFF6FF', border: '.5px solid #BFDBFE', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: '#185FA5', margin: '0 0 4px' }}>Demand total spend</p>
                    <p style={{ fontSize: 18, fontWeight: 500, color: '#185FA5', margin: '0 0 2px' }}>{fmtL(data.demand.projectedMonthEnd)}</p>
                    <p style={{ fontSize: 10, color: '#185FA5', margin: 0 }}>~{fmt(data.demand.projectedOrders || 0)} first orders</p>
                  </div>
                </div>
                {data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET && (
                  <div style={{ background: '#FFFBEB', border: '.5px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
                    Demand under-paced. At ₹{data.demand.cpo} CPO, remaining {data.total.daysLeft} days could add ~{fmt(Math.round(data.demand.dailyRate * data.total.daysLeft / data.demand.cpo))} more orders.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* What-if planner */}
              <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: '#059669' }}>🎛</span>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111827', margin: 0 }}>What-if planner</p>
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>Change one lever — see the business impact instantly</p>
                <WhatIfPlanner />
              </div>

              {/* Early warning signals */}
              <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: '#D97706' }}>🔔</span>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111827', margin: 0 }}>Early warning signals</p>
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 14px', lineHeight: 1.5 }}>Auto-detected from live data — green = good, amber = watch, red = act</p>
                <Signals d={data} />
              </div>
            </div>

            {/* ── Growth summary ── */}
            <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Growth summary — {data.dateStart} to {data.dateEnd}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '14px 16px', border: '.5px solid #DDD6FE' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#3C3489', margin: '0 0 6px' }}>🚗 Supply health</p>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                    {fmt(data.supply.installs)} drivers onboarded at ₹{data.supply.cpi} CPI.
                    CTR {data.supply.ctr}% — {parseFloat(data.supply.ctr) >= 1 ? 'above 1% benchmark, creatives working well.' : 'below 1% benchmark, hook quality needs attention.'}
                    Budget {data.supply.pacingPct > data.monthPct ? 'ahead of' : 'behind'} pace ({data.supply.pacingPct}% used, {data.monthPct}% elapsed).
                  </p>
                </div>
                <div style={{ background: data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET ? '#F0FDF4' : '#FEF2F2', borderRadius: 10, padding: '14px 16px', border: `.5px solid ${data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET ? '#A7F3D0' : '#FECACA'}` }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET ? '#065F46' : '#DC2626', margin: '0 0 6px' }}>
                    📦 Demand health — {data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET ? 'on target, room to scale' : 'above CPO target'}
                  </p>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                    {fmt(data.demand.installs)} customer installs.
                    {data.demand.cpo ? ` ${fmt(data.demand.orders || 0)} first orders at ₹${data.demand.cpo} CPO — ${data.demand.cpo < DEMAND_CPO_TARGET ? `₹${DEMAND_CPO_TARGET - data.demand.cpo} below ₹${DEMAND_CPO_TARGET} target.` : `₹${data.demand.cpo - DEMAND_CPO_TARGET} above target.`}` : ' First order data via Branch.'}
                    {data.demand.cpo && data.demand.cpo < DEMAND_CPO_TARGET && data.demand.pacingPct < data.monthPct - 5 ? ' Budget under-paced — safe to increase demand spend.' : ''}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
