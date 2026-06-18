import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2026-06-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET
  const appId = process.env.BRANCH_APP_ID || '1342462952309018934'

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing Branch credentials' }, { status: 500 })
  }

  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')

  const body = {
    app_id: appId,
    start_date: startDate,
    end_date: endDate,
    data_source: 'eo_custom_event',
    dimensions: ['last_attributed_touch_data_tilde_campaign', 'name'],
    metrics: ['total_count'],
    granularity: 'all',
    filters: {
      name: ['first_order_created_fe'],
    },
  }

  try {
    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        error: 'Branch API returned error',
        status: res.status,
        detail: text,
        attempted_endpoint: 'https://api2.branch.io/v1/query/analytics',
        auth_method: 'Basic Auth (key:secret base64)',
        app_id_used: appId,
      }, { status: res.status })
    }

    const data = JSON.parse(text)
    const results = data.results || []
    const totalOrders = results.reduce((sum: number, row: any) => sum + (row.result?.total_count || 0), 0)
    const byCampaign = results.map((row: any) => ({
      campaign: row.dimensions?.['last_attributed_touch_data_tilde_campaign'] || 'Unknown',
      orders: row.result?.total_count || 0,
    }))

    return NextResponse.json({
      total_orders: totalOrders,
      by_campaign: byCampaign,
      date_range: { start: startDate, end: endDate },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Fetch failed', message: err.message }, { status: 500 })
  }
}
