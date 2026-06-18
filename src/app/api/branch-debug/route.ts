import { NextResponse } from 'next/server'

const BRANCH_KEY = process.env.BRANCH_KEY!
const BRANCH_SECRET = process.env.BRANCH_SECRET!

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') || '2026-06-01'
    const dateEnd = searchParams.get('date_end') || '2026-06-17'

    const body = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_custom_event',
      dimensions: ['last_attributed_touch_data_tilde_campaign', 'name'],
      metrics: ['total_count'],
      granularity: 'all',
      filters: { 'name': ['first_order_created_fe'] }
    }

    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const json = await res.json()
    return NextResponse.json({
      status: res.status,
      total_results: json.results?.length || 0,
      results: json.results || [],
      error: json.error || null
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
