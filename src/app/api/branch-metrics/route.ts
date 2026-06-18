import { NextResponse } from 'next/server'

function chunkDateRange(start: string, end: string, chunkDays = 7) {
  const chunks = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  let current = new Date(startDate)
  while (current <= endDate) {
    const chunkEnd = new Date(current)
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1)
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime())
    chunks.push({
      start: current.toISOString().split('T')[0],
      end: chunkEnd.toISOString().split('T')[0],
    })
    current = new Date(chunkEnd)
    current.setDate(current.getDate() + 1)
  }
  return chunks
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchChunk(
  branchKey: string,
  branchSecret: string,
  startDate: string,
  endDate: string,
  dataSource: string,
  filters: Record<string, any>,
  dimensions: string[]
): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    dimensions,
    filters,
    granularity: 'all',
  }

  const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    await sleep(3000)
    const retry = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!retry.ok) throw new Error(`Branch error ${retry.status}: ${await retry.text()}`)
    const data = await retry.json()
    return data.results || []
  }

  if (!res.ok) throw new Error(`Branch error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.results || []
}

function normalizePartner(raw: string): string {
  // Keep names exactly as Branch returns them — only normalize casing variants
  const map: Record<string, string> = {
    'FACEBOOK': 'Facebook',
    'facebook': 'Facebook',
    'GOOGLE_ADWORDS': 'Google AdWords',
  }
  // Return mapped value, or original raw value, or fallback
  return map[raw] || raw || 'Organic/Direct'
}

function mergeResults(chunkResults: any[][]): Record<string, { campaign: string; ad_partner: string; count: number }> {
  const map: Record<string, { campaign: string; ad_partner: string; count: number }> = {}
  for (const results of chunkResults) {
    for (const r of results) {
      const result = r.result || {}
      const campaign = result['last_attributed_touch_data_tilde_campaign'] || 'Organic/Direct'
      const partner = normalizePartner(result['last_attributed_touch_data_tilde_advertising_partner_name'] || '')
      const count = result.total_count || 0
      const key = `${campaign}||${partner}`
      if (!map[key]) map[key] = { campaign, ad_partner: partner, count: 0 }
      map[key].count += count
    }
  }
  return map
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2026-06-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing Branch credentials' }, { status: 500 })
  }

  const dimensions = [
    'last_attributed_touch_data_tilde_campaign',
    'last_attributed_touch_data_tilde_advertising_partner_name',
  ]

  try {
    const chunks = chunkDateRange(startDate, endDate, 7)

    // Fetch orders sequentially
    const orderChunks: any[][] = []
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(
        branchKey, branchSecret,
        chunks[i].start, chunks[i].end,
        'eo_custom_event',
        { name: ['first_order_created_fe'] },
        dimensions
      )
      orderChunks.push(results)
    }

    await sleep(600)

    // Fetch installs sequentially
    const installChunks: any[][] = []
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(
        branchKey, branchSecret,
        chunks[i].start, chunks[i].end,
        'eo_install',
        {},
        dimensions
      )
      installChunks.push(results)
    }

    const orderMap = mergeResults(orderChunks)
    const installMap = mergeResults(installChunks)

    // Build order campaigns list (source of truth for first orders)
    const orderCampaigns = Object.entries(orderMap)
      .map(([key, d]) => ({
        campaign: d.campaign,
        ad_partner: d.ad_partner,
        orders: d.count,
        // Only show installs if the exact campaign+partner combo exists in install data
        installs: installMap[key]?.count || 0,
      }))
      .filter(c => c.orders > 0)
      .sort((a, b) => b.orders - a.orders)

    // Build install-only campaigns (campaigns with installs but no orders yet)
    const installOnlyCampaigns = Object.entries(installMap)
      .filter(([key]) => !orderMap[key])
      .map(([key, d]) => ({
        campaign: d.campaign,
        ad_partner: d.ad_partner,
        orders: 0,
        installs: d.count,
      }))
      .filter(c => c.installs > 0)
      .sort((a, b) => b.installs - a.installs)

    // Combine: order campaigns first, then install-only
    const byCampaign = [
      ...orderCampaigns.map(c => ({
        ...c,
        conversion_rate: c.installs > 0 ? parseFloat(((c.orders / c.installs) * 100).toFixed(2)) : null,
      })),
      ...installOnlyCampaigns.map(c => ({
        ...c,
        conversion_rate: null,
      })),
    ]

    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)
    const totalInstalls = byCampaign.reduce((s, c) => s + c.installs, 0)

    // Partner summary — from orders (primary)
    const partnerMap: Record<string, { installs: number; orders: number }> = {}
    for (const c of byCampaign) {
      if (!partnerMap[c.ad_partner]) partnerMap[c.ad_partner] = { installs: 0, orders: 0 }
      partnerMap[c.ad_partner].installs += c.installs
      partnerMap[c.ad_partner].orders += c.orders
    }

    // Also add install partners not in orders
    for (const [key, d] of Object.entries(installMap)) {
      if (!orderMap[key]) {
        if (!partnerMap[d.ad_partner]) partnerMap[d.ad_partner] = { installs: 0, orders: 0 }
        partnerMap[d.ad_partner].installs += d.count
      }
    }

    return NextResponse.json({
      total_orders: totalOrders,
      total_installs: totalInstalls,
      by_campaign: byCampaign,
      by_partner: Object.entries(partnerMap)
        .map(([partner, d]) => ({
          partner,
          installs: d.installs,
          orders: d.orders,
          pct: totalOrders > 0 ? Math.round((d.orders / totalOrders) * 100) : 0,
        }))
        .sort((a, b) => b.orders - a.orders),
      date_range: { start: startDate, end: endDate },
      chunks_fetched: chunks.length,
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Branch API error', message: err.message }, { status: 500 })
  }
}
