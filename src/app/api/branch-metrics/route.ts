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
    // Rate limited — wait 2 seconds and retry once
    await sleep(2000)
    const retry = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Branch error ${retry.status}: ${text}`)
    }
    const data = await retry.json()
    return data.results || []
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Branch error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.results || []
}

function normalizePartner(raw: string): string {
  const map: Record<string, string> = {
    'FACEBOOK': 'Meta (Facebook)',
    'Facebook': 'Meta (Facebook)',
    'facebook': 'Meta (Facebook)',
    'Google AdWords': 'Google Ads',
    'GOOGLE_ADWORDS': 'Google Ads',
    'Apple Search Ads': 'Apple Search Ads',
    'Vfine Ads': 'Vfine Ads',
    'My Boors Media 1': 'My Boors Media',
    'WingAds (Hong Kong) Technology Co., Limited': 'WingAds',
    'ApplabsMedia': 'ApplabsMedia',
    'Unpopulated': 'Unpopulated',
    'Organic': 'Organic/Direct',
    '': 'Organic/Direct',
  }
  return map[raw] || raw || 'Organic/Direct'
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

    // Fetch SEQUENTIALLY with 500ms delay to avoid rate limits
    const orderMap: Record<string, { campaign: string; ad_partner: string; orders: number }> = {}
    const installMap: Record<string, number> = {}

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (i > 0) await sleep(500) // 500ms between chunks

      // First orders
      const orderResults = await fetchChunk(
        branchKey, branchSecret, chunk.start, chunk.end,
        'eo_custom_event',
        { name: ['first_order_created_fe'] },
        dimensions
      )

      await sleep(300) // small delay between the two calls

      // Installs
      const installResults = await fetchChunk(
        branchKey, branchSecret, chunk.start, chunk.end,
        'eo_install',
        {},
        dimensions
      )

      // Process orders
      for (const r of orderResults) {
        const result = r.result || {}
        const campaign = result['last_attributed_touch_data_tilde_campaign'] || 'Organic/Direct'
        const partner = normalizePartner(result['last_attributed_touch_data_tilde_advertising_partner_name'] || '')
        const orders = result.total_count || 0
        const key = `${campaign}||${partner}`
        if (!orderMap[key]) orderMap[key] = { campaign, ad_partner: partner, orders: 0 }
        orderMap[key].orders += orders
      }

      // Process installs
      for (const r of installResults) {
        const result = r.result || {}
        const campaign = result['last_attributed_touch_data_tilde_campaign'] || 'Organic/Direct'
        const partner = normalizePartner(result['last_attributed_touch_data_tilde_advertising_partner_name'] || '')
        const installs = result.total_count || 0
        const key = `${campaign}||${partner}`
        installMap[key] = (installMap[key] || 0) + installs
      }
    }

    // Combine
    const allKeys = new Set([...Object.keys(orderMap), ...Object.keys(installMap)])
    const byCampaign = Array.from(allKeys)
      .map(key => {
        const [campaign, ad_partner] = key.split('||')
        const installs = installMap[key] || 0
        const orders = orderMap[key]?.orders || 0
        return {
          campaign,
          ad_partner,
          installs,
          orders,
          conversion_rate: installs > 0 && orders > 0
            ? parseFloat(((orders / installs) * 100).toFixed(2))
            : 0,
        }
      })
      .filter(c => c.installs > 0 || c.orders > 0)
      .sort((a, b) => b.orders - a.orders)

    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)
    const totalInstalls = byCampaign.reduce((s, c) => s + c.installs, 0)

    const partnerMap: Record<string, { installs: number; orders: number }> = {}
    byCampaign.forEach(c => {
      if (!partnerMap[c.ad_partner]) partnerMap[c.ad_partner] = { installs: 0, orders: 0 }
      partnerMap[c.ad_partner].installs += c.installs
      partnerMap[c.ad_partner].orders += c.orders
    })

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
