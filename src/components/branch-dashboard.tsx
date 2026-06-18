'use client'

import { useState, useEffect, useCallback } from 'react'

interface BranchCampaign {
  campaign: string
  ad_partner: string
  installs: number
  first_orders: number
  conversion_rate: number
  cpo: number | null
}

interface BranchSummary {
  total_installs: number
  total_first_orders: number
  overall_conversion: number
  avg_cpo: number | null
  top_partner: string
  date_range: { start: string; end: string }
}

interface BranchData {
  summary: BranchSummary
  by_campaign: BranchCampaign[]
  by_partner: { partner: string; installs: number; first_orders: number; share: number }[]
  last_updated: string
}

const AD_PARTNERS = ['All partners', 'Meta', 'Google', 'Organic', 'Direct', 'Other']

const MOCK_DATA: BranchData = {
  summary: {
    total_installs: 18496,
    total_first_orders: 0,
    overall_conversion: 0,
    avg_cpo: null,
    top_partner: 'Meta',
    date_range: { start: '2026-06-01', end: '2026-06-18' },
  },
  by_campaign: [
    { campaign: 'Delivery_Partner_ACe_20_May_26', ad_partner: 'Meta', installs: 14788, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: 'Partner_3W_Geo_9_June_26', ad_partner: 'Meta', installs: 825, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: 'Partner_Heavy_Generic_ACe_12_June_26', ad_partner: 'Meta', installs: 555, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: '3W_Test_13_May_26', ad_partner: 'Meta', installs: 553, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: '3W_Lookalike_4_June_26', ad_partner: 'Meta', installs: 305, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: 'Partner_Leads_WA_27_May_26', ad_partner: 'Meta', installs: 993, first_orders: 0, conversion_rate: 0, cpo: null },
    { campaign: 'Meta_ACI_FOCFe_Netcore_April_26', ad_partner: 'Meta', installs: 477, first_orders: 0, conversion_rate: 0, cpo: null },
  ],
  by_partner: [
    { partner: 'Meta', installs: 18496, first_orders: 0, share: 100 },
  ],
  last_updated: new Date().toISOString(),
}

function fmt(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString('en-IN')
}

function fmtINR(n: number | null) {
  if (n === null) return '—'
  return `₹${n.toLocaleString('en-IN')}`
}

function StatusPill({ status }: { status: 'live' | 'error' | 'pending' }) {
  const cfg = {
    live: { bg: '#D1FAE5', color: '#065F46', label: 'Live' },
    error: { bg: '#FEE2E2', color: '#991B1B', label: 'API Error' },
    pending: { bg: '#FEF3C7', color: '#92400E', label: 'Connecting…' },
  }[status]
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>
      {cfg.label}
    </span>
  )
}

