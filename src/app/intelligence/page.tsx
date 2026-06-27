'use client'

import { useState, useRef, useEffect } from 'react'

type Tab = 'analyze' | 'competitor' | 'creative' | 'playbook' | 'studio'

interface AdReport {
  ad_id: string
  ad_name: string
  campaign_name: string
  adset_name: string
  page_name: string
  ad_side: string
  store_url: string
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
  preview_url: string
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

  // Analyse tab
  const [ads, setAds] = useState<AdReport[]>([])
  const [loadingAds, setLoadingAds] = useState(false)
  const [adSearch, setAdSearch] = useState('')
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateEnd] = useState(() => new Date().toISOString().split('T')[0])

  // Modal state
  const [modalAd, setModalAd] = useState<AdReport | null>(null)
  const [modalAnalysis, setModalAnalysis] = useState<AnalysisResult | null>(null)
  const [modalAnalyzing, setModalAnalyzing] = useState(false)
  const [modalAlternatives, setModalAlternatives] = useState<ScriptVariant[]>([])
  const [generatingAlts, setGeneratingAlts] = useState(false)
  const [copiedAlt, setCopiedAlt] = useState<number | null>(null)
  const [imageBriefs, setImageBriefs] = useState<Record<number, any>>({})
  const [generatingBrief, setGeneratingBrief] = useState<number | null>(null)
  const [expandedBrief, setExpandedBrief] = useState<number | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({})
  const [generatingImage, setGeneratingImage] = useState<number | null>(null)

  // Script generator tab
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
    try {
      const res = await fetch(`/api/ad-level-report?date_start=${dateStart}&date_end=${dateEnd}`)
      const data = await res.json()
      setAds(data.ads || [])
    } catch { alert('Failed to fetch ads.') }
    setLoadingAds(false)
  }

  useEffect(() => { fetchAds() }, [])

  const openModal = async (ad: AdReport) => {
    setModalAd(ad)
    setModalAnalysis(null)
    setModalAlternatives([])
    setModalAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copy: `Ad name: ${ad.ad_name}\nCampaign: ${ad.campaign_name}\nHook/body: ${ad.creative_body}\nTitle: ${ad.creative_title}`,
          metrics: { spend: ad.spend, ctr: ad.ctr, cpc: ad.cpc, installs: ad.installs, cpi: ad.cpi, impressions: ad.impressions }
        }),
      })
      const data = await res.json()
      setModalAnalysis(data)
    } catch { alert('Analysis failed.') }
    setModalAnalyzing(false)
  }

  const closeModal = () => {
    setModalAd(null)
    setModalAnalysis(null)
    setModalAlternatives([])
    setGeneratingAlts(false)
    setImageBriefs({})
    setExpandedBrief(null)
    setGeneratedImages({})
    setGeneratingImage(null)
  }

  const detectAdSide = (ad: AdReport): 'DEMAND' | 'SUPPLY' => {
    // Use app store URL as source of truth
    // com.shiprocket.quickpartner = Supply-side (driver app)
    // anything else = Demand-side (customer app)
    if (ad.ad_side === 'SUPPLY') return 'SUPPLY'
    return 'DEMAND'
  }

  const generateAlternatives = async () => {
    if (!modalAd || !modalAnalysis) return
    setGeneratingAlts(true)
    setModalAlternatives([])
    const adSide = detectAdSide(modalAd)
    const issuesSummary = modalAnalysis.improvements.join('. ')
    const originalCopy = (modalAd.creative_body || modalAd.ad_name || '').trim()

    try {
      const res = await fetch('/api/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: `Fix underperforming ad — improve CTR from ${Number(modalAd.ctr).toFixed(2)}% toward 1%+`,
          audience: adSide === 'DEMAND'
            ? 'Small business owners and D2C sellers who need 3-wheeler delivery'
            : '3-wheeler operators and auto drivers looking to earn',
          offer: `Original ad copy: "${originalCopy}". Performance: CTR ${Number(modalAd.ctr).toFixed(2)}%, Spend Rs.${Math.round(Number(modalAd.spend)).toLocaleString('en-IN')}, Installs: ${modalAd.installs || 0}. Issues to fix: ${issuesSummary}`,
          tone: Number(modalAd.ctr) < 0.8 ? 'Urgent' : 'Inspiring',
          refCreative: originalCopy,
          adSide,
        }),
      })

      const data = await res.json()

      if (data.error) {
        alert(`Failed to generate: ${data.error}${data.detail ? '\n' + data.detail : ''}`)
        setGeneratingAlts(false)
        return
      }

      if (!data.variants || data.variants.length === 0) {
        alert('No variants returned. Please try again.')
        setGeneratingAlts(false)
        return
      }

      setModalAlternatives(data.variants)
    } catch (e: any) {
      alert(`Network error: ${e.message}`)
    }
    setGeneratingAlts(false)
  }

  const copyAlt = (idx: number, v: ScriptVariant) => {
    navigator.clipboard.writeText(`HOOK: ${v.hook}\n\nBODY: ${v.body}\n\nCTA: ${v.cta}`)
    setCopiedAlt(idx)
    setTimeout(() => setCopiedAlt(null), 2000)
  }

  const generateImageBrief = async (idx: number, v: ScriptVariant) => {
    setGeneratingBrief(idx)
    setExpandedBrief(idx)
    try {
      const res = await fetch('/api/generate-image-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant: v,
          adName: modalAd?.ad_name || 'Shiprocket Quick',
          campaignContext: modalAd?.campaign_name || objective,
          issues: modalAnalysis?.improvements.join('. ') || '',
        }),
      })
      const data = await res.json()
      setImageBriefs(prev => ({ ...prev, [idx]: data }))
    } catch { alert('Image brief generation failed.') }
    setGeneratingBrief(null)
  }

  const copyPrompt = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPrompt(key); setTimeout(() => setCopiedPrompt(null), 2000)
  }

  const generateAdImage = async (idx: number, v: ScriptVariant) => {
    setGeneratingImage(idx)
    const adSide = modalAd ? detectAdSide(modalAd) : 'SUPPLY'
    try {
      const res = await fetch('/api/generate-ad-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant: v,
          adName: modalAd?.ad_name || 'Shiprocket Quick',
          campaignContext: modalAd?.campaign_name || objective,
          issues: modalAnalysis?.improvements.join('. ') || '',
          referenceImageUrl: modalAd?.thumbnail_url || null,
          adSide,
        }),
      })
      const data = await res.json()
      if (data.error) { alert(`Image generation failed: ${data.error}`); return }
      setGeneratedImages(prev => ({ ...prev, [idx]: data.image }))
    } catch (e: any) { alert(`Image generation failed: ${e.message}`) }
    setGeneratingImage(null)
  }

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setRefImage(await toBase64(file)); setRefImageName(file.name)
  }

  const generateScripts = async () => {
    if (!offer) return
    setGenerating(true); setScripts([])
    try {
      const res = await fetch('/api/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, audience, offer, tone, refCreative, refImage }),
      })
      const data = await res.json()
      setScripts(data.variants || [])
    } catch { alert('Generation failed.') }
    setGenerating(false)
  }

  const copyScript = (idx: number, v: ScriptVariant) => {
    navigator.clipboard.writeText(`HOOK: ${v.hook}\n\nBODY: ${v.body}\n\nCTA: ${v.cta}`)
    setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000)
  }

  // ── Playbook state ───────────────────────────────────────────────────────────
  const [pbCells, setPbCells] = useState<any[]>([])
  const [pbInsights, setPbInsights] = useState<any[]>([])
  const [pbLoading, setPbLoading] = useState(false)
  const [pbAnalysing, setPbAnalysing] = useState(false)
  const [pbSelectedCell, setPbSelectedCell] = useState<string | null>(null)
  const [pbProgress, setPbProgress] = useState(0)
  const [pbAds, setPbAds] = useState<any[]>([])

  const inferAudience = (ad: any) => {
    const cn = (ad.campaign_name + ' ' + ad.adset_name).toLowerCase()
    if (cn.includes('broad') || cn.includes('advantage')) return 'Broad'
    if (cn.includes('custom') || cn.includes('lookalike') || cn.includes('lal')) return 'Custom/LAL'
    return 'Broad'
  }

  const loadPlaybook = () => {
    if (ads.length === 0) {
      alert('Your ads haven\'t loaded yet. Please wait for the Creative Analysis tab to finish loading, then try again.')
      return
    }
    setPbLoading(true)
    setPbCells([])
    setPbInsights([])
    setPbAds([])

    const inferPlacementLocal = (ad: AdReport): string => {
      const cn = (ad.campaign_name + ' ' + (ad.adset_name || '')).toLowerCase()
      if (cn.includes('reel')) return 'Instagram Reels'
      if (cn.includes('instagram') || cn.includes(' ig ') || cn.startsWith('ig_')) return 'Instagram Feed'
      if (cn.includes('instream') || cn.includes('in-stream')) return 'FB In-stream'
      if (cn.includes('story') || cn.includes('stories')) return 'Stories'
      return 'Facebook Feed'
    }

    const inferAudienceLocal = (ad: AdReport): string => {
      const cn = (ad.campaign_name + ' ' + (ad.adset_name || '')).toLowerCase()
      if (cn.includes('custom') || cn.includes('lookalike') || cn.includes('_lal') || cn.includes('retarget')) return 'Custom/LAL'
      return 'Broad'
    }

    const enriched = ads.map(ad => ({
      ...ad,
      _placement: inferPlacementLocal(ad),
      _audience: inferAudienceLocal(ad),
      _dims: null,
    }))

    const map: Record<string, any[]> = {}
    enriched.forEach(ad => {
      const k = `${ad._placement}|${ad._audience}`
      if (!map[k]) map[k] = []
      map[k].push(ad)
    })

    const cells = Object.entries(map).map(([k, grpAds]) => {
      const [placement, audience] = k.split('|')
      return { key: k, label: `${placement} · ${audience}`, ads: grpAds }
    }).sort((a, b) => b.ads.length - a.ads.length)

    setPbAds(enriched)
    setPbCells(cells)
    setPbLoading(false)
  }

  const analysePlaybookCell = async (cell: any) => {
    setPbAnalysing(true); setPbSelectedCell(cell.key); setPbProgress(0)
    const results = [...cell.ads]
    for (let i = 0; i < results.length; i++) {
      try {
        const res = await fetch('/api/extract-dimensions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad_name: results[i].ad_name, creative_body: results[i].creative_body, campaign_name: results[i].campaign_name }) })
        const d = await res.json()
        results[i] = { ...results[i], _dims: d.dimensions || null }
      } catch { results[i] = { ...results[i], _dims: null } }
      setPbProgress(Math.round(((i + 1) / results.length) * 100))
    }
    const withDims = results.filter(a => a._dims)
    const allCtrs = withDims.map((a: any) => parseFloat(a.ctr) || 0)
    const allCpis = withDims.map((a: any) => parseFloat(a.cpi) || 0)
    const avgCtr = allCtrs.reduce((s: number, v: number) => s + v, 0) / (allCtrs.length || 1)
    const avgCpi = allCpis.filter((v: number) => v > 0).reduce((s: number, v: number) => s + v, 0) / (allCpis.filter((v: number) => v > 0).length || 1)
    const DIMS: [string, string][] = [['hook_strategy', 'Hook strategy'], ['script_tone', 'Script tone'], ['setting', 'Setting'], ['financial_incentive', 'Financial incentive'], ['language', 'Language']]
    const insights: any[] = []
    DIMS.forEach(([key, label]) => {
      const groups: Record<string, any[]> = {}
      withDims.forEach((ad: any) => {
        const val = ad._dims[key]
        if (!val || val === 'N/A' || val === 'None' || val === 'Unknown') return
        if (!groups[val]) groups[val] = []; groups[val].push(ad)
      })
      Object.entries(groups).forEach(([val, grpAds]) => {
        if (grpAds.length < 5) return
        const gCtrs = grpAds.map((a: any) => parseFloat(a.ctr) || 0)
        const gCpis = grpAds.filter((a: any) => parseFloat(a.cpi) > 0).map((a: any) => parseFloat(a.cpi))
        const gAvgCtr = gCtrs.reduce((s: number, v: number) => s + v, 0) / gCtrs.length
        const gAvgCpi = gCpis.length ? gCpis.reduce((s: number, v: number) => s + v, 0) / gCpis.length : 0
        const ctrScore = avgCtr > 0 ? (gAvgCtr - avgCtr) / avgCtr : 0
        const cpiScore = avgCpi > 0 ? (avgCpi - gAvgCpi) / avgCpi : 0
        const score = (ctrScore + cpiScore) / 2
        insights.push({ dimension: label, value: val, avg_ctr: Math.round(gAvgCtr * 100) / 100, avg_cpi: Math.round(gAvgCpi), ad_count: grpAds.length, score: Math.round(score * 100), direction: score > 0.15 ? 'USE' : score < -0.15 ? 'AVOID' : 'TEST' })
      })
    })
    setPbInsights(insights.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)))
    setPbAnalysing(false)
  }

  // ── Ad Studio ────────────────────────────────────────────────────────────────
  const [studioCharacter, setStudioCharacter] = useState<string | null>(null)
  const [studioBackground, setStudioBackground] = useState<string | null>(null)
  const [studioLogo, setStudioLogo] = useState<string | null>(null)
  const [studioCharacterName, setStudioCharacterName] = useState('')
  const [studioBackgroundName, setStudioBackgroundName] = useState('')
  const [studioLogoName, setStudioLogoName] = useState('')
  const [studioHook, setStudioHook] = useState('')
  const [studioBody, setStudioBody] = useState('')
  const [studioCta, setStudioCta] = useState('')
  const [studioFormat, setStudioFormat] = useState<'1:1' | '9:16' | 'both'>('both')
  const [studioGenerating, setStudioGenerating] = useState(false)
  const [studioResults, setStudioResults] = useState<{ square?: string; vertical?: string }>({})
  const [studioError, setStudioError] = useState('')
  const charRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  const handleStudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'character' | 'background' | 'logo') => {
    const file = e.target.files?.[0]; if (!file) return
    const b64 = await toBase64(file)
    if (type === 'character') { setStudioCharacter(b64); setStudioCharacterName(file.name) }
    if (type === 'background') { setStudioBackground(b64); setStudioBackgroundName(file.name) }
    if (type === 'logo') { setStudioLogo(b64); setStudioLogoName(file.name) }
  }

  const generateStudioAd = async () => {
    if (!studioCharacter || !studioBackground) { setStudioError('Please upload at least a character and background.'); return }
    if (!studioHook) { setStudioError('Please add a hook/headline.'); return }
    setStudioGenerating(true); setStudioError(''); setStudioResults({})
    try {
      const formats = studioFormat === 'both' ? ['1:1', '9:16'] : [studioFormat]
      const results: { square?: string; vertical?: string } = {}
      for (const fmt of formats) {
        const res = await fetch('/api/generate-studio-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character: studioCharacter, background: studioBackground, logo: studioLogo || null, hook: studioHook, body: studioBody, cta: studioCta, format: fmt }),
        })
        const data = await res.json()
        if (data.error) { setStudioError(data.error); break }
        if (fmt === '1:1') results.square = data.image
        if (fmt === '9:16') results.vertical = data.image
      }
      setStudioResults(results)
    } catch (e: any) { setStudioError(e.message) }
    setStudioGenerating(false)
  }

  const downloadStudioImage = (b64: string, name: string) => {
    const a = document.createElement('a'); a.href = `data:image/png;base64,${b64}`; a.download = name; a.click()
  }

  const scoreColor = (s: number) => s >= 8 ? '#059669' : s >= 6 ? '#D97706' : '#DC2626'
  const scoreBg = (s: number) => s >= 8 ? '#ECFDF5' : s >= 6 ? '#FFFBEB' : '#FEF2F2'

  const filteredAds = ads.filter(a =>
    !adSearch || a.ad_name.toLowerCase().includes(adSearch.toLowerCase()) ||
    a.campaign_name.toLowerCase().includes(adSearch.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>

      {/* ── FULL SCREEN MODAL ── */}
      {modalAd && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', overflowY: 'auto', padding: '24px 16px'
        }} onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1000,
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden', margin: 'auto'
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid #F3F4F6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#FAFAFA'
            }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, margin: 0, color: '#111827' }}>{modalAd.ad_name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{modalAd.campaign_name}</p>
                  {modalAd.page_name && (
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                      background: detectAdSide(modalAd) === 'DEMAND' ? '#EEF2FF' : '#FFF7ED',
                      color: detectAdSide(modalAd) === 'DEMAND' ? '#4338CA' : '#C2410C',
                      border: `1px solid ${detectAdSide(modalAd) === 'DEMAND' ? '#C7D2FE' : '#FED7AA'}`
                    }}>
                      {detectAdSide(modalAd) === 'DEMAND' ? '📦 Demand-side (Quick App)' : '🚗 Supply-side (Partner App)'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {modalAnalysis && (
                  <div style={{
                    background: scoreColor(modalAnalysis.overall_score),
                    color: '#fff', borderRadius: 20, padding: '5px 16px',
                    fontSize: 16, fontWeight: 700
                  }}>{modalAnalysis.overall_score}/10</div>
                )}
                <button onClick={closeModal} style={{
                  width: 32, height: 32, borderRadius: '50%', border: '1px solid #E5E7EB',
                  background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: 500 }}>

              {/* Left: creative preview + metrics */}
              <div style={{ borderRight: '1px solid #F3F4F6', padding: 24, background: '#FAFAFA' }}>
                {/* Big creative preview — Meta ad previews API */}
                <div style={{
                  width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 16,
                  background: '#F3F4F6', border: '1px solid #E5E7EB',
                  minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {modalAd.preview_url ? (
                    <iframe
                      src={modalAd.preview_url}
                      style={{ width: '100%', height: 380, border: 'none', display: 'block' }}
                      title={modalAd.ad_name}
                      scrolling="no"
                    />
                  ) : modalAd.thumbnail_url ? (
                    <img src={modalAd.thumbnail_url} alt={modalAd.ad_name}
                      style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 380, objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
                      <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>Video ad</p>
                      <p style={{ fontSize: 12, margin: '4px 0 0' }}>View in Ads Manager for preview</p>
                    </div>
                  )}
                </div>

                {/* Ad copy preview */}
                {(modalAd.creative_title || modalAd.creative_body) && (
                  <div style={{ background: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, border: '1px solid #E5E7EB' }}>
                    {modalAd.creative_title && <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 6px', color: '#111827' }}>{modalAd.creative_title}</p>}
                    {modalAd.creative_body && <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>{modalAd.creative_body}</p>}
                  </div>
                )}

                {/* Performance metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Spend', val: `₹${Number(modalAd.spend).toLocaleString('en-IN')}`, highlight: false },
                    { label: 'CTR', val: `${Number(modalAd.ctr).toFixed(2)}%`, highlight: Number(modalAd.ctr) < 1 },
                    { label: 'Installs', val: modalAd.installs || '—', highlight: false },
                    { label: 'CPI', val: modalAd.installs ? `₹${Math.round(Number(modalAd.spend) / modalAd.installs)}` : '—', highlight: false },
                    { label: 'Impressions', val: Number(modalAd.impressions).toLocaleString('en-IN'), highlight: false },
                    { label: 'Clicks', val: Number(modalAd.clicks).toLocaleString('en-IN'), highlight: false },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: m.highlight ? '#FEF2F2' : '#fff',
                      border: `1px solid ${m.highlight ? '#FECACA' : '#E5E7EB'}`,
                      borderRadius: 8, padding: '8px 10px', textAlign: 'center'
                    }}>
                      <p style={{ fontSize: 11, color: m.highlight ? '#DC2626' : '#6B7280', margin: '0 0 2px' }}>{m.label}</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: m.highlight ? '#DC2626' : '#111827', margin: 0 }}>{String(m.val)}</p>
                    </div>
                  ))}
                </div>

                {/* View in Ads Manager */}
                <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=596746546417726&selected_ad_ids=${modalAd.ad_id}`}
                  target="_blank" rel="noreferrer" style={{
                    display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 500,
                    color: '#4F46E5', textDecoration: 'none', padding: '10px 0',
                    border: '1.5px solid #6366F1', borderRadius: 8, background: '#EEF2FF'
                  }}>View in Ads Manager →</a>
              </div>

              {/* Right: analysis + alternatives */}
              <div style={{ padding: 24, overflowY: 'auto', maxHeight: '80vh' }}>
                {modalAnalyzing && (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                    <p style={{ fontSize: 15, color: '#6B7280', fontWeight: 500 }}>Claude is analysing this creative...</p>
                    <p style={{ fontSize: 13, color: '#9CA3AF', margin: '6px 0 0' }}>Reviewing hook, CTA, audience fit and performance metrics</p>
                  </div>
                )}

                {modalAnalysis && !modalAnalyzing && (
                  <>
                    {/* Summary */}
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 10px', color: '#111827' }}>Overall assessment</p>
                      <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{modalAnalysis.summary}</p>
                    </div>

                    {/* Score breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Hook strength', val: modalAnalysis.hook_strength },
                        { label: 'CTA effectiveness', val: modalAnalysis.cta_effectiveness },
                        { label: 'Audience fit', val: modalAnalysis.audience_fit },
                        { label: 'Tone', val: modalAnalysis.tone },
                      ].map(row => {
                        const isWeak = row.val.toLowerCase().startsWith('weak')
                        const isMed = row.val.toLowerCase().startsWith('medium')
                        const bg = isWeak ? '#FEF2F2' : isMed ? '#FFFBEB' : '#ECFDF5'
                        const border = isWeak ? '#FECACA' : isMed ? '#FDE68A' : '#A7F3D0'
                        const labelColor = isWeak ? '#DC2626' : isMed ? '#D97706' : '#059669'
                        return (
                          <div key={row.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 14px' }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{row.label}</p>
                            <p style={{ fontSize: 12, color: labelColor, fontWeight: 600, margin: '0 0 4px' }}>
                              {row.val.startsWith('Weak') ? '⚠️ Weak' : row.val.startsWith('Medium') ? '🟡 Medium' : '✅ Strong'}
                            </p>
                            <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.5 }}>{row.val.replace(/^(Weak|Medium|Strong)\s*—?\s*/i, '')}</p>
                          </div>
                        )
                      })}
                    </div>

                    {/* Improvements */}
                    {modalAnalysis.improvements?.length > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 12px', color: '#111827' }}>Issues to fix</p>
                        {modalAnalysis.improvements.map((imp, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 10, marginBottom: 10,
                            background: '#FFFBEB', border: '1px solid #FDE68A',
                            borderRadius: 10, padding: '10px 14px'
                          }}>
                            <span style={{ color: '#D97706', fontWeight: 700, flexShrink: 0, fontSize: 14 }}>{i + 1}</span>
                            <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{imp}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Generate alternatives button */}
                    {!modalAlternatives.length && !generatingAlts && (
                      <button onClick={generateAlternatives} style={{
                        width: '100%', padding: '14px 0',
                        background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                        color: '#fff', border: 'none', borderRadius: 10,
                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        marginBottom: 24
                      }}>
                        ✨ Generate 3 alternative ads — fixing these issues
                      </button>
                    )}

                    {generatingAlts && (
                      <div style={{ textAlign: 'center', padding: '24px', background: '#F5F3FF', borderRadius: 10, marginBottom: 24 }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
                        <p style={{ fontSize: 14, color: '#4F46E5', fontWeight: 500, margin: 0 }}>Writing 3 improved alternatives...</p>
                        <p style={{ fontSize: 12, color: '#7C3AED', margin: '4px 0 0' }}>Claude is addressing each issue highlighted above</p>
                      </div>
                    )}

                    {/* Generated alternatives */}
                    {modalAlternatives.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <p style={{ fontWeight: 700, fontSize: 15, margin: 0, color: '#111827' }}>3 improved alternatives</p>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ECFDF5', color: '#059669', fontWeight: 600 }}>Issues addressed</span>
                        </div>
                        {modalAlternatives.map((v, i) => (
                          <div key={i} style={{
                            border: '1.5px solid #E5E7EB', borderRadius: 12, marginBottom: 12,
                            background: '#FAFAFA', overflow: 'hidden'
                          }}>
                            {/* Copy header */}
                            <div style={{ padding: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: '#4F46E5' }}>Alt {v.variant}</span>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EEF2FF', color: '#4338CA', fontWeight: 500 }}>{v.format}</span>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F0FDF4', color: '#065F46', fontWeight: 500 }}>{v.angle}</span>
                                </div>
                                <button onClick={() => copyAlt(i, v)} style={{
                                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                  border: '1px solid #E5E7EB',
                                  background: copiedAlt === i ? '#F0FDF4' : '#fff',
                                  color: copiedAlt === i ? '#059669' : '#374151', cursor: 'pointer'
                                }}>{copiedAlt === i ? '✅ Copied!' : 'Copy copy'}</button>
                              </div>
                              <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#C2410C', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hook</p>
                                <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>{v.hook}</p>
                              </div>
                              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Body</p>
                                <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{v.body}</p>
                              </div>
                              <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#065F46', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CTA</p>
                                <p style={{ fontSize: 14, fontWeight: 700, color: '#064E3B', margin: 0 }}>{v.cta}</p>
                              </div>

                              {/* Generate image button */}
                              {!generatedImages[i] && generatingImage !== i && (
                                <button onClick={() => generateAdImage(i, v)} style={{
                                  width: '100%', padding: '10px 0', marginBottom: 8,
                                  background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                                  color: '#fff', border: 'none', borderRadius: 8,
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}>
                                  🎨 Generate ad image with AI
                                </button>
                              )}
                              {generatingImage === i && (
                                <div style={{
                                  textAlign: 'center', padding: '16px 0', marginBottom: 8,
                                  background: '#FFF7ED', borderRadius: 8,
                                  border: '1px solid #FDE68A'
                                }}>
                                  <div style={{ fontSize: 24, marginBottom: 6 }}>⚡</div>
                                  <p style={{ fontSize: 13, color: '#D97706', fontWeight: 600, margin: 0 }}>Generating image...</p>
                                  <p style={{ fontSize: 11, color: '#92400E', margin: '4px 0 0' }}>Takes ~15–20 seconds</p>
                                </div>
                              )}

                              {/* Generated image result */}
                              {generatedImages[i] && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '2px solid #6366F1' }}>
                                    <img
                                      src={generatedImages[i]}
                                      alt={`Generated creative for ${v.angle}`}
                                      style={{ width: '100%', display: 'block' }}
                                    />
                                    <div style={{
                                      position: 'absolute', top: 8, right: 8,
                                      display: 'flex', gap: 6
                                    }}>
                                      <a
                                        href={generatedImages[i]}
                                        download={`${modalAd?.ad_name}_alt${i+1}.png`}
                                        style={{
                                          padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                          background: 'rgba(0,0,0,0.7)', color: '#fff',
                                          textDecoration: 'none', backdropFilter: 'blur(4px)'
                                        }}>⬇ Download</a>
                                      <button onClick={() => generateAdImage(i, v)} style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                        background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                                        cursor: 'pointer', backdropFilter: 'blur(4px)'
                                      }}>🔄 Regenerate</button>
                                    </div>
                                  </div>
                                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '6px 0 0', textAlign: 'center' }}>
                                    Generated by GPT-image-1 · Click download to save
                                  </p>
                                </div>
                              )}

                              {/* Image brief toggle button */}
                              {!imageBriefs[i] && generatingBrief !== i && (
                                <button onClick={() => generateImageBrief(i, v)} style={{
                                  width: '100%', padding: '9px 0',
                                  background: '#fff', border: '1.5px solid #8B5CF6',
                                  borderRadius: 8, fontSize: 13, fontWeight: 600,
                                  color: '#7C3AED', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}>
                                  🖼 Generate image brief + prompts
                                </button>
                              )}
                              {generatingBrief === i && (
                                <div style={{ textAlign: 'center', padding: '10px 0', color: '#7C3AED', fontSize: 13, fontWeight: 500 }}>
                                  ⏳ Generating Canva brief + Midjourney prompt...
                                </div>
                              )}
                            </div>

                            {/* Image brief expanded panel */}
                            {imageBriefs[i] && (
                              <div style={{ borderTop: '1px solid #E5E7EB', background: '#FAF5FF' }}>
                                {/* Toggle header */}
                                <button onClick={() => setExpandedBrief(expandedBrief === i ? null : i)} style={{
                                  width: '100%', padding: '10px 16px', background: 'transparent', border: 'none',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
                                }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>🖼 Image brief + prompts</span>
                                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{expandedBrief === i ? '▲ collapse' : '▼ expand'}</span>
                                </button>

                                {expandedBrief === i && (
                                  <div style={{ padding: '0 16px 16px' }}>
                                    {/* Design direction */}
                                    {imageBriefs[i].design_direction && (
                                      <div style={{ background: '#EDE9FE', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎯 Creative direction</p>
                                        <p style={{ fontSize: 13, color: '#3B0764', margin: 0, lineHeight: 1.6 }}>{imageBriefs[i].design_direction}</p>
                                      </div>
                                    )}

                                    {/* Canva brief */}
                                    {imageBriefs[i].canva_brief && (
                                      <div style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                          <p style={{ fontSize: 12, fontWeight: 700, color: '#5B21B6', margin: 0 }}>🎨 Canva brief</p>
                                          <button onClick={() => copyPrompt(JSON.stringify(imageBriefs[i].canva_brief, null, 2), `canva-${i}`)} style={{
                                            padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                                            border: '1px solid #DDD6FE', background: copiedPrompt === `canva-${i}` ? '#F0FDF4' : '#F5F3FF',
                                            color: copiedPrompt === `canva-${i}` ? '#059669' : '#7C3AED', cursor: 'pointer'
                                          }}>{copiedPrompt === `canva-${i}` ? '✅ Copied' : 'Copy brief'}</button>
                                        </div>
                                        {[
                                          { label: 'Dimensions', val: imageBriefs[i].canva_brief.dimensions },
                                          { label: 'Background', val: imageBriefs[i].canva_brief.background },
                                          { label: 'Hero visual', val: imageBriefs[i].canva_brief.hero_visual },
                                          { label: 'Headline overlay', val: imageBriefs[i].canva_brief.text_overlay?.headline },
                                          { label: 'Subtext', val: imageBriefs[i].canva_brief.text_overlay?.subtext },
                                          { label: 'CTA button', val: imageBriefs[i].canva_brief.text_overlay?.cta_button },
                                          { label: 'Typography', val: imageBriefs[i].canva_brief.typography },
                                          { label: 'Layout notes', val: imageBriefs[i].canva_brief.layout_notes },
                                          { label: 'Brand elements', val: imageBriefs[i].canva_brief.brand_elements },
                                        ].filter(r => r.val).map(row => (
                                          <div key={row.label} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, flexShrink: 0, minWidth: 110 }}>{row.label}</span>
                                            <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{row.val}</span>
                                          </div>
                                        ))}
                                        {/* Color palette */}
                                        {imageBriefs[i].canva_brief.color_palette?.length > 0 && (
                                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                                            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, minWidth: 110 }}>Color palette</span>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                              {imageBriefs[i].canva_brief.color_palette.map((c: string, ci: number) => (
                                                <div key={ci} title={c} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: '1px solid #E5E7EB' }} />
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Midjourney prompt */}
                                    {imageBriefs[i].midjourney_prompt && (
                                      <div style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                          <p style={{ fontSize: 12, fontWeight: 700, color: '#5B21B6', margin: 0 }}>⚡ Midjourney prompt</p>
                                          <button onClick={() => copyPrompt(imageBriefs[i].midjourney_prompt, `mj-${i}`)} style={{
                                            padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                                            border: '1px solid #DDD6FE', background: copiedPrompt === `mj-${i}` ? '#F0FDF4' : '#F5F3FF',
                                            color: copiedPrompt === `mj-${i}` ? '#059669' : '#7C3AED', cursor: 'pointer'
                                          }}>{copiedPrompt === `mj-${i}` ? '✅ Copied' : 'Copy prompt'}</button>
                                        </div>
                                        <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6, fontFamily: 'monospace', background: '#F5F3FF', padding: '8px 10px', borderRadius: 6 }}>{imageBriefs[i].midjourney_prompt}</p>
                                      </div>
                                    )}

                                    {/* DALL-E prompt */}
                                    {imageBriefs[i].dalle_prompt && (
                                      <div style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                          <p style={{ fontSize: 12, fontWeight: 700, color: '#5B21B6', margin: 0 }}>🤖 DALL·E prompt</p>
                                          <button onClick={() => copyPrompt(imageBriefs[i].dalle_prompt, `dalle-${i}`)} style={{
                                            padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                                            border: '1px solid #DDD6FE', background: copiedPrompt === `dalle-${i}` ? '#F0FDF4' : '#F5F3FF',
                                            color: copiedPrompt === `dalle-${i}` ? '#059669' : '#7C3AED', cursor: 'pointer'
                                          }}>{copiedPrompt === `dalle-${i}` ? '✅ Copied' : 'Copy prompt'}</button>
                                        </div>
                                        <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6, fontFamily: 'monospace', background: '#F5F3FF', padding: '8px 10px', borderRadius: 6 }}>{imageBriefs[i].dalle_prompt}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        <button onClick={generateAlternatives} style={{
                          width: '100%', padding: '10px 0', marginTop: 4,
                          background: '#fff', color: '#6366F1',
                          border: '1.5px solid #6366F1', borderRadius: 10,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer'
                        }}>🔄 Regenerate alternatives</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
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
            { id: 'playbook', label: '🧠 Creative playbook' },
            { id: 'analyze', label: '📊 Creative analysis' },
            { id: 'competitor', label: '👁 Competitor analysis' },
            { id: 'creative', label: '✍️ Script to creative' },
            { id: 'studio', label: '🎨 Ad studio' },
          ].map(t => (
            <button key={t.id} onClick={() => {
              setActiveTab(t.id as Tab)
              if (t.id === 'playbook' && pbCells.length === 0) {
                loadPlaybook()
              }
            }} style={{
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
              <input type="text" placeholder="Search ads..." value={adSearch} onChange={e => setAdSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, width: 200 }} />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{filteredAds.length} ads</span>
            </div>

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
                  <table style={{ width: '100%', minWidth: 750, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                        {[
                          { label: 'Ad name', width: 260 },
                          { label: 'Campaign', width: 160 },
                          { label: 'Spend', width: 100 },
                          { label: 'CTR', width: 70 },
                          { label: 'Installs', width: 80 },
                          { label: 'CPI', width: 70 },
                          { label: '', width: 120 },
                        ].map(h => (
                          <th key={h.label} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12, minWidth: h.width }}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAds.map(ad => (
                        <tr key={ad.ad_id} style={{ borderBottom: '1px solid #F3F4F6' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {ad.thumbnail_url ? (
                                <img src={ad.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid #E5E7EB' }}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              ) : (
                                <div style={{ width: 44, height: 44, borderRadius: 6, background: '#F3F4F6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🖼</div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ad.ad_name}</p>
                                {ad.creative_body && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ad.creative_body.slice(0, 50)}...</p>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.campaign_name}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>₹{Number(ad.spend).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 12px', color: Number(ad.ctr) < 1 ? '#DC2626' : '#059669', fontWeight: 600 }}>{Number(ad.ctr).toFixed(2)}%</td>
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ad.installs || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{ad.installs ? `₹${Math.round(Number(ad.spend) / ad.installs)}` : '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => openModal(ad)} style={{
                              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: '1.5px solid #6366F1', background: '#EEF2FF',
                              color: '#4F46E5', cursor: 'pointer', whiteSpace: 'nowrap'
                            }}>Analyse →</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: COMPETITOR ── */}
        {activeTab === 'competitor' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 8px' }}>Meta Ad Library API — pending access</p>
            <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 480, margin: '0 auto 20px' }}>
              Competitor ad intelligence requires Meta Ad Library API approval. Form submitted and pending.
              Meanwhile, browse competitor ads manually below.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Porter', 'Shadowfax', 'Delhivery', 'Dunzo', 'Borzo'].map(b => (
                <a key={b} href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&q=${b}&search_type=keyword_unordered`}
                  target="_blank" rel="noreferrer" style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
                    fontSize: 13, color: '#374151', textDecoration: 'none', background: '#F9FAFB', fontWeight: 500
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
              <select value={objective} onChange={e => setObjective(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, marginBottom: 14, color: '#374151' }}>
                <option>First order conversion</option>
                <option>App install — delivery partner</option>
                <option>Partner activation (earn more)</option>
                <option>Fleet onboarding</option>
                <option>Retargeting — lapsed partners</option>
                <option>Customer acquisition</option>
                <option>Brand awareness</option>
              </select>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Target audience</label>
              <select value={audience} onChange={e => setAudience(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, marginBottom: 14, color: '#374151' }}>
                <option>3-wheeler / EV operators</option>
                <option>Two-wheeler delivery partners</option>
                <option>Fleet owners (5+ vehicles)</option>
                <option>Unemployed / job seekers</option>
                <option>Existing partners — upsell</option>
                <option>SMB / e-commerce sellers</option>
                <option>D2C brands</option>
              </select>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Key offer / USP *</label>
              <textarea value={offer} onChange={e => setOffer(e.target.value)} placeholder="e.g. ₹250/delivery, 3 orders pehle ₹300 cashback..."
                style={{ width: '100%', minHeight: 80, padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', color: '#374151', marginBottom: 14, boxSizing: 'border-box', outline: 'none' }} />

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

              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#92400E', margin: '0 0 4px' }}>📎 Reference creative (optional)</p>
                <p style={{ fontSize: 12, color: '#B45309', margin: '0 0 10px', lineHeight: 1.5 }}>Give Claude a reference ad — it will match its style, language, and angle exactly</p>
                <div onClick={() => refInputRef.current?.click()} style={{ border: '1px dashed #FCD34D', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', marginBottom: 8, background: refImage ? '#F0FDF4' : '#FFFEF7', textAlign: 'center' }}>
                  <input ref={refInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefUpload} />
                  {refImage ? <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>✅ {refImageName} — Click to replace</span> : <span style={{ fontSize: 12, color: '#92400E' }}>📁 Upload reference image</span>}
                </div>
                <textarea value={refCreative} onChange={e => setRefCreative(e.target.value)} placeholder="Or paste reference ad copy here..."
                  style={{ width: '100%', minHeight: 70, padding: '8px 10px', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, resize: 'vertical', fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box', background: '#FFFEF7', outline: 'none' }} />
              </div>

              <button onClick={generateScripts} disabled={generating || !offer} style={{
                width: '100%', padding: '12px 0',
                background: generating || !offer ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                color: generating || !offer ? '#9CA3AF' : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: generating || !offer ? 'not-allowed' : 'pointer'
              }}>{generating ? '⏳ Generating...' : '✨ Generate 3 ad scripts'}</button>
            </div>

            <div>
              {!scripts.length && !generating && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '60px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>Fill the brief and click generate</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: '6px 0 0' }}>Add a reference creative to guide Claude's style and angle</p>
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
                    <button onClick={() => copyScript(i, v)} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #E5E7EB', background: copiedIdx === i ? '#F0FDF4' : '#fff', color: copiedIdx === i ? '#059669' : '#374151', cursor: 'pointer' }}>{copiedIdx === i ? '✅ Copied!' : 'Copy'}</button>
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

                  {/* Image brief + generate buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => generateImageBrief(i, v)} disabled={generatingBrief === i} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: '1.5px solid #6366F1', background: generatingBrief === i ? '#F3F4F6' : '#EEF2FF',
                      color: generatingBrief === i ? '#9CA3AF' : '#4F46E5', cursor: generatingBrief === i ? 'not-allowed' : 'pointer'
                    }}>{generatingBrief === i ? '⏳ Generating brief...' : '📋 Image brief'}</button>
                    <button onClick={() => generateAdImage(i, v)} disabled={generatingImage === i} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: 'none', background: generatingImage === i ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                      color: generatingImage === i ? '#9CA3AF' : '#fff', cursor: generatingImage === i ? 'not-allowed' : 'pointer'
                    }}>{generatingImage === i ? '⏳ Generating...' : '🎨 Generate image'}</button>
                  </div>

                  {/* Generated image */}
                  {generatedImages[i] && (
                    <div style={{ marginTop: 12 }}>
                      <img src={`data:image/png;base64,${generatedImages[i]}`} alt="Generated ad" style={{ width: '100%', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                      <button onClick={() => {
                        const a = document.createElement('a'); a.href = `data:image/png;base64,${generatedImages[i]}`; a.download = `ad-variant-${i+1}.png`; a.click()
                      }} style={{ width: '100%', marginTop: 8, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}>⬇ Download</button>
                    </div>
                  )}

                  {/* Image brief output */}
                  {imageBriefs[i] && expandedBrief === i && (
                    <div style={{ marginTop: 12, background: '#F5F3FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #DDD6FE' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6', margin: '0 0 10px', textTransform: 'uppercase' }}>📋 Image brief</p>
                      {imageBriefs[i].canva_brief && [
                        { label: 'Background', val: imageBriefs[i].canva_brief.background },
                        { label: 'Hero visual', val: imageBriefs[i].canva_brief.hero_visual },
                        { label: 'Headline', val: imageBriefs[i].canva_brief.text_overlay?.headline },
                        { label: 'Subtext', val: imageBriefs[i].canva_brief.text_overlay?.subtext },
                        { label: 'CTA button', val: imageBriefs[i].canva_brief.text_overlay?.cta_button },
                        { label: 'Layout notes', val: imageBriefs[i].canva_brief.layout_notes },
                      ].filter(r => r.val).map(row => (
                        <div key={row.label} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, minWidth: 90 }}>{row.label}</span>
                          <span style={{ fontSize: 12, color: '#374151' }}>{row.val}</span>
                        </div>
                      ))}
                      {imageBriefs[i].dalle_prompt && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6', margin: 0 }}>DALL·E prompt</p>
                            <button onClick={() => copyPrompt(imageBriefs[i].dalle_prompt, `dalle-${i}`)} style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11, border: '1px solid #DDD6FE', background: copiedPrompt === `dalle-${i}` ? '#F0FDF4' : '#F5F3FF', color: copiedPrompt === `dalle-${i}` ? '#059669' : '#7C3AED', cursor: 'pointer' }}>{copiedPrompt === `dalle-${i}` ? '✅ Copied' : 'Copy'}</button>
                          </div>
                          <p style={{ fontSize: 11, color: '#374151', margin: 0, fontFamily: 'monospace', background: '#EDE9FE', padding: '8px 10px', borderRadius: 6, lineHeight: 1.6 }}>{imageBriefs[i].dalle_prompt}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── TAB 4: CREATIVE PLAYBOOK ── */}
        {activeTab === 'playbook' && (
          <div>
            {/* Load button */}
            {pbCells.length === 0 && (
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>Creative playbook</p>
                <p style={{ fontSize: 13, color: '#6B7280', maxWidth: 480, margin: '0 auto 20px' }}>
                  Groups your ads by placement + audience, then scores which creative choices drive better CTR and lower CPI.
                  {ads.length === 0 && <><br /><br /><span style={{ color: '#DC2626', fontWeight: 500 }}>⚠️ Go to Creative Analysis tab first — your ads need to load before the playbook can group them.</span></>}
                </p>
                <button onClick={loadPlaybook} disabled={pbLoading || ads.length === 0} style={{
                  padding: '10px 24px', borderRadius: 8,
                  background: ads.length === 0 ? '#E5E7EB' : pbLoading ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                  color: ads.length === 0 ? '#9CA3AF' : pbLoading ? '#9CA3AF' : '#fff',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: pbLoading || ads.length === 0 ? 'not-allowed' : 'pointer'
                }}>
                  {pbLoading ? '⏳ Grouping…' : ads.length === 0 ? 'Load ads first →' : `🚀 Group my ${ads.length} ads`}
                </button>
              </div>
            )}

            {/* Cell list */}
            {pbCells.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{pbAds.length} ads grouped into {pbCells.length} ad contexts</p>
                  <button onClick={loadPlaybook} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Refresh</button>
                </div>

                {pbCells.map(cell => {
                  const isSelected = pbSelectedCell === cell.key
                  const isAnalysing = pbAnalysing && isSelected
                  return (
                    <div key={cell.key} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14, color: '#111827' }}>{cell.label}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>{cell.ads.length} ads</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {isAnalysing && <span style={{ fontSize: 12, color: '#6B7280' }}>Analysing… {pbProgress}%</span>}
                          {isSelected && !isAnalysing && pbInsights.length > 0 && <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>✓ {pbInsights.length} insights</span>}
                          <button onClick={() => analysePlaybookCell(cell)} disabled={pbAnalysing} style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: '1.5px solid #6366F1', background: '#EEF2FF', color: '#4F46E5',
                            cursor: pbAnalysing ? 'not-allowed' : 'pointer'
                          }}>{isSelected && pbInsights.length > 0 ? 'Re-analyse' : 'Analyse →'}</button>
                        </div>
                      </div>

                      {/* Insights table */}
                      {isSelected && !isAnalysing && (
                        <div style={{ marginTop: 16, borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
                          {pbInsights.length === 0 ? (
                            <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Not enough data — need 5+ ads per dimension value to surface a validated insight.</p>
                          ) : (
                            <>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Creative playbook · {cell.label}</p>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                                    {['Dimension', 'Value', 'Avg CTR', 'Avg CPI', 'Ads', 'Direction'].map(h => (
                                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Direction' ? 'center' : 'left', fontWeight: 600, fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {pbInsights.map((ins: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                                      <td style={{ padding: '10px 12px', color: '#6B7280' }}>{ins.dimension}</td>
                                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>{ins.value}</td>
                                      <td style={{ padding: '10px 12px' }}>{ins.avg_ctr}%</td>
                                      <td style={{ padding: '10px 12px' }}>{ins.avg_cpi > 0 ? `₹${ins.avg_cpi}` : '—'}</td>
                                      <td style={{ padding: '10px 12px', color: '#9CA3AF' }}>{ins.ad_count}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                          background: ins.direction === 'USE' ? '#ECFDF5' : ins.direction === 'AVOID' ? '#FEF2F2' : '#FFFBEB',
                                          color: ins.direction === 'USE' ? '#059669' : ins.direction === 'AVOID' ? '#DC2626' : '#D97706',
                                        }}>{ins.direction}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ marginTop: 16 }}>
                                <button onClick={() => {
                                  const use = pbInsights.filter((i: any) => i.direction === 'USE')
                                  if (use.length) {
                                    setOffer(`Validated creative choices to use: ${use.map((i: any) => `${i.dimension}: ${i.value}`).join(', ')}`)
                                    setActiveTab('creative')
                                  }
                                }} style={{
                                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                  background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', border: 'none', cursor: 'pointer'
                                }}>✨ Generate brief from insights →</button>
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

        {/* ── TAB 5: AD STUDIO ── */}
        {activeTab === 'studio' && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
            {/* Left panel */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px', color: '#111827' }}>🎨 Ad Studio</p>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px' }}>Upload elements + script → GPT-4o assembles your ad</p>

              {[
                { label: 'Character / Rider image *', type: 'character' as const, ref: charRef, name: studioCharacterName },
                { label: 'Background / Gradient *', type: 'background' as const, ref: bgRef, name: studioBackgroundName },
                { label: 'Logo (optional)', type: 'logo' as const, ref: logoRef, name: studioLogoName },
              ].map(el => (
                <div key={el.type} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{el.label}</label>
                  <input ref={el.ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleStudioUpload(e, el.type)} />
                  <div onClick={() => el.ref.current?.click()} style={{ border: `1.5px dashed ${el.name ? '#6366F1' : '#D1D5DB'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', background: el.name ? '#EEF2FF' : '#F9FAFB', textAlign: 'center' }}>
                    {el.name ? <span style={{ fontSize: 12, color: '#4F46E5', fontWeight: 500 }}>✅ {el.name} — click to replace</span> : <span style={{ fontSize: 12, color: '#9CA3AF' }}>📁 Click to upload</span>}
                  </div>
                </div>
              ))}

              <div style={{ height: 1, background: '#F3F4F6', margin: '16px 0' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 10px' }}>Ad script</p>

              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Hook / Headline *</label>
              <input value={studioHook} onChange={e => setStudioHook(e.target.value)} placeholder="e.g. Roz ₹1500 kamao — koi target nahi!"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' as const, color: '#374151' }} />

              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Body copy</label>
              <textarea value={studioBody} onChange={e => setStudioBody(e.target.value)} placeholder="e.g. Shiprocket Quick ke saath 3-wheeler chalao..."
                style={{ width: '100%', minHeight: 60, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, marginBottom: 10, resize: 'vertical' as const, fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box' as const }} />

              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>CTA</label>
              <input value={studioCta} onChange={e => setStudioCta(e.target.value)} placeholder="e.g. Abhi Join Karo"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' as const, color: '#374151' }} />

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Output format</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {(['1:1', '9:16', 'both'] as const).map(f => (
                  <button key={f} onClick={() => setStudioFormat(f)} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    border: studioFormat === f ? '1.5px solid #6366F1' : '1px solid #E5E7EB',
                    background: studioFormat === f ? '#EEF2FF' : '#fff',
                    color: studioFormat === f ? '#4F46E5' : '#6B7280', cursor: 'pointer'
                  }}>{f === 'both' ? 'Both' : f}</button>
                ))}
              </div>

              {studioError && <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 12 }}>⚠️ {studioError}</p>}

              <button onClick={generateStudioAd} disabled={studioGenerating} style={{
                width: '100%', padding: '12px 0',
                background: studioGenerating ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                color: studioGenerating ? '#9CA3AF' : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: studioGenerating ? 'not-allowed' : 'pointer'
              }}>{studioGenerating ? '⏳ Generating ad...' : '✨ Generate ad'}</button>
            </div>

            {/* Right panel — output */}
            <div>
              {!studioGenerating && !studioResults.square && !studioResults.vertical && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '60px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>Upload your elements and click Generate</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: '6px 0 0' }}>GPT-4o blends your character + background + script into a finished ad</p>
                </div>
              )}
              {studioGenerating && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '60px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 6px' }}>GPT-4o is assembling your ad...</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>This takes ~20-30 seconds</p>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: studioResults.square && studioResults.vertical ? '1fr 1fr' : '1fr', gap: 16 }}>
                {studioResults.square && (
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Square 1:1</span>
                      <button onClick={() => downloadStudioImage(studioResults.square!, 'ad-square-1x1.png')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}>⬇ Download</button>
                    </div>
                    <img src={`data:image/png;base64,${studioResults.square}`} alt="Square ad" style={{ width: '100%', display: 'block' }} />
                  </div>
                )}
                {studioResults.vertical && (
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Vertical 9:16</span>
                      <button onClick={() => downloadStudioImage(studioResults.vertical!, 'ad-vertical-9x16.png')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}>⬇ Download</button>
                    </div>
                    <img src={`data:image/png;base64,${studioResults.vertical}`} alt="Vertical ad" style={{ width: '100%', display: 'block' }} />
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
