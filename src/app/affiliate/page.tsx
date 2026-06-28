'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Signal { type: string; severity: 'high' | 'medium' | 'low'; msg: string }
interface Campaign { campaign: string; clicks: number; installs: number; orders: number; cti: number | null; cvr: number | null }
interface Partner {
  partner: string; clicks: number; installs: number; orders: number
  cti: number | null; cvr: number | null
  risk_score: number; risk_level: 'High' | 'Medium' | 'Low'
  signals: Signal[]; campaigns: Campaign[]
  cann_score: number; cann_level: 'High' | 'Medium' | 'Low'
  cann_signals: { msg: string; type: 'critical' | 'warning' | 'ok' }[]
  cann_action: string
  estimated_paid: number; estimated_wasted: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtN = (n: number) => n.toLocaleString('en-IN')

const partnerColor = (partner: string): string => {
  const colors: Record<string, string> = {
    'vfine': '#7C3AED', 'boors': '#059669', 'nasimobi': '#2563EB',
    'adtiming': '#D97706', 'wing': '#DC2626', 'mobplus': '#0891B2',
    'dipper': '#9333EA', 'applabes': '#059669', 'adzone': '#6B7280',
  }
  const pl = partner.toLowerCase()
  for (const [key, color] of Object.entries(colors)) { if (pl.includes(key)) return color }
  return '#6366F1'
}

const riskConfig = {
  High: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#DC2626' },
  Medium: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  Low: { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', dot: '#059669' },
}

const severityConfig = {
  high: { color: '#DC2626', bg: '#FEF2F2', label: '🔴 High' },
  medium: { color: '#D97706', bg: '#FFFBEB', label: '🟡 Medium' },
  low: { color: '#059669', bg: '#ECFDF5', label: '🟢 Low' },
}

function Sk({ h = 14 }: { h?: number }) {
  return <div style={{ height: h, background: '#F1F5F9', borderRadius: 4, marginBottom: 6 }} />
}

// ── Fraud type explainer ──────────────────────────────────────────────────────
const FRAUD_TYPES = [
  { name: 'Click Injection', icon: '💉', color: '#DC2626', desc: 'Fake app fires a click just before install to steal attribution credit.', signal: 'CTI > 80% or CTI suspiciously high' },
  { name: 'Click Flooding', icon: '🌊', color: '#D97706', desc: 'Sending millions of fake clicks so one is guaranteed before any install.', signal: 'CTI < 0.5% (too many clicks, few installs)' },
  { name: 'SDK Spoofing', icon: '👻', color: '#7C3AED', desc: 'Faking install signals without a real device or real user.', signal: 'CVR > 80% (unrealistically high)' },
  { name: 'Device Farms', icon: '🏭', color: '#6B7280', desc: 'Warehouses of real phones bulk installing apps to earn affiliate pay.', signal: 'Zero orders from hundreds of installs' },
]

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AffiliatePage() {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [dateStart, setDateStart] = useState(fmtDate(monthStart))
  const [dateEnd, setDateEnd] = useState(fmtDate(today))
  const [loading, setLoading] = useState(true)
  const [partners, setPartners] = useState<Partner[]>([])
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'fraud' | 'cannibalization'>('overview')
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/affiliate-fraud?start_date=${dateStart}&end_date=${dateEnd}`)
      const data = await res.json()
      setPartners(data.partners || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [dateStart, dateEnd])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived totals
  const totalClicks = partners.reduce((a, p) => a + p.clicks, 0)
  const totalInstalls = partners.reduce((a, p) => a + p.installs, 0)
  const totalOrders = partners.reduce((a, p) => a + p.orders, 0)
  const avgCTI = totalClicks > 0 ? ((totalInstalls / totalClicks) * 100).toFixed(2) : '—'
  const highRisk = partners.filter(p => p.risk_level === 'High').length
  const totalSignals = partners.reduce((a, p) => a + p.signals.length, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'Inter, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '.5px solid #E5E7EB', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>A</span>
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Affiliate Engine</span>
            <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>Performance + Fraud detection · Branch attributed</span>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 20, borderBottom: 'none' }}>
            {[{ id: 'overview', label: '📊 Performance' }, { id: 'fraud', label: '🛡️ Fraud detection' }, { id: 'cannibalization', label: '⚠️ Cannibalization' }].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{
                padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: activeTab === t.id ? 600 : 400,
                background: activeTab === t.id ? '#111827' : 'transparent',
                color: activeTab === t.id ? '#fff' : '#6B7280', cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            style={{ padding: '5px 8px', border: '.5px solid #E5E7EB', borderRadius: 6, fontSize: 12, color: '#374151', background: '#F9FAFB' }} />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>to</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            style={{ padding: '5px 8px', border: '.5px solid #E5E7EB', borderRadius: 6, fontSize: 12, color: '#374151', background: '#F9FAFB' }} />
          <button onClick={fetchData} disabled={loading} style={{ padding: '5px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>

        {/* ── PERFORMANCE TAB ── */}
        {activeTab === 'overview' && (
          <>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total clicks', value: loading ? null : fmtN(totalClicks), sub: 'Branch tracked', color: '#6366F1' },
                { label: 'Total installs', value: loading ? null : fmtN(totalInstalls), sub: 'All affiliates', color: '#059669' },
                { label: 'First orders', value: loading ? null : fmtN(totalOrders), sub: 'Converted users', color: '#2563EB' },
                { label: 'Avg CTI rate', value: loading ? null : `${avgCTI}%`, sub: 'Click → install', color: Number(avgCTI) > 2 ? '#059669' : '#D97706' },
                { label: 'Active partners', value: loading ? null : String(partners.length), sub: `${highRisk} high risk`, color: highRisk > 0 ? '#DC2626' : '#059669' },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6 }}>{k.label}</div>
                  {k.value === null ? <><Sk h={20} /><Sk /></> : (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>{k.sub}</div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Partner cards */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Partner performance</div>
              {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 16, height: 160 }}><Sk /></div>)}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {partners.map(p => {
                    const color = partnerColor(p.partner)
                    const rc = riskConfig[p.risk_level]
                    const isExp = expandedPartner === p.partner
                    return (
                      <div key={p.partner} style={{ background: '#fff', border: `.5px solid ${rc.border}`, borderRadius: 12, padding: 16, transition: 'all 0.15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color }}>{p.partner.charAt(0).toUpperCase()}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.partner}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color, border: `.5px solid ${rc.border}` }}>
                              {p.risk_level} risk
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                          {[
                            { label: 'Clicks', value: fmtN(p.clicks), color: '#6366F1' },
                            { label: 'Installs', value: fmtN(p.installs), color: '#059669' },
                            { label: 'Orders', value: fmtN(p.orders), color: '#2563EB' },
                          ].map(m => (
                            <div key={m.label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 2 }}>{m.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 8px' }}>
                            <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 2 }}>CTI rate</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: p.cti !== null ? (p.cti < 2 ? '#DC2626' : p.cti > 80 ? '#DC2626' : '#059669') : '#9CA3AF' }}>
                              {p.cti !== null ? `${p.cti}%` : '—'}
                            </div>
                          </div>
                          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 8px' }}>
                            <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 2 }}>CVR</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: p.cvr !== null ? (p.cvr < 1 ? '#DC2626' : p.cvr >= 15 ? '#059669' : '#D97706') : '#9CA3AF' }}>
                              {p.cvr !== null ? `${p.cvr}%` : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Risk score bar */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Fraud risk score</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: rc.color }}>{p.risk_score}/100</span>
                          </div>
                          <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${p.risk_score}%`, height: '100%', background: rc.color, borderRadius: 2, transition: 'width 0.5s' }} />
                          </div>
                        </div>

