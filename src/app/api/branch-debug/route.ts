import { NextResponse } from 'next/server'

const BRANCH_KEY = process.env.BRANCH_KEY!
const BRANCH_SECRET = process.env.BRANCH_SECRET!

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') || '2026-06-01'
    const dateEnd = searchParams.get('date_end') || '2026-06-17'

    const results: any = {}

    // Test 1: eo_custom_event without events filter
    const body1 = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_custom_event',
      dimensions: ['last_attributed_touch_data_tilde_campaign', 'name'],
      aggregation: 'unique_count',
      granularity: 'all'
    }
    const r1 = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body1)
    })
    const j1 = await r1.json()
    results.eo_custom_event_all_events = {
      status: r1.status,
      count: j1.results?.length || 0,
      sample: j1.results?.slice(0, 5) || [],
      error: j1.error
    }

    // Test 2: Try with event_name dimension instead of events array
    const body2 = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_custom_event',
      dimensions: ['last_attributed_touch_data_tilde_campaign', 'event_name'],
      filters: { 'event_name': ['FIRST_ORDER_CREATED_FE'] },
      aggregation: 'unique_count',
      granularity: 'all'
    }
    const r2 = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body2)
    })
    const j2 = await r2.json()
    results.eo_custom_event_with_filter = {
      status: r2.status,
      count: j2.results?.length || 0,
      sample: j2.results?.slice(0, 5) || [],
      error: j2.error
    }

    // Test 3: v2 endpoint
    const body3 = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_commerce_event',
      dimensions: ['last_attributed_touch_data_tilde_campaign'],
      aggregation: 'unique_count',
      granularity: 'all'
    }
    const r3 = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body3)
    })
    const j3 = await r3.json()
    results.eo_commerce_event = {
      status: r3.status,
      count: j3.results?.length || 0,
      sample: j3.results?.slice(0, 5) || [],
      error: j3.error
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
