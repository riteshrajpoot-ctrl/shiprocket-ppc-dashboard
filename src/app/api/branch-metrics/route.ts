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

async function fetchChunk(branchKey: string, branchSecret: string, startDate: string, endDate: string, dataSource: string, filters: any): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    dimensions: [
      'last_attributed_touch_data_tilde_campaign',
      'last_attributed_touch_data_tilde_advertising_partner_name',
    ],
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
    return (await retry.json()).results || []
  }

  if (!res.ok) throw new Error(`Branch error ${res.status}: ${await res.text()}`)
  return (await res.json()).results || []
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

    // Fetch first orders — sequential with delay
    const orderMap: Record<string, { campaign: string; ad_partner: string; orders: number }> = {}
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_custom_event', { name: ['first_order_created_fe'] })
      for (const r of results) {
        const res = r.result || {}
        // Use raw values exactly as Branch returns them
        const campaign = res['last_attributed_touch_data_tilde_campaign'] || '(not set)'
        const partner = res['last_attributed_touch_data_tilde_advertising_partner_name'] || '(organic)'
        const orders = res.total_count || 0
        const key = `${campaign}||${partner}`
        if (!orderMap[key]) orderMap[key] = { campaign, ad_partner: partner, orders: 0 }
        orderMap[key].orders += orders
      }
    }

    await sleep(600)

    // Fetch installs — sequential with delay
    const installMap: Record<string, number> = {}
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_install', {})
      for (const r of results) {
        const res = r.result || {}
        const campaign = res['last_attributed_touch_data_tilde_campaign'] || '(not set)'
        const partner = res['last_attributed_touch_data_tilde_advertising_partner_name'] || '(organic)'
        const key = `${campaign}||${partner}`
        installMap[key] = (installMap[key] || 0) + (res.total_count || 0)
      }
    }

    // Build final list — orders first, then install-only campaigns
    const allOrderKeys = Object.keys(orderMap)
    const installOnlyKeys = Object.keys(installMap).filter(k => !orderMap[k])

    const byCampaign = [
      ...allOrderKeys.map(key => ({
        campaign: orderMap[key].campaign,
        ad_partner: orderMap[key].ad_partner,
        installs: installMap[key] || 0,
        orders: orderMap[key].orders,
      })),
      ...installOnlyKeys.map(key => {
        const [campaign, ad_partner] = key.split('||')
        return { campaign, ad_partner, installs: installMap[key], orders: 0 }
      }),
    ].sort((a, b) => b.orders - a.orders || b.installs - a.installs)

    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)
    const totalInstalls = byCampaign.reduce((s, c) => s + c.installs, 0)

    // Partner summary
    const partnerMap: Record<string, { installs: number; orders: number }> = {}
    for (const c of byCampaign) {
      if (!partnerMap[c.ad_partner]) partnerMap[c.ad_partner] = { installs: 0, orders: 0 }
      partnerMap[c.ad_partner].installs += c.installs
      partnerMap[c.ad_partner].orders += c.orders
    }

    return NextResponse.json({
      total_orders: totalOrders,
      total_installs: totalInstalls,
      by_campaign: byCampaign,
      by_partner: Object.entries(partnerMap)
        .map(([partner, d]) => ({ partner, installs: d.installs, orders: d.orders }))
        .sort((a, b) => b.orders - a.orders),
      date_range: { start: startDate, end: endDate },
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Branch API error', message: err.message }, { status: 500 })
  }
}