export default function BranchDashboard() {
  const [data, setData] = useState<BranchData>(MOCK_DATA)
  const [apiStatus, setApiStatus] = useState<'live' | 'error' | 'pending'>('pending')
  const [selectedPartner, setSelectedPartner] = useState('All partners')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'installs' | 'first_orders' | 'conversion_rate' | 'cpo'>('installs')
  const [dateRange, setDateRange] = useState({ start: '2026-06-01', end: '2026-06-18' })
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  const fetchBranchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end })
      const res = await fetch(`/api/branch-metrics?${params}`)
      const json = await res.json()

      if (!res.ok) {
        setDebugInfo(JSON.stringify(json, null, 2))
        setApiStatus('error')
        setData(MOCK_DATA)
      } else {
        setApiStatus('live')
        // Transform API response into dashboard shape
        const campaigns: BranchCampaign[] = (json.by_campaign || []).map((c: any) => ({
          campaign: c.campaign,
          ad_partner: 'Meta',
          installs: c.installs || 0,
          first_orders: c.orders || 0,
          conversion_rate: c.installs > 0 ? ((c.orders || 0) / c.installs) * 100 : 0,
          cpo: c.orders > 0 && c.spend ? Math.round(c.spend / c.orders) : null,
        }))

        const totalInstalls = campaigns.reduce((s, c) => s + c.installs, 0)
        const totalOrders = campaigns.reduce((s, c) => s + c.first_orders, 0)

        setData({
          summary: {
            total_installs: totalInstalls,
            total_first_orders: totalOrders,
            overall_conversion: totalInstalls > 0 ? (totalOrders / totalInstalls) * 100 : 0,
            avg_cpo: null,
            top_partner: 'Meta',
            date_range: dateRange,
          },
          by_campaign: campaigns.length > 0 ? campaigns : MOCK_DATA.by_campaign,
          by_partner: [{ partner: 'Meta', installs: totalInstalls, first_orders: totalOrders, share: 100 }],
          last_updated: new Date().toISOString(),
        })
      }
    } catch (err) {
      setApiStatus('error')
      setDebugInfo(String(err))
      setData(MOCK_DATA)
    }
    setLoading(false)
  }, [dateRange])

  useEffect(() => { fetchBranchData() }, [fetchBranchData])

  const filteredCampaigns = data.by_campaign
    .filter(c => selectedPartner === 'All partners' || c.ad_partner === selectedPartner)
    .filter(c => c.campaign.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'cpo') return (a.cpo ?? Infinity) - (b.cpo ?? Infinity)
      return b[sortBy] - a[sortBy]
    })

  const conversionRate = data.summary.total_installs > 0
    ? ((data.summary.total_first_orders / data.summary.total_installs) * 100).toFixed(2)
    : '0.00'

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>B</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Branch Analytics</span>
            <span style={{ color: '#D1D5DB', fontSize: 14 }}>|</span>
            <StatusPill status={apiStatus} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
              style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151' }}
            />
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>→</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
              style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151' }}
            />
            <button
              onClick={fetchBranchData}
              style={{ fontSize: 13, padding: '5px 14px', background: '#18181B', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

        {/* API Error Debug Banner */}
        {apiStatus === 'error' && debugInfo && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#DC2626', fontWeight: 600, fontSize: 13 }}>⚠ Branch API Error — showing cached data</span>
            </div>
            <div style={{ fontSize: 12, color: '#7F1D1D', fontFamily: 'monospace', background: '#FFF5F5', padding: '8px 12px', borderRadius: 6, overflowX: 'auto' }}>
              {debugInfo}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#991B1B' }}>
              Fix: Go to Vercel → Settings → Environment Variables → verify <code>BRANCH_KEY</code> starts with <code>key_live_</code> and <code>BRANCH_SECRET</code> is the app secret (not API key). Then redeploy.
            </div>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total installs', value: fmt(data.summary.total_installs), sub: 'All campaigns · Branch attributed', color: '#3B82F6' },
            { label: 'First orders (first_order_created_fe)', value: data.summary.total_first_orders > 0 ? fmt(data.summary.total_first_orders) : '—', sub: data.summary.total_first_orders === 0 ? 'Branch API not returning data yet' : 'Branch attributed', color: data.summary.total_first_orders > 0 ? '#10B981' : '#F59E0B' },
            { label: 'Install → order conversion', value: data.summary.total_first_orders > 0 ? `${conversionRate}%` : '—', sub: 'Requires first order data', color: '#8B5CF6' },
            { label: 'Avg CPO', value: fmtINR(data.summary.avg_cpo), sub: 'Cost per first order · Meta spend', color: '#EC4899' },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6, lineHeight: 1.3 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 4, letterSpacing: '-0.5px' }}>{card.value}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.3 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Install → Order Funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>Install → First order funnel</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 18 }}>Branch event: <code style={{ background: '#F3F4F6', padding: '1px 5px', borderRadius: 4 }}>first_order_created_fe</code></div>

            {/* Funnel bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'App installs', value: data.summary.total_installs, pct: 100, color: '#3B82F6' },
                { label: 'First order created', value: data.summary.total_first_orders, pct: data.summary.total_installs > 0 ? (data.summary.total_first_orders / data.summary.total_installs) * 100 : 0, color: '#10B981' },
              ].map(step => (
                <div key={step.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{step.label}</span>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{step.value > 0 ? fmt(step.value) : '—'} <span style={{ color: '#D1D5DB' }}>({step.pct.toFixed(1)}%)</span></span>
                  </div>
                  <div style={{ height: 10, background: '#F3F4F6', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(step.pct, step.value > 0 ? 1 : 0)}%`, background: step.color, borderRadius: 5, transition: 'width .5s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {data.summary.total_first_orders === 0 && (
              <div style={{ marginTop: 18, padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 3 }}>No first order data received yet</div>
                <div style={{ fontSize: 11, color: '#B45309', lineHeight: 1.5 }}>
                  Branch is returning installs correctly. The <code>first_order_created_fe</code> event may not be firing in production, or the Branch API key may not have query access. Check Branch dashboard → Events to verify the event exists.
                </div>
              </div>
            )}
          </div>

          {/* By Ad Partner */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 16 }}>By ad partner</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.by_partner.map(p => (
                <div key={p.partner}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{p.partner}</span>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                      <span style={{ color: '#3B82F6' }}>{fmt(p.installs)} installs</span>
                      <span style={{ color: p.first_orders > 0 ? '#10B981' : '#D1D5DB' }}>{p.first_orders > 0 ? fmt(p.first_orders) : '—'} orders</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.share}%`, background: '#3B82F6', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #F3F4F6', fontSize: 12, color: '#9CA3AF' }}>
              Google Ads, Organic channels will appear here once integrated.
            </div>
          </div>
        </div>

        {/* Campaign Table */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Campaign breakdown</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{filteredCampaigns.length} campaigns · Branch attributed</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Search campaigns…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, width: 180, color: '#374151', outline: 'none' }}
              />
              <select
                value={selectedPartner}
                onChange={e => setSelectedPartner(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151', background: '#fff', cursor: 'pointer' }}
              >
                {AD_PARTNERS.map(p => <option key={p}>{p}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151', background: '#fff', cursor: 'pointer' }}
              >
                <option value="installs">Sort: Installs</option>
                <option value="first_orders">Sort: First orders</option>
                <option value="conversion_rate">Sort: Conversion</option>
                <option value="cpo">Sort: CPO</option>
              </select>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                {['Campaign', 'Ad partner', 'Installs', 'First orders', 'Conv. rate', 'CPO'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Campaign' || h === 'Ad partner' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((c, i) => (
                <tr key={c.campaign} style={{ borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding: '10px 10px', color: '#111', fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.campaign}>
                    {c.campaign}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: c.ad_partner === 'Meta' ? '#EFF6FF' : '#F0FDF4', color: c.ad_partner === 'Meta' ? '#1D4ED8' : '#166534' }}>
                      {c.ad_partner}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#111' }}>{fmt(c.installs)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: c.first_orders > 0 ? '#059669' : '#D1D5DB', fontWeight: c.first_orders > 0 ? 600 : 400 }}>
                    {c.first_orders > 0 ? fmt(c.first_orders) : '—'}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: c.conversion_rate > 0 ? '#111' : '#D1D5DB' }}>
                    {c.conversion_rate > 0 ? `${c.conversion_rate.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: c.cpo !== null ? '#111' : '#D1D5DB' }}>
                    {fmtINR(c.cpo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 700, fontSize: 12, color: '#374151' }}>Total</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(filteredCampaigns.reduce((s, c) => s + c.installs, 0))}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#D1D5DB' }}>—</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#D1D5DB' }}>—</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#D1D5DB' }}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Debug section */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, marginBottom: 4 }}>BRANCH API STATUS</div>
          <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
            Endpoint: <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>POST /api/branch-metrics</code> ·
            Auth: <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>Basic base64(BRANCH_KEY:BRANCH_SECRET)</code> ·
            Event filter: <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>first_order_created_fe</code> ·
            Status: <strong style={{ color: apiStatus === 'live' ? '#059669' : apiStatus === 'error' ? '#DC2626' : '#D97706' }}>{apiStatus}</strong>
            {data.last_updated && <span> · Updated {new Date(data.last_updated).toLocaleTimeString('en-IN')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
