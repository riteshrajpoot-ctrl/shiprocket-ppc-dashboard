import { NextResponse } from 'next/server'

function chunkDateRange(start: string, end: string, chunkDays = 7): { start: string; end: string }[] {
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

  const text = await res.text()
  if (!res.ok) throw new Error(`Branch error ${res.status}: ${text}`)
  const data = JSON.parse(text)
  return data.results || []
}

// Normalize partner names to display names
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

  try {
    const chunks = chunkDateRange(startDate, endDate, 7)

    // Fetch first orders (eo_custom_event) and installs (eo_install) in parallel per chunk
    const [orderResults, installResults] = await Promise.all([
      Promise.all(chunks.map(c => fetchChunk(
        branchKey, branchSecret, c.start, c.end,
        'eo_custom_event',
        { name: ['first_order_created_fe'] },
        ['last_attributed_touch_data_tilde_campaign', 'last_attributed_touch_data_tilde_advertising_partner_name']
      ))),
      Promise.all(chunks.map(c => fetchChunk(
        branchKey, branchSecret, c.start, c.end,
        'eo_install',
        {},
        ['last_attributed_touch_data_tilde_campaign', 'last_attributed_touch_data_tilde_advertising_partner_name']
      ))),
    ])

    // Merge first orders
    const orderMap: Record<string, { campaign: string; ad_partner: string; orders: number }> = {}
    for (const results of orderResults) {
      for (const r of results) {
        const result = r.result || {}
        const campaign = result['last_attributed_touch_data_tilde_campaign'] || 'Organic/Direct'
        const partnerRaw = result['last_attributed_touch_data_tilde_advertising_partner_name'] || ''
        const partner = normalizePartner(partnerRaw)
        const orders = result.total_count || 0
        const key = `${campaign}||${partner}`
        if (!orderMap[key]) orderMap[key] = { campaign, ad_partner: partner, orders: 0 }
        orderMap[key].orders += orders
      }
    }

    // Merge installs
    const installMap: Record<string, number> = {}
    for (const results of installResults) {
      for (const r of results) {
        const result = r.result || {}
        const campaign = result['last_attributed_touch_data_tilde_campaign'] || 'Organic/Direct'
        const partnerRaw = result['last_attributed_touch_data_tilde_advertising_partner_name'] || ''
        const partner = normalizePartner(partnerRaw)
        const installs = result.total_count || 0
        const key = `${campaign}||${partner}`
        installMap[key] = (installMap[key] || 0) + installs
      }
    }

    // Combine into final campaign list
    const allKeys = new Set([...Object.keys(orderMap), ...Object.keys(installMap)])
    const byCampaign = Array.from(allKeys)
      .map(key => {
        const [campaign, ad_partner] = key.split('||')
        return {
          campaign,
          ad_partner,
          installs: installMap[key] || 0,
          orders: orderMap[key]?.orders || 0,
          conversion_rate: installMap[key] > 0 && orderMap[key]?.orders > 0
            ? parseFloat(((orderMap[key].orders / installMap[key]) * 100).toFixed(2))
            : 0,
        }
      })
      .filter(c => c.installs > 0 || c.orders > 0)
      .sort((a, b) => b.orders - a.orders)

    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)
    const totalInstalls = byCampaign.reduce((s, c) => s + c.installs, 0)

    // Group by partner
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
