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
    granularity: 'all',
    metric: 'unique_count',
    organic: false,
    toCurrency: 'USD',
    webOnly: false,
    context: 'skan-unified-report-table',
    columns: [
      'custom_event__first_order_created_fe',
      'unified_total__install',
    ],
    dimensions: [
      'last_attributed_touch_data_tilde_advertising_partner_name',
      'last_attributed_touch_data_tilde_campaign',
    ],
    dimensionsToExplain: [
      'last_attributed_touch_data_tilde_advertising_partner_name',
      'last_attributed_touch_data_tilde_campaign',
    ],
    filter: {
      type: 'and',
      fields: [
        {
          type: 'in',
          dimension: 'last_attributed_touch_data_tilde_feature',
          values: ['paid advertising'],
        },
      ],
    },
  }

  try {
    const res = await fetch(
      'https://dashboard.branch.io/v2/unified-skan/analytics/report',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`,
        },
        body: JSON.stringify(body),
      }
    )

    const text = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        error: 'Branch API error',
        status: res.status,
        detail: text,
        endpoint: 'https://dashboard.branch.io/v2/unified-skan/analytics/report',
      }, { status: res.status })
    }

    const data = JSON.parse(text)
    const results = data.results || data.data || []

    const byCampaign = results.map((r: any) => ({
      campaign:
        r.dimensions?.['last_attributed_touch_data_tilde_campaign'] ||
        r['last_attributed_touch_data_tilde_campaign'] ||
        'Unknown',
      ad_partner:
        r.dimensions?.['last_attributed_touch_data_tilde_advertising_partner_name'] ||
        r['last_attributed_touch_data_tilde_advertising_partner_name'] ||
        'Unknown',
      first_orders:
        r.result?.['custom_event__first_order_created_fe'] ||
        r['custom_event__first_order_created_fe'] ||
        0,
      installs:
        r.result?.['unified_total__install'] ||
        r['unified_total__install'] ||
        0,
    }))

    const totalOrders = byCampaign.reduce((s: number, c: any) => s + c.first_orders, 0)
    const totalInstalls = byCampaign.reduce((s: number, c: any) => s + c.installs, 0)

    return NextResponse.json({
      total_orders: totalOrders,
      total_installs: totalInstalls,
      by_campaign: byCampaign,
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