                        {p.signals.length > 0 && (
                          <button onClick={() => setExpandedPartner(isExp ? null : p.partner)}
                            style={{ width: '100%', padding: '5px 0', border: `.5px solid ${rc.border}`, borderRadius: 6, background: rc.bg, color: rc.color, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                            {isExp ? 'Hide' : `View ${p.signals.length} signal${p.signals.length > 1 ? 's' : ''}`} →
                          </button>
                        )}

                        {isExp && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            {p.signals.map((s, i) => (
                              <div key={i} style={{ background: severityConfig[s.severity].bg, borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: severityConfig[s.severity].color }}>{severityConfig[s.severity].label} · {s.type}</div>
                                <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>{s.msg}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Campaign breakdown table */}
            <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Campaign breakdown</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 14 }}>Click → Install → Order funnel per campaign · sorted by installs</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '.5px solid #F3F4F6', background: '#F9FAFB' }}>
                      {['Campaign', 'Partner', 'Clicks', 'Installs', 'Orders', 'CTI', 'CVR', 'Signal'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Signal' ? 'center' : 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', ...(h === 'Campaign' || h === 'Partner' ? { textAlign: 'left' } : {}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={8} style={{ padding: 8 }}><Sk /></td></tr>
                    )) : partners.flatMap(p =>
                      p.campaigns.map((c, i) => {
                        const color = partnerColor(p.partner)
                        const rc = riskConfig[p.risk_level]
                        let sig = ''; let sigColor = '#9CA3AF'; let sigBg = '#F9FAFB'
                        if (c.cti !== null && c.cti < 0.5) { sig = 'Click flood'; sigColor = '#DC2626'; sigBg = '#FEF2F2' }
                        else if (c.cti !== null && c.cti > 80) { sig = 'Click inject'; sigColor = '#DC2626'; sigBg = '#FEF2F2' }
                        else if (c.cvr === 0 && c.installs > 50) { sig = 'Device farm'; sigColor = '#D97706'; sigBg = '#FFFBEB' }
                        else if (c.cvr !== null && c.cvr > 80) { sig = 'SDK spoof'; sigColor = '#7C3AED'; sigBg = '#F5F3FF' }
                        else if (c.cvr !== null && c.cvr >= 15) { sig = 'Good'; sigColor = '#059669'; sigBg = '#ECFDF5' }
                        return (
                          <tr key={`${p.partner}-${i}`} style={{ borderBottom: '.5px solid #F9FAFB' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{ padding: '8px 10px', maxWidth: 200 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{c.campaign}</span>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '15', padding: '2px 7px', borderRadius: 20 }}>{p.partner}</span>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>{c.clicks > 0 ? fmtN(c.clicks) : '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>{c.installs > 0 ? fmtN(c.installs) : '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: c.orders > 0 ? '#059669' : '#9CA3AF' }}>{c.orders > 0 ? fmtN(c.orders) : '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: c.cti !== null ? (c.cti < 2 ? '#DC2626' : '#059669') : '#9CA3AF' }}>
                              {c.cti !== null ? `${c.cti.toFixed(1)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: c.cvr !== null ? (c.cvr < 1 ? '#DC2626' : c.cvr >= 15 ? '#059669' : '#D97706') : '#9CA3AF' }}>
                              {c.cvr !== null ? `${c.cvr.toFixed(1)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              {sig && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: sigBg, color: sigColor }}>{sig}</span>}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── FRAUD DETECTION TAB ── */}
        {activeTab === 'fraud' && (
          <>
            {/* 4 fraud types explainer */}
            <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4, textAlign: 'center' }}>4 types of fraud Branch catches automatically</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 16, textAlign: 'center' }}>Branch blocks all 4 using device signals + timing analysis. Blocked installs are not sent as postbacks.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {FRAUD_TYPES.map(f => (
                  <div key={f.name} style={{ border: `1px solid ${f.color}30`, borderRadius: 10, padding: '12px 14px', background: f.color + '05' }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>{f.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: f.color, marginBottom: 6 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8, lineHeight: 1.5 }}>{f.desc}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: f.color, background: f.color + '10', padding: '4px 8px', borderRadius: 6 }}>Signal: {f.signal}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 500 }}>
                  Branch blocks all 4 automatically · Blocked installs are NOT sent as postbacks → you don't pay for fraud
                </span>
              </div>
            </div>

            {/* Fraud summary per partner */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Risk assessment per partner — {totalSignals} signals detected
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 16, height: 80 }}><Sk /></div>) :
                  partners.map(p => {
                    const rc = riskConfig[p.risk_level]
                    const color = partnerColor(p.partner)
                    return (
                      <div key={p.partner} style={{ background: '#fff', border: `.5px solid ${rc.border}`, borderRadius: 12, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          {/* Partner info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color }}>{p.partner.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.partner}</div>
                              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtN(p.installs)} installs · {fmtN(p.clicks)} clicks</div>
                            </div>
                          </div>

                          {/* Risk score */}
                          <div style={{ minWidth: 120 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: rc.dot }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: rc.color }}>{p.risk_level} Risk</span>
                              <span style={{ fontSize: 11, color: '#9CA3AF' }}>{p.risk_score}/100</span>
                            </div>
                            <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden', width: 120 }}>
                              <div style={{ width: `${p.risk_score}%`, height: '100%', background: rc.color, borderRadius: 2 }} />
                            </div>
                          </div>

                          {/* CTI + CVR */}
                          <div style={{ display: 'flex', gap: 16, minWidth: 140 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>CTI rate</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: p.cti !== null ? (p.cti < 2 ? '#DC2626' : '#059669') : '#9CA3AF' }}>
                                {p.cti !== null ? `${p.cti}%` : '—'}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>CVR</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: p.cvr !== null ? (p.cvr < 1 ? '#DC2626' : '#059669') : '#9CA3AF' }}>
                                {p.cvr !== null ? `${p.cvr}%` : '—'}
                              </div>
                            </div>
                          </div>

                          {/* Signals */}
                          <div style={{ flex: 1 }}>
                            {p.signals.length === 0 ? (
                              <span style={{ fontSize: 11, color: '#059669', background: '#ECFDF5', padding: '4px 10px', borderRadius: 20, fontWeight: 500 }}>✓ No fraud signals detected</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {p.signals.map((s, i) => (
                                  <div key={i} style={{ background: severityConfig[s.severity].bg, borderRadius: 6, padding: '4px 10px' }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: severityConfig[s.severity].color }}>{severityConfig[s.severity].label} · {s.type}</span>
                                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{s.msg}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Action */}
                          {p.risk_level === 'High' && (
                            <div style={{ flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', padding: '6px 12px', borderRadius: 8, border: '.5px solid #FECACA' }}>
                                ⚠️ Pause & investigate
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Red flags reference */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 12 }}>🚩 Red flags to watch monthly — especially for affiliates</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  'Install spike from a partner with zero first orders → likely device farm or SDK spoofing',
                  'Click-to-install time under 10 seconds → click injection. Real users take 30s+ to install',
                  'Same city/IP sending 100s of installs in 1 hour → bot traffic or device farm',
                  'Fraud rate above 15% on any partner → pause and investigate before spending more',
                  'CTI below 0.5% → click flooding, partner sending fake clicks in bulk',
                  'CVR above 80% → SDK spoofing, installs being faked without real users',
                ].map((flag, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                    <span style={{ color: '#D97706', flexShrink: 0 }}>→</span>
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#92400E' }}>For deeper fraud analysis — check Branch Fraud Dashboard and Suspicious Clusters tab</span>
                <a href="https://dashboard.branch.io" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', textDecoration: 'none', background: '#EFF6FF', padding: '5px 12px', borderRadius: 6, border: '.5px solid #BFDBFE' }}>
                  Open Branch Fraud Dashboard ↗
                </a>
              </div>
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 16 }}>
          Data: Branch attribution · Clicks, installs and orders via Branch Query API · Risk scores calculated from CTI and CVR signals
        </div>
      </div>

      {/* ── CANNIBALIZATION TAB ── */}
      {activeTab === 'cannibalization' && (
        <>
          {/* Explainer */}
          <div style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 6 }}>What is cannibalization in affiliate?</div>
            <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 12 }}>
              On a CPO model, affiliates get paid only when a first order happens. Fraudulent affiliates send millions of fake clicks so that when a user — who was already going to install via Meta or organic — opens the app, Branch attributes the order to them. You pay ₹500 for an order that was already going to happen.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'CTI < 0.5%', desc: 'Mass fake clicks to steal attribution', risk: 'Critical', color: '#DC2626', bg: '#FEF2F2' },
                { label: 'CVR > 40%', desc: 'Users were already converting from other channels', risk: 'Critical', color: '#DC2626', bg: '#FEF2F2' },
                { label: 'CTI 0.5–2%', desc: 'Sub-publisher click inflation — monitor', risk: 'Watch', color: '#D97706', bg: '#FFFBEB' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.color, marginBottom: 4 }}>{c.label} → {c.risk}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-partner cannibalization assessment */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Cannibalization risk per partner
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ background: '#fff', border: '.5px solid #E5E7EB', borderRadius: 12, padding: 16, height: 100 }}><Sk /></div>
              )) : [...partners].sort((a, b) => b.cann_score - a.cann_score).map(p => {
                const rc = riskConfig[p.cann_level]
                const color = partnerColor(p.partner)
                return (
                  <div key={p.partner} style={{ background: '#fff', border: `.5px solid ${rc.border}`, borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      {/* Partner */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{p.partner.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.partner}</div>
                          <div style={{ fontSize: 10, color: '#9CA3AF' }}>Paying ₹{(p.estimated_paid / 1000).toFixed(0)}K/month</div>
                        </div>
                      </div>

                      {/* Score */}
                      <div style={{ minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: rc.dot }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: rc.color }}>{p.cann_level} risk</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{p.cann_score}/100</span>
                        </div>
                        <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden', width: 140 }}>
                          <div style={{ width: `${p.cann_score}%`, height: '100%', background: rc.color, borderRadius: 2 }} />
                        </div>
                      </div>

                      {/* CTI + CVR */}
                      <div style={{ display: 'flex', gap: 16, minWidth: 140 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>CTI rate</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: p.cti !== null ? (p.cti < 2 ? '#DC2626' : '#059669') : '#9CA3AF' }}>
                            {p.cti !== null ? `${p.cti}%` : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>CVR</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: p.cvr !== null ? (p.cvr > 40 ? '#DC2626' : p.cvr >= 5 ? '#059669' : '#D97706') : '#9CA3AF' }}>
                            {p.cvr !== null ? `${p.cvr}%` : '—'}
                          </div>
                        </div>
                        {p.estimated_wasted > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>Est. wasted</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#DC2626' }}>₹{(p.estimated_wasted / 1000).toFixed(0)}K</div>
                          </div>
                        )}
                      </div>

                      {/* Signals */}
                      <div style={{ flex: 1 }}>
                        {p.cann_signals.map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, flexShrink: 0 }}>{s.type === 'critical' ? '🔴' : s.type === 'warning' ? '🟡' : '🟢'}</span>
                            <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{s.msg}</span>
                          </div>
                        ))}
                      </div>

                      {/* Action */}
                      <div style={{ flexShrink: 0 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                          background: p.cann_level === 'High' ? '#FEF2F2' : p.cann_level === 'Medium' ? '#FFFBEB' : '#ECFDF5',
                          color: p.cann_level === 'High' ? '#DC2626' : p.cann_level === 'Medium' ? '#D97706' : '#059669',
                          border: `.5px solid ${p.cann_level === 'High' ? '#FECACA' : p.cann_level === 'Medium' ? '#FDE68A' : '#A7F3D0'}`,
                          display: 'block', textAlign: 'center',
                        }}>{p.cann_action}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* How to act */}
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 10 }}>How to act on this</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { step: '1. Pause high-risk partners first', desc: 'Remove My Boors, WingAds from your affiliate program temporarily. Measure if your organic first orders increase — if they do, the cannibalization is confirmed.' },
                { step: '2. Ask for sub-publisher breakdown', desc: 'Request campaign-level click data from the partner. Specific sub-publishers are often the bad actors, not the entire network.' },
                { step: '3. Set CTI thresholds in Branch', desc: 'In Branch Fraud Manager, enable "Low Conversion CTI" rule with a 2% minimum. Any partner below this gets auto-blocked.' },
                { step: '4. Negotiate incrementality test', desc: 'Run a holdout test — pause the partner for 2 weeks, compare first orders. If orders don\'t drop, they were fully cannibalizing.' },
              ].map(a => (
                <div key={a.step} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '.5px solid #FDE68A' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>{a.step}</div>
                  <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.5 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
