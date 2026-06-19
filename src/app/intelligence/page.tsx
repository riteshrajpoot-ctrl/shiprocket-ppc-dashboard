'use client'

import { useState } from 'react'

type Tab = 'competitor' | 'creative'

interface Ad {
  id: string
  page_name: string
  creative_body: string
  creative_title: string
  creative_link_caption: string
  ad_creative_link_captions: string[]
  ad_snapshot_url: string
  delivery_start_time: string
  impressions?: { lower_bound: string; upper_bound: string }
  spend?: { lower_bound: string; upper_bound: string }
  currency?: string
}

interface CreativeVariant {
  format: string
  hook: string
  body: string
  cta: string
  angle: string
}

interface Analysis {
  summary: string
  hooks: string[]
  offers: string[]
  formats: string[]
  ctas: string[]
  angles: string[]
  gaps: string[]
  recommendations: string[]
}

const COMPETITOR_PRESETS = [
  'Porter', 'Dunzo', 'Shadowfax', 'Lalamove', 'Borzo', 'Rapido', 'Loadshare'
]

export default function IntelligencePage() {
  const [tab, setTab] = useState<Tab>('competitor')

  // Competitor analysis state
  const [competitorName, setCompetitorName] = useState('')
  const [ads, setAds] = useState<Ad[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loadingAds, setLoadingAds] = useState(false)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [adError, setAdError] = useState('')

  // Script to creative state
  const [objective, setObjective] = useState('')
  const [audience, setAudience] = useState('')
  const [offer, setOffer] = useState('')
  const [tone, setTone] = useState('Urgent')
  const [variants, setVariants] = useState<CreativeVariant[]>([])
  const [loadingCreative, setLoadingCreative] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  async function fetchCompetitorAds() {
    if (!competitorName.trim()) return
    setLoadingAds(true)
    setAdError('')
    setAds([])
    setAnalysis(null)
    try {
      const res = await fetch(`/api/ad-library?brand=${encodeURIComponent(competitorName)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch ads')
      setAds(json.ads || [])
      if ((json.ads || []).length === 0) setAdError('No active ads found for this brand. Try a different name.')
    } catch (err: any) {
      setAdError(err.message)
    }
    setLoadingAds(false)
  }

  async function analyzeAds() {
    if (ads.length === 0) return
    setLoadingAnalysis(true)
    try {
      const res = await fetch('/api/analyze-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ads, brand: competitorName }),
      })
      const json = await res.json()
      setAnalysis(json)
    } catch (err) {
      console.error(err)
    }
    setLoadingAnalysis(false)
  }

  async function generateCreative() {
    if (!objective || !audience || !offer) return
    setLoadingCreative(true)
    setVariants([])
    try {
      const res = await fetch('/api/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, audience, offer, tone }),
      })
      const json = await res.json()
      setVariants(json.variants || [])
    } catch (err) {
      console.error(err)
    }
    setLoadingCreative(false)
  }

  function copyVariant(idx: number) {
    const v = variants[idx]
    const text = `HOOK: ${v.hook}\n\nBODY: ${v.body}\n\nCTA: ${v.cta}`
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const formatBadge = (format: string) => {
    const colors: Record<string, string> = {
      'Video': '#EFF6FF|#1D4ED8',
      'Carousel': '#F0FDF4|#166534',
      'Static image': '#FFFBEB|#92400E',
      'Story': '#FDF4FF|#6B21A8',
    }
    const [bg, color] = (colors[format] || '#F3F4F6|#374151').split('|')
    return { bg, color }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>AI</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Creative Intelligence</span>
          <span style={{ color: '#D1D5DB' }}>|</span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Powered by Claude + Meta Ad Library</span>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
          {([['competitor', '🔍 Competitor analysis'], ['creative', '✍️ Script to creative']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#111' : '#6B7280',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Competitor Analysis ── */}
        {tab === 'competitor' && (
          <div>
            {/* Search */}
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>Competitor creative intelligence</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>Pulls active ads from Meta Ad Library → Claude analyzes hooks, offers, formats, and gaps</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={competitorName}
                  onChange={e => setCompetitorName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchCompetitorAds()}
                  placeholder="Enter competitor brand name (e.g. Porter, Shadowfax)"
                  style={{ flex: 1, fontSize: 13, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', color: '#111' }}
                />
                <button onClick={fetchCompetitorAds} disabled={loadingAds || !competitorName.trim()}
                  style={{ fontSize: 13, padding: '8px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, opacity: loadingAds || !competitorName.trim() ? 0.5 : 1 }}>
                  {loadingAds ? 'Fetching…' : 'Fetch ads'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>Quick search:</span>
                {COMPETITOR_PRESETS.map(p => (
                  <button key={p} onClick={() => { setCompetitorName(p); }}
                    style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #E5E7EB', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {adError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#DC2626' }}>
                {adError}
              </div>
            )}

            {/* Ads grid */}
            {ads.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{ads.length} active ads found for "{competitorName}"</div>
                  <button onClick={analyzeAds} disabled={loadingAnalysis}
                    style={{ fontSize: 13, padding: '7px 18px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, opacity: loadingAnalysis ? 0.7 : 1 }}>
                    {loadingAnalysis ? '⏳ Analyzing with Claude…' : '✨ Analyze with Claude'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {ads.slice(0, 9).map((ad, i) => (
                    <div key={ad.id || i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#7C3AED', marginBottom: 6 }}>{ad.page_name}</div>
                      {ad.creative_title && <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 4 }}>{ad.creative_title}</div>}
                      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {ad.creative_body || 'No ad copy available'}
                      </div>
                      {ad.spend && (
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          Spend: ₹{parseInt(ad.spend.lower_bound || '0').toLocaleString('en-IN')} – ₹{parseInt(ad.spend.upper_bound || '0').toLocaleString('en-IN')}
                        </div>
                      )}
                      <a href={ad.ad_snapshot_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#7C3AED', textDecoration: 'none', marginTop: 6, display: 'block' }}>
                        View ad →
                      </a>
                    </div>
                  ))}
                </div>

                {/* Analysis output */}
                {analysis && (
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>Claude's analysis — {competitorName}</div>
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.6 }}>{analysis.summary}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      {[
                        { label: '🎣 Hooks they use', items: analysis.hooks, color: '#EFF6FF' },
                        { label: '🎁 Offers & angles', items: analysis.offers, color: '#F0FDF4' },
                        { label: '📱 Creative formats', items: analysis.formats, color: '#FFFBEB' },
                        { label: '👆 CTAs', items: analysis.ctas, color: '#FDF4FF' },
                      ].map(section => (
                        <div key={section.label} style={{ background: section.color, borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 8 }}>{section.label}</div>
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {(section.items || []).map((item, i) => (
                              <li key={i} style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.4 }}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#065F46', marginBottom: 8 }}>🚀 Gaps you can exploit</div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {(analysis.gaps || []).map((g, i) => (
                          <li key={i} style={{ fontSize: 12, color: '#065F46', marginBottom: 4 }}>{g}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#4C1D95', marginBottom: 8 }}>💡 Recommendations for Shiprocket Quick</div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {(analysis.recommendations || []).map((r, i) => (
                          <li key={i} style={{ fontSize: 12, color: '#4C1D95', marginBottom: 4 }}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Script to Creative ── */}
        {tab === 'creative' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
              {/* Input panel */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 20px', height: 'fit-content' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>Script generator</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 20 }}>Fill in your brief → Claude writes 3 ad variants ready to use</div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Campaign objective</label>
                  <select value={objective} onChange={e => setObjective(e.target.value)}
                    style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', color: '#111' }}>
                    <option value="">Select objective…</option>
                    <option>App installs — delivery partners</option>
                    <option>App installs — business owners</option>
                    <option>First order conversion</option>
                    <option>Partner reactivation</option>
                    <option>Brand awareness</option>
                    <option>Lead generation</option>
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Target audience</label>
                  <select value={audience} onChange={e => setAudience(e.target.value)}
                    style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', color: '#111' }}>
                    <option value="">Select audience…</option>
                    <option>Delivery partners / drivers</option>
                    <option>Small business owners</option>
                    <option>3-wheeler / EV operators</option>
                    <option>Existing inactive users</option>
                    <option>Logistics managers</option>
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Key offer / USP</label>
                  <textarea value={offer} onChange={e => setOffer(e.target.value)}
                    placeholder="e.g. ₹500 joining bonus, same-day payment, 10,000+ daily orders available in your city"
                    rows={3}
                    style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, resize: 'none', color: '#111', fontFamily: 'inherit', outline: 'none' }} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Tone</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Urgent', 'Inspiring', 'Conversational', 'Direct', 'Emotional'].map(t => (
                      <button key={t} onClick={() => setTone(t)}
                        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1px solid ${tone === t ? '#7C3AED' : '#E5E7EB'}`, background: tone === t ? '#F5F3FF' : '#fff', color: tone === t ? '#7C3AED' : '#6B7280', cursor: 'pointer', fontWeight: tone === t ? 500 : 400 }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={generateCreative} disabled={loadingCreative || !objective || !audience || !offer}
                  style={{ width: '100%', fontSize: 13, padding: '10px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: loadingCreative || !objective || !audience || !offer ? 0.5 : 1 }}>
                  {loadingCreative ? '✨ Writing with Claude…' : '✨ Generate 3 ad scripts'}
                </button>
              </div>

              {/* Output panel */}
              <div>
                {variants.length === 0 && !loadingCreative && (
                  <div style={{ background: '#fff', border: '1px dashed #E5E7EB', borderRadius: 12, padding: '60px 40px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>✍️</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Fill in your brief and hit generate</div>
                    <div style={{ fontSize: 13, color: '#9CA3AF' }}>Claude will write 3 variants — video hook, carousel, and static — ready to copy into Meta Ads</div>
                  </div>
                )}

                {loadingCreative && (
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '60px 40px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#7C3AED' }}>✨ Claude is writing your ad scripts…</div>
                  </div>
                )}

                {variants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {variants.map((v, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED' }}>Variant {i + 1}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F5F3FF', color: '#7C3AED', fontWeight: 500 }}>{v.format}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F3F4F6', color: '#6B7280' }}>{v.angle}</span>
                          </div>
                          <button onClick={() => copyVariant(i)}
                            style={{ fontSize: 12, padding: '5px 14px', border: '1px solid #E5E7EB', borderRadius: 6, background: copiedIdx === i ? '#ECFDF5' : '#fff', color: copiedIdx === i ? '#059669' : '#374151', cursor: 'pointer' }}>
                            {copiedIdx === i ? '✓ Copied!' : 'Copy'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Hook (first 3 seconds)</div>
                            <div style={{ fontSize: 13, color: '#111', lineHeight: 1.5 }}>{v.hook}</div>
                          </div>
                          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Body copy</div>
                            <div style={{ fontSize: 13, color: '#111', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{v.body}</div>
                          </div>
                          <div style={{ background: '#ECFDF5', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#065F46', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>CTA</div>
                            <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{v.cta}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
