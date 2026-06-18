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

async function fetchBranchChunk(
  branchKey: string,
  branchSecret: string,
  startDate: string,
  endDate: string
) {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: 'eo_custom_event',
    aggregation: 'total_count',
    dimensions: [
      'last_attributed_touch_data_tilde_campaign',
      'last_attributed_touch_data_tilde_advertising_partner_name',
    ],
    filters: {
      name: ['first_order_created_fe'],
    },
    granularity: 'all',
  }

  const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Branch API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.results || []
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
    // Split date range into 7-day chunks
    const chunks = chunkDateRange(startDate, endDate, 7)

    // Fetch all chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map(chunk => fetchBranchChunk(branchKey, branchSecret, chunk.start, chunk.end))
    )

    // Merge results — combine counts for same campaign+partner combinations
    const merged: Record<string, { campaign: string; ad_partner: string; orders: number }> = {}

    for (const results of chunkResults) {
      for (const r of results) {
        const campaign = r.dimensions?.['last_attributed_touch_data_tilde_campaign'] || 'Unknown'
        const partner = r.dimensions?.['last_attributed_touch_data_tilde_advertising_partner_name'] || 'Organic'
        const key = `${campaign}||${partner}`
        const orders = r.result?.total_count || 0

        if (!merged[key]) {
          merged[key] = { campaign, ad_partner: partner, orders: 0 }
        }
        merged[key].orders += orders
      }
    }

    const byCampaign = Object.values(merged).sort((a, b) => b.orders - a.orders)
    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)

    // Group by partner
    const partnerMap: Record<string, number> = {}
    byCampaign.forEach(c => {
      partnerMap[c.ad_partner] = (partnerMap[c.ad_partner] || 0) + c.orders
    })

    return NextResponse.json({
      total_orders: totalOrders,
      by_campaign: byCampaign,
      by_partner: Object.entries(partnerMap)
        .map(([partner, orders]) => ({
          partner,
          orders,
          pct: totalOrders > 0 ? Math.round((orders / totalOrders) * 100) : 0,
        }))
        .sort((a, b) => b.orders - a.orders),
      date_range: { start: startDate, end: endDate },
      chunks_fetched: chunks.length,
    })

  } catch (err: any) {
    return NextResponse.json({
      error: 'Branch API error',
      message: err.message,
    }, { status: 500 })
  }
}
