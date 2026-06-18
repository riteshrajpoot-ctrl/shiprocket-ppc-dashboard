'use client'

import { useState, useEffect, useCallback } from 'react'

interface Campaign {
  campaign: string
  ad_partner: string
  installs: number
  orders: number
  conversion_rate?: number | null
}

interface Partner {
  partner: string
  installs: number
  orders: number
}

interface BranchData {
  total_orders: number
  total_installs: number
  by_campaign: Campaign[]
  by_partner: Partner[]
  date_range: { start: string; end: string }
}

const PARTNER_COLORS: Record<string, string> = {
  'Facebook': '#1877F2',
  'Google AdWords': '#34A853',
  'Apple Search Ads': '#555555',
  'Vfine Ads': '#FF6B35',
  'My Boors Media 1': '#8B5CF6',
  'WingAds (Hong Kong) Technology Co., Limited': '#EC4899',
  'ApplabsMedia': '#F59E0B',
  'Adtiming': '#06B6D4',
  'adzone': '#84CC16',
  'Mobplus': '#6366F1',
  'Nasimobi Technology': '#14B8A6',
  '(organic)': '#9CA3AF',
  'Organic/Direct': '#9CA3AF',
}

function getPartnerColor(partner: string) {
  return PARTNER_COLORS[partner] || '#6B7280'
}

function fmt(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString('en-IN')
}

function PartnerBadge({ partner }: { partner: string }) {
  const color = getPartnerColor(partner)
  const label = partner === '(organic)' ? 'Organic' : partner === '(not set)' ? 'Not set' : partner
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
      background: color + '18', color: color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export default function BranchDashboard() {
  const [data, setData] = useState<BranchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('2026-06-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'installs' | 'orders' | 'conversion_rate'>('orders')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/branch-metrics?start_date=${startDate}&end_date=${endDate}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || json.error || 'API error')
      setData(json)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  // Get unique partners from data
  const allPartners = data
    ? ['All', ...Array.from(new Set(data.by_campaign.map(c => c.ad_partner))).sort()]
    : ['All']

  const filtered = (data?.by_campaign || [])
    .filter(c => partnerFilter === 'All' || c.ad_partner === partnerFilter)
    .filter(c => c.campaign.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'conversion_rate') {
        return (b.conversion_rate || 0) - (a.conversion_rate || 0)
      }
      return b[sortBy] - a[sortBy]
    })

  const conversionRate = data && data.total_installs > 0
    ? ((data.total_orders / data.total_installs) * 100).toFixed(2)
    : '0.00'

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>B</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Branch Analytics</span>
          <span style={{ color: '#D1D5DB' }}>|</span>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
            background: loading ? '#FEF3C7' : error ? '#FEE2E2' : '#D1FAE5',
            color: loading ? '#92400E' : error ? '#991B1B' : '#065F46',
          }}>
            {loading ? 'Loading…' : error ? 'API Error' : 'Live'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151' }} />
          <span style={{ color: '#9CA3AF' }}>→</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 6, color: '#374151' }} />
          <button onClick={fetchData} style={{ fontSize: 13, padding: '5px 16px', background: '#18181B', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#DC2626' }}>
            ⚠ {error}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total installs', value: loading ? '…' : fmt(data?.total_installs || 0), sub: 'All channels · Branch attributed' },
            { label: 'First orders (first_order_created_fe)', value: loading ? '…' : fmt(data?.total_orders || 0), sub: 'Branch attributed', color: '#059669' },
            { label: 'Install → order conversion', value: loading ? '…' : `${conversionRate}%`, sub: 'Across all channels' },
            { label: 'Top channel by orders', value: loading ? '…' : (data?.by_partner[0]?.partner || '—'), sub: loading ? '' : `${fmt(data?.by_partner[0]?.orders || 0)} first orders` },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6, lineHeight: 1.3 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: (card as any).color || '#111', marginBottom: 4 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Partner breakdown + Funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 24 }}>
          {/* Funnel */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 16 }}>Install → First order funnel</div>
            {[
              { label: 'App installs', value: data?.total_installs || 0, pct: 100, color: '#3B82F6' },
              { label: 'First order created', value: data?.total_orders || 0, pct: data && data.total_installs > 0 ? (data.total_orders / data.total_installs) * 100 : 0, color: '#10B981' },
            ].map(step => (
              <div key={step.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{step.label}</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    <strong style={{ color: '#111' }}>{loading ? '…' : fmt(step.value)}</strong>
                    <span style={{ color: '#D1D5DB' }}> ({step.pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div style={{ height: 10, background: '#F3F4F6', borderRadius: 5 }}>
                  <div style={{ height: '100%', width: `${Math.min(step.pct * (step.label === 'First order created' ? 5 : 1), 100)}%`, background: step.color, borderRadius: 5, transition: 'width .5s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* By partner */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 14 }}>First orders by partner</div>
            {loading ? (
              <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(data?.by_partner || []).filter(p => p.orders > 0).slice(0, 8).map(p => (
                  <div key={p.partner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#111', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.partner}>
                        {p.partner === '(organic)' ? 'Organic/Direct' : p.partner}
                      </span>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>
                        <strong style={{ color: getPartnerColor(p.partner) }}>{fmt(p.orders)}</strong>
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                      <div style={{
                        height: '100%',
                        width: `${data?.total_orders ? (p.orders / data.total_orders) * 100 : 0}%`,
                        background: getPartnerColor(p.partner),
                        borderRadius: 3,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Campaign Table */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Campaign breakdown</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{filtered.length} campaigns · Branch attributed</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, width: 200, outline: 'none' }} />
              <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                {allPartners.map(p => <option key={p} value={p}>{p === '(organic)' ? 'Organic' : p}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                <option value="orders">Sort: First orders</option>
                <option value="installs">Sort: Installs</option>
                <option value="conversion_rate">Sort: Conv. rate</option>
              </select>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                {['Campaign', 'Ad partner', 'Installs', 'First orders', 'Conv. rate'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Campaign' || h === 'Ad partner' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading Branch data…</td></tr>
              ) : filtered.map((c, i) => (
                <tr key={`${c.campaign}${c.ad_partner}`} style={{ borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding: '10px 10px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: '#111' }} title={c.campaign}>
                    {c.campaign === '(not set)' ? <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Not set</span> : c.campaign}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <PartnerBadge partner={c.ad_partner} />
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: c.installs > 0 ? '#374151' : '#D1D5DB' }}>
                    {c.installs > 0 ? fmt(c.installs) : '—'}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: c.orders > 0 ? 700 : 400, color: c.orders > 0 ? '#059669' : '#D1D5DB' }}>
                    {c.orders > 0 ? fmt(c.orders) : '—'}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: c.conversion_rate ? '#111' : '#D1D5DB' }}>
                    {c.conversion_rate ? `${c.conversion_rate}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F9FAFB', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '10px 10px', fontSize: 12 }}>Total</td>
                <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmt(filtered.reduce((s, c) => s + c.installs, 0))}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#059669' }}>{fmt(filtered.reduce((s, c) => s + c.orders, 0))}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#9CA3AF' }}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Status bar */}
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 11, color: '#9CA3AF' }}>
          Endpoint: POST /api/branch-metrics · Event: first_order_created_fe ·
          Status: <strong style={{ color: error ? '#DC2626' : loading ? '#D97706' : '#059669' }}>{loading ? 'loading' : error ? 'error' : 'live'}</strong>
          {data && !loading && <span> · Updated {new Date().toLocaleTimeString('en-IN')}</span>}
        </div>
      </div>
    </div>
  )
}
