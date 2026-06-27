import { NextResponse } from 'next/server'

function chunkDateRange(start: string, end: string, chunkDays = 7) {
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Generate all dates between start and end
function generateDates(start: string, end: string): string[] {
  const dates: string[] = []
  const current = new Date(start)
  const endDate = new Date(end)
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}

async function fetchChunk(branchKey: string, branchSecret: string, startDate: string, endDate: string, dataSource: string, filters: any): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    // No dimensions — just get total per day
    dimensions: [],
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
    if (!retry.ok) return []
    return (await retry.json()).results || []
  }

  if (!res.ok) return []
  const json = await res.json()
  return json.results || []
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
    const allDates = generateDates(startDate, endDate)

    // Pre-fill daily map with all dates = 0
    const dailyMap: Record<string, { date: string; installs: number; first_orders: number }> = {}
    allDates.forEach(d => { dailyMap[d] = { date: d, installs: 0, first_orders: 0 } })

    // Fetch installs - granularity day with no dimensions gives one row per day
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_install', {})
      for (const r of results) {
        // With granularity=day, Branch puts the date in r.timestamp at the top level
        const date = (r.timestamp || '').split('T')[0]
        if (date && dailyMap[date]) {
          dailyMap[date].installs += r.result?.total_count || 0
        }
      }
    }

    await sleep(600)

    // Fetch first orders
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_custom_event', { name: ['first_order_created_fe'] })
      for (const r of results) {
        const date = (r.timestamp || '').split('T')[0]
        if (date && dailyMap[date]) {
          dailyMap[date].first_orders += r.result?.total_count || 0
        }
      }
    }

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ daily, date_range: { start: startDate, end: endDate } })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
