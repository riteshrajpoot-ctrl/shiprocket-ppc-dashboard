import { NextResponse } from 'next/server'

const BRANCH_KEY = process.env.BRANCH_KEY!
const BRANCH_SECRET = process.env.BRANCH_SECRET!

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') || '2026-06-11'
    const dateEnd = searchParams.get('date_end') || '2026-06-17'

    const body = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_click',
      dimensions: ['last_attributed_touch_data_tilde_campaign'],
      filters: { 'last_attributed_touch_data_tilde_channel': ['Facebook Ads'] },
      aggregation: 'unique_count',
      granularity: 'all',
      events: ['FIRST_ORDER_CREATED_FE']
    }

    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const text = await res.text()
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body_sent: body,
      response: JSON.parse(text)
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
