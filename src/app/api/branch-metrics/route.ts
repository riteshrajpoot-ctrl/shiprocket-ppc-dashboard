import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || getDefaultStartDate()
  const endDate = searchParams.get('end_date') || getTodayDate()

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json(
      { error: 'Branch credentials not configured' },
      { status: 500 }
    )
  }

  // Branch Query API requires Basic Auth: base64(key:secret)
  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')

  const body = {
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
      console.error('Branch API error:', res.status, text)
      return NextResponse.json(
        {
          error: 'Branch API returned error',
          status: res.status,
          detail: text,
          // Debug info (remove in prod)
          attempted_endpoint: 'https://api2.branch.io/v1/query/analytics',
          auth_method: 'Basic Auth (key:secret base64)',
        },
        { status: res.status }
      )
    }

    const data = JSON.parse(text)

    // Aggregate total orders across all campaigns
    const results = data.results || []
    const totalOrders = results.reduce(
      (sum: number, row: any) => sum + (row.result?.total_count || 0),
      0
    )

    // Map campaign-level breakdown
    const bycampaign = results.map((row: any) => ({
      campaign: row.dimensions?.['last_attributed_touch_data_tilde_campaign'] || 'Unknown',
      orders: row.result?.total_count || 0,
    }))

    return NextResponse.json({
      total_orders: totalOrders,
      by_campaign: bycampaign,
      date_range: { start: startDate, end: endDate },
      raw_count: results.length,
    })
  } catch (err: any) {
    console.error('Branch fetch error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch Branch data', message: err.message },
      { status: 500 }
    )
  }
}

// Debug route — returns raw Branch response for inspection
export async function POST(request: Request) {
  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing BRANCH_KEY or BRANCH_SECRET' }, { status: 500 })
  }

  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')

  // Echo back what creds look like (masked) so you can compare with Postman
  const maskedKey = branchKey.slice(0, 8) + '...' + branchKey.slice(-4)
  const maskedSecret = branchSecret.slice(0, 8) + '...' + branchSecret.slice(-4)

  const testBody = {
    start_date: getDefaultStartDate(),
    end_date: getTodayDate(),
    data_source: 'eo_custom_event',
    dimensions: ['last_attributed_touch_data_tilde_campaign', 'name'],
    metrics: ['total_count'],
    granularity: 'all',
    filters: { name: ['first_order_created_fe'] },
  }

  const res = await fetch('https://api2.branch.io/v1/query/analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(testBody),
  })

  const responseText = await res.text()

  return NextResponse.json({
    debug: true,
    status: res.status,
    status_text: res.statusText,
    masked_key: maskedKey,
    masked_secret: maskedSecret,
    auth_header_format: `Basic ${credentials.slice(0, 12)}...`,
    response_headers: Object.fromEntries(res.headers.entries()),
    body: responseText,
  })
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

function getDefaultStartDate(): string {
  const d = new Date()
  d.setDate(1) // Start of current month
  return d.toISOString().split('T')[0]
}
