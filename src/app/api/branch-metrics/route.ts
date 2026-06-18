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

function extractDimension(r: any, ...keys: string[]): string {
  // Branch returns dimensions in different formats — try all possible locations
  for (const key of keys) {
    // Format 1: r.dimensions['key_name']
    if (r.dimensions?.[key]) return r.dimensions[key]
    // Format 2: r['key_name'] directly
    if (r[key]) return r[key]
    // Format 3: r.dimension['key_name']
    if (r.dimension?.[key]) return r.dimension[key]
  }
  return ''
}

async function fetchBranchChunk(
  branchKey: string,
  branchSecret: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
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
    filters: { name: ['first_order_created_fe'] },
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
    const chunkResults = await Promise.all(
      chunks.map(c => fetchBranchChunk(branchKey, branchSecret, c.start, c.end))
    )

    // Log first result to understand structure
    const firstResult = chunkResults[0]?.[0]
    console.log('Branch first result sample:', JSON.stringify(firstResult))

    // Merge results across chunks
    const merged: Record<string, { campaign: string; ad_partner: string; orders: number }> = {}

    for (const results of chunkResults) {
      for (const r of results) {
        // Try multiple key formats Branch uses
        const campaign =
          extractDimension(r,
            'last_attributed_touch_data_tilde_campaign',
            'tilde_campaign',
            'campaign'
          ) || 'Organic/Direct'

        const partner =
          extractDimension(r,
            'last_attributed_touch_data_tilde_advertising_partner_name',
            'tilde_advertising_partner_name',
            'advertising_partner_name',
            'ad_partner'
          ) || 'Organic/Direct'

        const orders =
          r.result?.total_count ||
          r.result?.value ||
          r.total_count ||
          r.value ||
          0

        const key = `${campaign}||${partner}`
        if (!merged[key]) merged[key] = { campaign, ad_partner: partner, orders: 0 }
        merged[key].orders += orders
      }
    }

    const byCampaign = Object.values(merged).sort((a, b) => b.orders - a.orders)
    const totalOrders = byCampaign.reduce((s, c) => s + c.orders, 0)

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
      // Debug: include raw sample to see structure
      debug_sample: firstResult || null,
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Branch API error', message: err.message }, { status: 500 })
  }
}
