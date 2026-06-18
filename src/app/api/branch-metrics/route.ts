import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2026-06-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing Branch credentials' }, { status: 500 })
  }

  // Branch Query API: credentials go in the REQUEST BODY, not Authorization header
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

  try {
    const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        error: 'Branch API error',
        status: res.status,
        detail: text,
      }, { status: res.status })
    }

    const data = JSON.parse(text)
    const results = data.results || []

    // Map campaign-level breakdown
    const byCampaign = results.map((r: any) => ({
      campaign: r.dimensions?.['last_attributed_touch_data_tilde_campaign'] || 'Unknown',
      ad_partner: r.dimensions?.['last_attributed_touch_data_tilde_advertising_partner_name'] || 'Organic',
      orders: r.result?.total_count || 0,
    }))

    const totalOrders = byCampaign.reduce((s: number, c: any) => s + c.orders, 0)

    // Group by partner
    const partnerMap: Record<string, number> = {}
    byCampaign.forEach((c: any) => {
      partnerMap[c.ad_partner] = (partnerMap[c.ad_partner] || 0) + c.orders
    })

    return NextResponse.json({
      total_orders: totalOrders,
      by_campaign: byCampaign,
      by_partner: Object.entries(partnerMap).map(([partner, orders]) => ({
        partner,
        orders,
        pct: Math.round((orders / totalOrders) * 100),
      })).sort((a, b) => b.orders - a.orders),
      date_range: { start: startDate, end: endDate },
      raw_count: results.length,
    })

  } catch (err: any) {
    return NextResponse.json({
      error: 'Fetch failed',
      message: err.message,
    }, { status: 500 })
  }
}
