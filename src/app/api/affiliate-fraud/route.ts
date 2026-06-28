import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function chunkDateRange(start: string, end: string, chunkDays = 7) {
  const chunks = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  let current = new Date(startDate)
  while (current <= endDate) {
    const chunkEnd = new Date(current)
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1)
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime())
    chunks.push({ start: current.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] })
    current = new Date(chunkEnd)
    current.setDate(current.getDate() + 1)
  }
  return chunks
}

async function fetchChunk(branchKey: string, branchSecret: string, startDate: string, endDate: string, dataSource: string, filters: any): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    dimensions: [
      'last_attributed_touch_data_tilde_advertising_partner_name',
      'last_attributed_touch_data_tilde_campaign',
    ],
    filters,
    granularity: 'all',
  }
  const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 429) { await sleep(3000); return [] }
  if (!res.ok) return []
  return (await res.json()).results || []
}

const isAffiliate = (partner: string) => {
  const p = (partner || '').toLowerCase()
  return !p.includes('google') && !p.includes('adword') &&
    !p.includes('facebook') && !p.includes('meta') &&
    !p.includes('apple') && p !== '(organic)' && p !== 'organic' && partner !== ''
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing Branch credentials' }, { status: 500 })
  }

  try {
    const chunks = chunkDateRange(startDate, endDate, 7)

    // Maps: partner -> campaign -> counts
    const clickMap: Record<string, Record<string, number>> = {}
    const installMap: Record<string, Record<string, number>> = {}
    const orderMap: Record<string, Record<string, number>> = {}

    // Fetch clicks
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_click', {})
      for (const r of results) {
        const partner = r.result?.last_attributed_touch_data_tilde_advertising_partner_name || '(organic)'
        const campaign = r.result?.last_attributed_touch_data_tilde_campaign || '(not set)'
        const count = r.result?.total_count || 0
        if (!clickMap[partner]) clickMap[partner] = {}
        clickMap[partner][campaign] = (clickMap[partner][campaign] || 0) + count
      }
    }

    await sleep(600)

    // Fetch installs
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_install', {})
      for (const r of results) {
        const partner = r.result?.last_attributed_touch_data_tilde_advertising_partner_name || '(organic)'
        const campaign = r.result?.last_attributed_touch_data_tilde_campaign || '(not set)'
        const count = r.result?.total_count || 0
        if (!installMap[partner]) installMap[partner] = {}
        installMap[partner][campaign] = (installMap[partner][campaign] || 0) + count
      }
    }

    await sleep(600)

    // Fetch first orders
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_custom_event', { name: ['first_order_created_fe'] })
      for (const r of results) {
        const partner = r.result?.last_attributed_touch_data_tilde_advertising_partner_name || '(organic)'
        const campaign = r.result?.last_attributed_touch_data_tilde_campaign || '(not set)'
        const count = r.result?.total_count || 0
        if (!orderMap[partner]) orderMap[partner] = {}
        orderMap[partner][campaign] = (orderMap[partner][campaign] || 0) + count
      }
    }

    // Build partner-level summary
    const allPartners = new Set([...Object.keys(clickMap), ...Object.keys(installMap), ...Object.keys(orderMap)])
    const partners: any[] = []

    for (const partner of Array.from(allPartners)) {
      if (!isAffiliate(partner)) continue

      const totalClicks = Object.values(clickMap[partner] || {}).reduce((a, b) => a + b, 0)
      const totalInstalls = Object.values(installMap[partner] || {}).reduce((a, b) => a + b, 0)
      const totalOrders = Object.values(orderMap[partner] || {}).reduce((a, b) => a + b, 0)

      const cti = totalClicks > 0 ? (totalInstalls / totalClicks) * 100 : null
      const cvr = totalInstalls > 0 ? (totalOrders / totalInstalls) * 100 : null

      // Fraud signals
      const signals: { type: string; severity: 'high' | 'medium' | 'low'; msg: string }[] = []

      if (cti !== null) {
        if (cti < 0.5) signals.push({ type: 'Click Flooding', severity: 'high', msg: `CTI ${cti.toFixed(2)}% — extremely low, click flooding likely` })
        else if (cti < 2) signals.push({ type: 'Click Flooding', severity: 'medium', msg: `CTI ${cti.toFixed(2)}% — below 2% threshold, monitor closely` })
        if (cti > 80) signals.push({ type: 'Click Injection', severity: 'high', msg: `CTI ${cti.toFixed(2)}% — suspiciously high, possible click injection` })
      }

      if (cvr !== null) {
        if (cvr === 0 && totalInstalls > 100) signals.push({ type: 'Device Farm', severity: 'high', msg: `Zero orders from ${totalInstalls.toLocaleString()} installs — likely device farm or incentivized traffic` })
        else if (cvr < 1 && totalInstalls > 500) signals.push({ type: 'Low Quality', severity: 'medium', msg: `CVR ${cvr.toFixed(1)}% — very low quality traffic` })
        if (cvr > 80) signals.push({ type: 'SDK Spoofing', severity: 'high', msg: `CVR ${cvr.toFixed(2)}% — unrealistically high, possible SDK spoofing` })
      }

      if (totalClicks > 50000 && totalInstalls < 100) signals.push({ type: 'Click Flooding', severity: 'high', msg: `${totalClicks.toLocaleString()} clicks but only ${totalInstalls} installs — mass fake clicks` })

      // Risk score
      const highCount = signals.filter(s => s.severity === 'high').length
      const medCount = signals.filter(s => s.severity === 'medium').length
      const riskScore = Math.min(100, highCount * 35 + medCount * 15)
      const riskLevel = riskScore >= 60 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low'

      // Campaign breakdown
      const allCampaigns = new Set([
        ...Object.keys(clickMap[partner] || {}),
        ...Object.keys(installMap[partner] || {}),
        ...Object.keys(orderMap[partner] || {}),
      ])

      const campaigns = Array.from(allCampaigns).map(camp => {
        const clicks = clickMap[partner]?.[camp] || 0
        const installs = installMap[partner]?.[camp] || 0
        const orders = orderMap[partner]?.[camp] || 0
        const campCti = clicks > 0 ? (installs / clicks) * 100 : null
        const campCvr = installs > 0 ? (orders / installs) * 100 : null
        return { campaign: camp, clicks, installs, orders, cti: campCti, cvr: campCvr }
      }).sort((a, b) => b.installs - a.installs)

      partners.push({
        partner,
        clicks: totalClicks,
        installs: totalInstalls,
        orders: totalOrders,
        cti: cti !== null ? Math.round(cti * 100) / 100 : null,
        cvr: cvr !== null ? Math.round(cvr * 100) / 100 : null,
        risk_score: riskScore,
        risk_level: riskLevel,
        signals,
        campaigns,
      })
    }

    partners.sort((a, b) => b.risk_score - a.risk_score)

    return NextResponse.json({ partners, date_range: { start: startDate, end: endDate } })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
