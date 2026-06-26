'use client'
import { useState, useEffect } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
interface Ad {
  ad_id: string
  ad_name: string
  campaign_name: string
  adset_name: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  installs: number | null
  cpi: number | null
  creative_body: string
  creative_title: string
  placement: string
  objective: string
  audience_type: string
}

interface CreativeDimensions {
  hook_strategy: string
  script_tone: string
  setting: string
  financial_incentive: string
  language: string
  ad_side: 'SUPPLY' | 'DEMAND'
}

interface AdWithDimensions extends Ad {
  dimensions: CreativeDimensions | null
  analysing: boolean
}

interface Cell {
  key: string
  label: string
  placement: string
  objective: string
  audience_type: string
  ads: AdWithDimensions[]
}

interface DimensionInsight {
  dimension: string
  value: string
  avg_ctr: number
  avg_cpi: number
  ad_count: number
  score: number
  direction: 'USE' | 'AVOID' | 'TEST'
}

interface CellInsights {
  cellKey: string
  cellLabel: string
  insights: DimensionInsight[]
  hasEnoughData: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function inferPlacement(ad: Ad): string {
  const cn = (ad.campaign_name + ' ' + ad.adset_name).toLowerCase()
  if (cn.includes('reel') || cn.includes('reels')) return 'Instagram Reels'
  if (cn.includes('instagram') || cn.includes('ig')) return 'Instagram Feed'
  if (cn.includes('instream') || cn.includes('in-stream')) return 'FB In-stream'
  if (cn.includes('story') || cn.includes('stories')) return 'Stories'
  return 'Facebook Feed'
}

function inferObjective(ad: Ad): string {
  const cn = ad.campaign_name.toLowerCase()
  if (cn.includes('install') || cn.includes('app')) return 'App Promotion'
  if (cn.includes('retarget') || cn.includes('retarg')) return 'Retargeting'
  if (cn.includes('awareness') || cn.includes('reach')) return 'Awareness'
  return 'App Promotion'
}

function inferAudience(ad: Ad): string {
  const cn = (ad.campaign_name + ' ' + ad.adset_name).toLowerCase()
  if (cn.includes('broad') || cn.includes('advantage')) return 'Broad'
  if (cn.includes('custom') || cn.includes('lookalike') || cn.includes('lal')) return 'Custom/LAL'
  if (cn.includes('retarget')) return 'Retargeting'
  return 'Broad'
}

function cellKey(placement: string, objective: string, audience: string) {
  return `${placement}|${objective}|${audience}`
}

function computeScore(ctr: number, cpi: number, allCtrs: number[], allCpis: number[]): number {
  const avgCtr = allCtrs.reduce((a, b) => a + b, 0) / allCtrs.length
  const avgCpi = allCpis.filter(v => v > 0).reduce((a, b) => a + b, 0) / (allCpis.filter(v => v > 0).length || 1)
  const ctrScore = avgCtr > 0 ? (ctr - avgCtr) / avgCtr : 0
  const cpiScore = avgCpi > 0 ? (avgCpi - cpi) / avgCpi : 0
  return (ctrScore + cpiScore) / 2
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<'playbook' | 'script'>('playbook')

  // Playbook state
  const [ads, setAds] = useState<AdWithDimensions[]>([])
  const [cells, setCells] = useState<Cell[]>([])
  const [loadingAds, setLoadingAds] = useState(false)
  const [adsError, setAdsError] = useState('')
  const [analysingAll, setAnalysingAll] = useState(false)
  const [cellInsights, setCellInsights] = useState<CellInsights[]>([])
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [analyseProgress, setAnalyseProgress] = useState(0)

  // Script tab state
  const [objective, setObjective] = useState('')
  const [audience, setAudience] = useState('')
  const [offer, setOffer] = useState('')
  const [tone, setTone] = useState('Inspiring')
  const [refCreative, setRefCreative] = useState('')
  const [generating, setGenerating] = useState(false)
  const [variants, setVariants] = useState<any[]>([])
  const [copied, setCopied] = useState<number | null>(null)

  // ── Load ads ────────────────────────────────────────────────────────────────
  const loadAds = async () => {
    setLoadingAds(true)
    setAdsError('')
    setCells([])
    setCellInsights([])
    try {
      const res = await fetch('/api/ad-level-report')
      const data = await res.json()
      if (data.error) { setAdsError(data.error); setLoadingAds(false); return }

      const enriched: AdWithDimensions[] = (data.ads || []).map((ad: Ad) => ({
        ...ad,
        placement: inferPlacement(ad),
        objective: inferObjective(ad),
        audience_type: inferAudience(ad),
        dimensions: null,
        analysing: false,
      }))
      setAds(enriched)

      // Group into cells
      const cellMap: Record<string, AdWithDimensions[]> = {}
      enriched.forEach(ad => {
        const k = cellKey(ad.placement, ad.objective, ad.audience_type)
        if (!cellMap[k]) cellMap[k] = []
        cellMap[k].push(ad)
      })

      const builtCells: Cell[] = Object.entries(cellMap).map(([k, cellAds]) => {
        const [placement, objective, audience_type] = k.split('|')
        return {
          key: k,
          label: `${placement} · ${objective} · ${audience_type}`,
          placement,
          objective,
          audience_type,
          ads: cellAds,
        }
      }).sort((a, b) => b.ads.length - a.ads.length)

      setCells(builtCells)
    } catch (e: any) {
      setAdsError(e.message)
    }
    setLoadingAds(false)
  }

  // ── Analyse all ads in a cell ────────────────────────────────────────────────
  const analyseCell = async (cell: Cell) => {
    setAnalysingAll(true)
    setSelectedCell(cell.key)
    setAnalyseProgress(0)
    const total = cell.ads.length

    const results: AdWithDimensions[] = [...cell.ads]

    for (let i = 0; i < results.length; i++) {
      const ad = results[i]
      try {
        const res = await fetch('/api/extract-dimensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ad_name: ad.ad_name,
            creative_body: ad.creative_body,
            campaign_name: ad.campaign_name,
          }),
        })
        const data = await res.json()
        results[i] = { ...ad, dimensions: data.dimensions || null }
      } catch {
        results[i] = { ...ad, dimensions: null }
      }
      setAnalyseProgress(Math.round(((i + 1) / total) * 100))
    }

    // Update ads state
    setAds(prev => {
      const map: Record<string, AdWithDimensions> = {}
      results.forEach(r => { map[r.ad_id] = r })
      return prev.map(a => map[a.ad_id] || a)
    })

    // Compute insights for this cell
    const insights = computeInsights(results)
    setCellInsights(prev => {
      const filtered = prev.filter(c => c.cellKey !== cell.key)
      return [...filtered, { cellKey: cell.key, cellLabel: cell.label, insights, hasEnoughData: insights.length > 0 }]
    })

    setAnalysingAll(false)
  }

  // ── Compute dimension insights ───────────────────────────────────────────────
  function computeInsights(cellAds: AdWithDimensions[]): DimensionInsight[] {
    const adsWithDims = cellAds.filter(a => a.dimensions)
    if (adsWithDims.length < 2) return []

    const DIMENSIONS: (keyof CreativeDimensions)[] = [
      'hook_strategy', 'script_tone', 'setting', 'financial_incentive', 'language'
    ]
    const MIN_ADS = 5 // user chose stricter threshold

    const allCtrs = adsWithDims.map(a => parseFloat(a.ctr) || 0)
    const allCpis = adsWithDims.map(a => a.cpi || 0)

    const insights: DimensionInsight[] = []

    DIMENSIONS.forEach(dim => {
      const groups: Record<string, AdWithDimensions[]> = {}
      adsWithDims.forEach(ad => {
        const val = ad.dimensions![dim] as string
        if (!val || val === 'N/A' || val === 'None') return
        if (!groups[val]) groups[val] = []
        groups[val].push(ad)
      })

      Object.entries(groups).forEach(([val, grpAds]) => {
        if (grpAds.length < MIN_ADS) return
        const avg_ctr = grpAds.reduce((s, a) => s + (parseFloat(a.ctr) || 0), 0) / grpAds.length
        const cpiAds = grpAds.filter(a => a.cpi && a.cpi > 0)
        const avg_cpi = cpiAds.length > 0 ? cpiAds.reduce((s, a) => s + (a.cpi || 0), 0) / cpiAds.length : 0
        const score = computeScore(avg_ctr, avg_cpi, allCtrs, allCpis)
        const direction: 'USE' | 'AVOID' | 'TEST' =
          score > 0.15 ? 'USE' : score < -0.15 ? 'AVOID' : 'TEST'

        const dimLabel: Record<string, string> = {
          hook_strategy: 'Hook strategy',
          script_tone: 'Script tone',
          setting: 'Setting',
          financial_incentive: 'Financial incentive',
          language: 'Language',
        }

        insights.push({
          dimension: dimLabel[dim] || dim,
          value: val,
          avg_ctr: Math.round(avg_ctr * 100) / 100,
          avg_cpi: Math.round(avg_cpi),
          ad_count: grpAds.length,
          score: Math.round(score * 100),
          direction,
        })
      })
    })

    return insights.sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
  }

  // ── Script generation ────────────────────────────────────────────────────────
  const generateScript = async () => {
    if (!objective || !audience || !offer) return
    setGenerating(true)
    setVariants([])
    try {
      const res = await fetch('/api/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, audience, offer, tone, refCreative }),
      })
      const data = await res.json()
      setVariants(data.variants || [])
    } catch (e: any) {
      alert(e.message)
    }
    setGenerating(false)
  }

  const copyVariant = (idx: number, v: any) => {
    navigator.clipboard.writeText(`Hook: ${v.hook}\n\nBody: ${v.body}\n\nCTA: ${v.cta}`)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  const selectedInsights = cellInsights.find(c => c.cellKey === selectedCell)

  // ── Styles ───────────────────────────────────────────────────────────────────
  const s = {
    page: { fontFamily: 'var(--font-sans)', padding: '24px', maxWidth: '960px', margin: '0 auto' } as React.CSSProperties,
    h1: { fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' } as React.CSSProperties,
    sub: { fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px' } as React.CSSProperties,
    tabs: { display: 'flex', gap: '4px', borderBottom: '0.5px solid var(--border)', marginBottom: '24px' } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
      padding: '8px 16px', fontSize: '14px', fontWeight: active ? 500 : 400,
      color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
      borderBottom: active ? '2px solid var(--fill-accent)' : '2px solid transparent',
      background: 'none', border: 'none', cursor: 'pointer', marginBottom: '-1px',
    }),
    btn: { padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: 'var(--radius)', border: '0.5px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-primary)', cursor: 'pointer' } as React.CSSProperties,
    btnAccent: { padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: 'var(--radius)', border: 'none', background: 'var(--fill-accent)', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
    card: { background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '12px' } as React.CSSProperties,
    label: { fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '4px' },
    input: { width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' as const },
    pill: (dir: string): React.CSSProperties => ({
      display: 'inline-block', fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius)',
      background: dir === 'USE' ? 'var(--bg-success)' : dir === 'AVOID' ? 'var(--bg-danger)' : 'var(--bg-warning)',
      color: dir === 'USE' ? 'var(--text-success)' : dir === 'AVOID' ? 'var(--text-danger)' : 'var(--text-warning)',
    }),
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <h1 style={s.h1}>Creative intelligence</h1>
      <p style={s.sub}>Evidence-grade creative direction from your own Meta ad account data.</p>

      <div style={s.tabs}>
        <button style={s.tab(activeTab === 'playbook')} onClick={() => setActiveTab('playbook')}>
          Creative playbook
        </button>
        <button style={s.tab(activeTab === 'script')} onClick={() => setActiveTab('script')}>
          Script generator
        </button>
      </div>

      {/* ── PLAYBOOK TAB ── */}
      {activeTab === 'playbook' && (
        <div>
          {/* Step 1: Load ads */}
          {ads.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Pull your live Meta ads — they'll be grouped into controlled cells by placement, objective, and audience.
              </p>
              <button style={s.btnAccent} onClick={loadAds} disabled={loadingAds}>
                {loadingAds ? 'Loading ads…' : 'Load my ads'}
              </button>
              {adsError && <p style={{ color: 'var(--text-danger)', fontSize: '13px', marginTop: '12px' }}>{adsError}</p>}
            </div>
          )}

          {/* Step 2: Show cells */}
          {ads.length > 0 && cells.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  {ads.length} ads grouped into {cells.length} ad contexts
                </p>
                <button style={s.btn} onClick={loadAds}>Refresh</button>
              </div>

              {/* Cell list */}
              {cells.map(cell => {
                const insight = cellInsights.find(c => c.cellKey === cell.key)
                const isAnalysing = analysingAll && selectedCell === cell.key
                return (
                  <div key={cell.key} style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                          {cell.label}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                          {cell.ads.length} ads · {cell.ads.filter(a => a.dimensions).length} analysed
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isAnalysing && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Analysing… {analyseProgress}%
                          </span>
                        )}
                        {insight && (
                          <span style={{ fontSize: '12px', color: 'var(--text-success)' }}>
                            {insight.insights.length} insights
                          </span>
                        )}
                        <button
                          style={s.btn}
                          onClick={() => analyseCell(cell)}
                          disabled={analysingAll}
                        >
                          {insight ? 'Re-analyse' : 'Analyse →'}
                        </button>
                      </div>
                    </div>

                    {/* Insights for this cell */}
                    {insight && selectedCell === cell.key && (
                      <div style={{ marginTop: '16px', borderTop: '0.5px solid var(--border)', paddingTop: '16px' }}>
                        {insight.insights.length === 0 ? (
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                            Not enough data yet — need 5+ ads per dimension value to surface a validated insight.
                          </p>
                        ) : (
                          <>
                            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                              Creative playbook · {cell.label}
                            </p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Dimension</th>
                                  <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Value</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Avg CTR</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Avg CPI</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Ads</th>
                                  <th style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase' }}>Direction</th>
                                </tr>
                              </thead>
                              <tbody>
                                {insight.insights.map((ins, i) => (
                                  <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{ins.dimension}</td>
                                    <td style={{ padding: '8px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{ins.value}</td>
                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{ins.avg_ctr}%</td>
                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>
                                      {ins.avg_cpi > 0 ? `₹${ins.avg_cpi}` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{ins.ad_count}</td>
                                    <td style={{ padding: '8px 0', textAlign: 'center' }}>
                                      <span style={s.pill(ins.direction)}>{ins.direction}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Pre-fill script tab CTA */}
                            <div style={{ marginTop: '16px' }}>
                              <button
                                style={s.btnAccent}
                                onClick={() => {
                                  const useInsights = insight.insights.filter(i => i.direction === 'USE')
                                  if (useInsights.length > 0) {
                                    const brief = useInsights.map(i => `${i.dimension}: ${i.value}`).join(', ')
                                    setOffer(`Use these validated choices: ${brief}`)
                                    setActiveTab('script')
                                  }
                                }}
                              >
                                Generate brief from insights →
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SCRIPT TAB ── */}
      {activeTab === 'script' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <p style={s.label}>Campaign objective</p>
              <input
                style={s.input}
                placeholder="e.g. App installs — 3W partners"
                value={objective}
                onChange={e => setObjective(e.target.value)}
              />
            </div>
            <div>
              <p style={s.label}>Target audience</p>
              <input
                style={s.input}
                placeholder="e.g. 3-wheeler operators in Delhi NCR"
                value={audience}
                onChange={e => setAudience(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <p style={s.label}>Key offer / USP</p>
            <textarea
              style={{ ...s.input, minHeight: '72px', resize: 'vertical' }}
              placeholder="e.g. Earn ₹1500/day, flexible hours, no target pressure"
              value={offer}
              onChange={e => setOffer(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <p style={s.label}>Tone</p>
              <select style={s.input} value={tone} onChange={e => setTone(e.target.value)}>
                <option>Inspiring</option>
                <option>Urgent</option>
                <option>Friendly / Casual</option>
                <option>Direct / Bold</option>
              </select>
            </div>
            <div>
              <p style={s.label}>Reference creative (optional)</p>
              <input
                style={s.input}
                placeholder="Paste hook or copy you liked"
                value={refCreative}
                onChange={e => setRefCreative(e.target.value)}
              />
            </div>
          </div>

          <button
            style={{ ...s.btnAccent, marginBottom: '24px' }}
            onClick={generateScript}
            disabled={generating || !objective || !audience || !offer}
          >
            {generating ? 'Generating…' : 'Generate 3 variants →'}
          </button>

          {variants.length > 0 && (
            <div>
              {variants.map((v, i) => (
                <div key={i} style={{ ...s.card, position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Variant {v.variant}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{v.format}</span>
                      {v.angle && <span style={{ fontSize: '12px', color: 'var(--text-accent)' }}>· {v.angle}</span>}
                    </div>
                    <button
                      style={s.btn}
                      onClick={() => copyVariant(i, v)}
                    >
                      {copied === i ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div>
                      <p style={s.label}>Hook</p>
                      <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{v.hook}</p>
                    </div>
                    <div>
                      <p style={s.label}>Body</p>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>{v.body}</p>
                    </div>
                    <div>
                      <p style={s.label}>CTA</p>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{v.cta}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
