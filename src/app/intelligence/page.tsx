'use client'

import { useState, useRef, useEffect } from 'react'

type Tab = 'analyze' | 'competitor' | 'creative'

interface AdReport {
  ad_id: string
  ad_name: string
  campaign_name: string
  adset_name: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
  installs: number
  cpi: string
  creative_body: string
  creative_title: string
  thumbnail_url: string
  ad_snapshot_url: string
}

interface AnalysisResult {
  hook_strength: string
  cta_effectiveness: string
  audience_fit: string
  tone: string
  improvements: string[]
  overall_score: number
  summary: string
}

interface ScriptVariant {
  variant: number
  format: string
  angle: string
  hook: string
  body: string
  cta: string
}

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<Tab>('analyze')

  // Analyse tab state
  const [ads, setAds] = useState<AdReport[]>([])
  const [loadingAds, setLoadingAds] = useState(false)
  const [selectedAd, setSelectedAd] = useState<AdReport | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [adSearch, setAdSearch] = useState('')

  // Script generator state
  const [objective, setObjective] = useState('First order conversion')
  const [audience, setAudience] = useState('3-wheeler / EV operators')
  const [offer, setOffer] = useState('')
  const [tone, setTone] = useState('Urgent')
  const [refCreative, setRefCreative] = useState('')
  const [refImage, setRefImage] = useState<string | null>(null)
  const [refImageName, setRefImageName] = useState('')
  const [scripts, setScripts] = useState<ScriptVariant[]>([])
  const [generating, setGenerating] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const refInputRef = useRef<HTMLInputElement>(null)

  const toBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })

  const fetchAds = async () => {
    setLoadingAds(true)
    setSelectedAd(null)
    setAnalysisResult(null)
    try {
      const res = await fetch(`/api/ad-level-report?date_start=${dateStart}&date_end=${dateEnd}`)
      const data = await res.json()
      setAds(data.ads || [])
    } catch {
      alert('Failed to fetch ads. Check Meta token.')
    }
    setLoadingAds(false)
  }

  useEffect(() => { fetchAds() }, [])

  const runAnalysis = async (ad: AdReport) => {
    setSelectedAd(ad)
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/analyze-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copy: `Ad name: ${ad.ad_name}\nCampaign: ${ad.campaign_name}\nHook/body: ${ad.creative_body}\nTitle: ${ad.creative_title}`,
          metrics: {
            spend: ad.spend,
            ctr: ad.ctr,
            cpc: ad.cpc,
            installs: ad.installs,
            cpi: ad.cpi,
            impressions: ad.impressions,
          }
        }),
      })
      const data = await res.json()
      setAnalysisResult(data)
    } catch {
      alert('Analysis failed.')
    }
    setAnalyzing(false)
  }

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await toBase64(file)
    setRefImage(b64)
    setRefImageName(file.name)
  }

  const generateScripts = async () => {
    if (!offer) return
    setGenerating(true)
    setScripts([])
    try {
      const res = await fetch('/api/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, audience, offer, tone, refCreative, refImage }),
      })
      const data = await res.json()
      setScripts(data.variants || [])
    } catch {
      alert('Generation failed.')
    }
    setGenerating(false)
  }

  const copyScript = (idx: number, v: ScriptVariant) => {
    navigator.clipboard.writeText(`HOOK: ${v.hook}\n\nBODY: ${v.body}\n\nCTA: ${v.cta}`)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const scoreColor = (s: number) =>
    s >= 8 ? '#059669' : s >= 6 ? '#D97706' : '#DC2626'

  const filteredAds = ads.filter(a =>
    !adSearch || a.ad_name.toLowerCase().includes(adSearch.toLowerCase()) ||
    a.campaign_name.toLowerCase().includes(adSearch.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>
      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E5E7EB',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 700
          }}>AI</div>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Creative Intelligence</span>
          <span style={{ color: '#9CA3AF', fontSize: 13, marginLeft: 4 }}>Powered by Claude</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'analyze', label: '📊 Creative analysis' },
            { id: 'competitor', label: '👁 Competitor analysis' },
            { id: 'creative', label: '✍️ Script to creative' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as Tab)} style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              border: activeTab === t.id ? '1.5px solid #6366F1' : '1px solid #E5E7EB',
              background: activeTab === t.id ? '#EEF2FF' : '#fff',
              color: activeTab === t.id ? '#4F46E5' : '#374151', cursor: 'pointer'
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

        {/* ── TAB 1: AD-LEVEL CREATIVE ANALYSIS ── */}
        {activeTab === 'analyze' && (
          <div>
            {/* Date filter bar */}
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
              padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Date range</span>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13 }} />
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>to</span>
              <input type="date" value={dateEnd} readOnly
                style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, background: '#F9FAFB' }} />
              <button onClick={fetchAds} style={{
                padding: '6px 16px', borderRadius: 6, background: '#4F46E5',
                color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer'
              }}>Refresh</button>
              <div style={{ flex: 1 }} />
              <input
                type="text" placeholder="Search ads..."
                value={adSearch} onChange={e => setAdSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, width: 200 }}
              />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{filteredAds.length} ads</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedAd || analyzing ? '1fr 420px' : '1fr', gap: 16, alignItems: 'start' }}>
              {/* Ad list */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                {loadingAds ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9CA3AF' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                    <p style={{ fontSize: 14, margin: 0 }}>Loading ads from Meta Ads Manager...</p>
                  </div>
                ) : filteredAds.length === 0 ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9CA3AF' }}>
                    <p style={{ fontSize: 14, margin: 0 }}>No ads found for this period</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                        {[
                          { label: 'Ad name', width: 220 },
                          { label: 'Campaign', width: 150 },
                          { label: 'Spend', width: 90 },
                          { label: 'CTR', width: 70 },
                          { label: 'Installs', width: 80 },
                          { label: 'CPI', width: 70 },
                          { label: 'Analyse', width: 110 },
                        ].map(h => (
                          <th key={h.label} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12, minWidth: h.width }}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAds.map(ad => (
                        <tr key={ad.ad_id} style={{
                          borderBottom: '1px solid #F3F4F6',
                          background: selectedAd?.ad_id === ad.ad_id ? '#EEF2FF' : 'transparent'
                        }}>
                          <td style={{ padding: '10px 12px', maxWidth: 220 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {ad.thumbnail_url ? (
                                <img src={ad.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid #E5E7EB' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              ) : (
                                <div style={{ width: 44, height: 44, borderRadius: 6, background: '#F3F4F6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🖼</div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.ad_name}</p>
                                {ad.creative_body && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.creative_body.slice(0, 50)}...</p>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.campaign_name}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>₹{Number(ad.spend).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 12px' }}>{Number(ad.ctr).toFixed(2)}%</td>
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ad.installs || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{ad.installs ? `₹${Math.round(Number(ad.spend) / ad.installs)}` : '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => runAnalysis(ad)} style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                              border: '1px solid #6366F1', background: '#EEF2FF',
                              color: '#4F46E5', cursor: 'pointer'
                            }}>Analyse →</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>

              {/* Analysis panel */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
                {!selectedAd && !analyzing && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9CA3AF' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
                    <p style={{ fontSize: 14, margin: 0 }}>Click "Analyse →" on any ad</p>
                    <p style={{ fontSize: 12, margin: '6px 0 0', lineHeight: 1.5 }}>Claude will review the copy, hook, CTA and give a score with specific improvements</p>
                  </div>
                )}
                {analyzing && (
                  <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
                    <p style={{ fontSize: 14, color: '#6B7280' }}>Analysing creative...</p>
                    <p style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0 0' }}>{selectedAd?.ad_name}</p>
                  </div>
                )}
                {selectedAd && analysisResult && !analyzing && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 2px', color: '#111827' }}>{selectedAd.ad_name}</p>
                        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{selectedAd.campaign_name}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          background: scoreColor(analysisResult.overall_score),
                          color: '#fff', borderRadius: 20, padding: '4px 14px',
                          fontSize: 15, fontWeight: 700
                        }}>{analysisResult.overall_score}/10</div>
                        <button onClick={() => { setSelectedAd(null); setAnalysisResult(null) }} style={{
                          width: 28, height: 28, borderRadius: '50%', border: '1px solid #E5E7EB',
                          background: '#F9FAFB', cursor: 'pointer', fontSize: 14,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#6B7280', fontWeight: 600
                        }}>✕</button>
                      </div>
                    </div>

                    {/* Perf metrics row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'Spend', val: `₹${Number(selectedAd.spend).toLocaleString('en-IN')}` },
                        { label: 'CTR', val: `${Number(selectedAd.ctr).toFixed(2)}%` },
                        { label: 'Installs', val: selectedAd.installs || '—' },
                      ].map(m => (
                        <div key={m.label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 2px' }}>{m.label}</p>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>{m.val}</p>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 12 }}>{analysisResult.summary}</p>

                    {[
                      { label: 'Hook strength', val: analysisResult.hook_strength },
                      { label: 'CTA effectiveness', val: analysisResult.cta_effectiveness },
                      { label: 'Audience fit', val: analysisResult.audience_fit },
                      { label: 'Tone', val: analysisResult.tone },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', maxWidth: 220, textAlign: 'right' }}>{row.val}</span>
                      </div>
                    ))}

                    {analysisResult.improvements?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Improvements</p>
                        {analysisResult.improvements.map((imp, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                            <span style={{ color: '#F59E0B', flexShrink: 0, fontSize: 12 }}>→</span>
                            <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{imp}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedAd.ad_id && (
                      <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=596746546417726&selected_ad_ids=${selectedAd.ad_id}`} target="_blank" rel="noreferrer" style={{
                        display: 'block', marginTop: 12, textAlign: 'center', fontSize: 12,
                        color: '#4F46E5', textDecoration: 'none', padding: '6px 0',
                        border: '1px solid #E5E7EB', borderRadius: 6
                      }}>View in Ads Manager →</a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: COMPETITOR ANALYSIS ── */}
        {activeTab === 'competitor' && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
            padding: 48, textAlign: 'center'
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 8px' }}>Meta Ad Library API — pending access</p>
            <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 480, margin: '0 auto 20px' }}>
              Competitor ad intelligence requires Meta Ad Library API approval. Form submitted and pending.
              Meanwhile, browse competitor ads manually and screenshot them for analysis.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Porter', 'Shadowfax', 'Delhivery', 'Dunzo', 'Borzo'].map(b => (
                <a key={b}
                  href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&q=${b}&search_type=keyword_unordered`}
                  target="_blank" rel="noreferrer"
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
                    fontSize: 13, color: '#374151', textDecoration: 'none',
                    background: '#F9FAFB', fontWeight: 500
                  }}>View {b} ads →</a>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: SCRIPT TO CREATIVE ── */}
        {activeTab === 'creative' && (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: '0 0 4px' }}>Script generator</p>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px' }}>Fill brief → Claude writes 3 ad variants</p>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Campaign objective</label>
              <select value={objective} onChange={e => setObjective(e.target.value)} style={{
                width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB',
                borderRadius: 8, fontSize: 13, marginBottom: 14, color: '#374151'
              }}>
                <option>First order conversion</option>
                <option>App install — delivery partner</option>
                <option>Partner activation (earn more)</option>
                <option>Fleet onboarding</option>
                <option>Retargeting — lapsed partners</option>
                <option>Customer acquisition</option>
                <option>Brand awareness</option>
              </select>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Target audience</label>
              <select value={audience} onChange={e => setAudience(e.target.value)} style={{
                width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB',
                borderRadius: 8, fontSize: 13, marginBottom: 14, color: '#374151'
              }}>
                <option>3-wheeler / EV operators</option>
                <option>Two-wheeler delivery partners</option>
                <option>Fleet owners (5+ vehicles)</option>
                <option>Unemployed / job seekers</option>
                <option>Existing partners — upsell</option>
                <option>SMB / e-commerce sellers</option>
                <option>D2C brands</option>
              </select>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Key offer / USP *</label>
              <textarea value={offer} onChange={e => setOffer(e.target.value)}
                placeholder="e.g. ₹250/delivery, 3 orders pehle ₹300 cashback..."
                style={{
                  width: '100%', minHeight: 80, padding: '9px 12px',
                  border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
                  resize: 'vertical', fontFamily: 'inherit', color: '#374151',
                  marginBottom: 14, boxSizing: 'border-box', outline: 'none'
                }} />

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Tone</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {['Urgent', 'Inspiring', 'Conversational', 'Direct', 'Emotional'].map(t => (
                  <button key={t} onClick={() => setTone(t)} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    border: tone === t ? '1.5px solid #6366F1' : '1px solid #E5E7EB',
                    background: tone === t ? '#EEF2FF' : '#fff',
                    color: tone === t ? '#4F46E5' : '#6B7280', cursor: 'pointer'
                  }}>{t}</button>
                ))}
              </div>

              {/* Reference creative */}
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 10, padding: 14, marginBottom: 16
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#92400E', margin: '0 0 4px' }}>
                  📎 Reference creative (optional)
                </p>
                <p style={{ fontSize: 12, color: '#B45309', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Give Claude a reference ad — it will match its style, language, and angle exactly
                </p>
                <div onClick={() => refInputRef.current?.click()} style={{
                  border: '1px dashed #FCD34D', borderRadius: 8, padding: '10px 14px',
                  cursor: 'pointer', marginBottom: 8, background: refImage ? '#F0FDF4' : '#FFFEF7', textAlign: 'center'
                }}>
                  <input ref={refInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefUpload} />
                  {refImage
                    ? <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>✅ {refImageName} — Click to replace</span>
                    : <span style={{ fontSize: 12, color: '#92400E' }}>📁 Upload reference image</span>
                  }
                </div>
                <textarea value={refCreative} onChange={e => setRefCreative(e.target.value)}
                  placeholder="Or paste reference ad copy here..."
                  style={{
                    width: '100%', minHeight: 70, padding: '8px 10px',
                    border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12,
                    resize: 'vertical', fontFamily: 'inherit', color: '#374151',
                    boxSizing: 'border-box', background: '#FFFEF7', outline: 'none'
                  }} />
              </div>

              <button onClick={generateScripts} disabled={generating || !offer} style={{
                width: '100%', padding: '12px 0',
                background: generating || !offer ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                color: generating || !offer ? '#9CA3AF' : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: generating || !offer ? 'not-allowed' : 'pointer'
              }}>
                {generating ? '⏳ Generating...' : '✨ Generate 3 ad scripts'}
              </button>
            </div>

            <div>
              {!scripts.length && !generating && (
                <div style={{
                  background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
                  padding: '60px 24px', textAlign: 'center'
                }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>Fill the brief and click generate</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: '6px 0 0' }}>
                    Add a reference creative to guide Claude's style and angle
                  </p>
                </div>
              )}
              {generating && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '60px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                  <p style={{ fontSize: 14, color: '#6B7280' }}>Writing 3 ad variants...</p>
                </div>
              )}
              {scripts.map((v, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#4F46E5' }}>Variant {v.variant}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EEF2FF', color: '#4338CA', fontWeight: 500 }}>{v.format}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F0FDF4', color: '#065F46', fontWeight: 500 }}>{v.angle}</span>
                    </div>
                    <button onClick={() => copyScript(i, v)} style={{
                      padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      border: '1px solid #E5E7EB', background: copiedIdx === i ? '#F0FDF4' : '#fff',
                      color: copiedIdx === i ? '#059669' : '#374151', cursor: 'pointer'
                    }}>{copiedIdx === i ? '✅ Copied!' : 'Copy'}</button>
                  </div>
                  <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#C2410C', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hook (first 3 seconds)</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', margin: 0 }}>{v.hook}</p>
                  </div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body copy</p>
                    <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{v.body}</p>
                  </div>
                  <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#065F46', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CTA</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#064E3B', margin: 0 }}>{v.cta}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
