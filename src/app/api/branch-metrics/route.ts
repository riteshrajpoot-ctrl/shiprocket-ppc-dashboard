import { NextResponse } from 'next/server'

const BRANCH_KEY = process.env.BRANCH_KEY!
const BRANCH_SECRET = process.env.BRANCH_SECRET!

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dateEnd = searchParams.get('date_end') ||
      new Date().toISOString().split('T')[0]

    // Branch Ads Analytics API — campaign level with FIRST_ORDER_CREATED_FE
    const body = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_click',
      dimensions: ['last_attributed_touch_data_tilde_campaign', 'last_attributed_touch_data_tilde_channel'],
      filters: {
        'last_attributed_touch_data_tilde_channel': ['Facebook Ads']
      },
      aggregation: 'unique_count',
      granularity: 'all',
      events: ['INSTALL', 'FIRST_ORDER_CREATED_FE']
    }

    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Branch API error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const results: any[] = data.results || []

    // Build campaign map
    const campaignMap: Record<string, { installs: number; firstOrders: number }> = {}

    for (const row of results) {
      const campaign = row.result?.last_attributed_touch_data_tilde_campaign
      if (!campaign) continue
      if (!campaignMap[campaign]) campaignMap[campaign] = { installs: 0, firstOrders: 0 }

      if (row.event === 'INSTALL') {
        campaignMap[campaign].installs = row.result?.total_count || 0
      }
      if (row.event === 'FIRST_ORDER_CREATED_FE') {
        campaignMap[campaign].firstOrders = row.result?.total_count || 0
      }
    }

    const campaigns = Object.entries(campaignMap).map(([name, data]) => ({
      campaign_name: name,
      branch_installs: data.installs,
      first_orders: data.firstOrders,
      install_to_order_rate: data.installs > 0
        ? Math.round((data.firstOrders / data.installs) * 1000) / 10
        : 0
    }))

    const totals = {
      installs: campaigns.reduce((a, c) => a + c.branch_installs, 0),
      first_orders: campaigns.reduce((a, c) => a + c.first_orders, 0),
    }

    return NextResponse.json({ campaigns, totals })

  } catch (error: any) {
    console.error('Branch metrics error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
