import { NextResponse } from 'next/server'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchDaily(branchKey: string, branchSecret: string, startDate: string, endDate: string, dataSource: string, filters: any): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    dimensions: ['timestamp'],
    filters,
    granularity: 'day',
  }

  const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    await sleep(3000)
    const retry = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!retry.ok) throw new Error(`Branch error ${retry.status}: ${await retry.text()}`)
    return (await retry.json()).results || []
  }

  if (!res.ok) throw new Error(`Branch error ${res.status}: ${await res.text()}`)
  return (await res.json()).results || []
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
    // Fetch daily installs
    const installResults = await fetchDaily(branchKey, branchSecret, startDate, endDate, 'eo_install', {})
    await sleep(600)
    // Fetch daily first orders
    const orderResults = await fetchDaily(branchKey, branchSecret, startDate, endDate, 'eo_custom_event', { name: ['first_order_created_fe'] })

    // Build daily map
    const dailyMap: Record<string, { date: string; installs: number; first_orders: number }> = {}

    for (const r of installResults) {
      const res = r.result || {}
      const date = (res.timestamp || '').split('T')[0]
      if (!date) continue
      if (!dailyMap[date]) dailyMap[date] = { date, installs: 0, first_orders: 0 }
      dailyMap[date].installs += res.total_count || 0
    }

    for (const r of orderResults) {
      const res = r.result || {}
      const date = (res.timestamp || '').split('T')[0]
      if (!date) continue
      if (!dailyMap[date]) dailyMap[date] = { date, installs: 0, first_orders: 0 }
      dailyMap[date].first_orders += res.total_count || 0
    }

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ daily, date_range: { start: startDate, end: endDate } })

  } catch (err: any) {
    return NextResponse.json({ error: 'Branch daily API error', message: err.message }, { status: 500 })
  }
}
