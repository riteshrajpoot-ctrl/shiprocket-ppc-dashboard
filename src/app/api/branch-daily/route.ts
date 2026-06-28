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

async function fetchChunk(branchKey: string, branchSecret: string, startDate: string, endDate: string, dataSource: string, filters: any): Promise<any[]> {
  const body = {
    branch_key: branchKey,
    branch_secret: branchSecret,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    aggregation: 'total_count',
    dimensions: [
      'last_attributed_touch_data_tilde_campaign',
      'last_attributed_touch_data_tilde_advertising_partner_name',
    ],
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
  return (await res.json()).results || []
}

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

function extractDate(r: any, chunkStart: string): string {
  // Try every possible location Branch might put the date
  const candidates = [
    r.timestamp,
    r.date,
    r.result?.timestamp,
    r.result?.date,
    r.dimensions?.timestamp,
    r.dimensions?.date,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const d = c.split('T')[0]
      if (d && d.match(/^\d{4}-\d{2}-\d{2}$/)) return d
    }
  }
  return chunkStart // fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2026-06-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]
  const debug = searchParams.get('debug') === 'true'

  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing Branch credentials' }, { status: 500 })
  }

  try {
    const chunks = chunkDateRange(startDate, endDate, 7)
    const allDates = generateDates(startDate, endDate)

    // Total daily map
    const dailyMap: Record<string, { date: string; installs: number; first_orders: number }> = {}
    allDates.forEach(d => { dailyMap[d] = { date: d, installs: 0, first_orders: 0 } })

    // Per-channel daily map: { 'google': { '2026-06-01': { installs, first_orders } } }
    const channelMap: Record<string, Record<string, { installs: number; first_orders: number }>> = {}

    const getChannel = (partner: string): string => {
      const p = (partner || '').toLowerCase()
      if (p.includes('google') || p.includes('adword')) return 'google'
      if (p.includes('facebook') || p.includes('meta')) return 'facebook'
      if (p.includes('apple')) return 'apple'
      if (!partner || partner === '(organic)' || p === 'organic') return 'organic'
      return 'affiliate'
    }

    const initChannel = (ch: string, date: string) => {
      if (!channelMap[ch]) channelMap[ch] = {}
      if (!channelMap[ch][date]) channelMap[ch][date] = { installs: 0, first_orders: 0 }
    }

    let rawInstallSample: any[] = []
    let rawOrderSample: any[] = []

    // Fetch installs
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_install', {})
      if (i === 0) rawInstallSample = results.slice(0, 3)
      for (const r of results) {
        const date = extractDate(r, chunks[i].start)
        const count = Number(r.result?.total_count || 0)
        const partner = r.result?.last_attributed_touch_data_tilde_advertising_partner_name || ''
        const channel = getChannel(partner)
        if (dailyMap[date]) dailyMap[date].installs += count
        initChannel(channel, date)
        channelMap[channel][date].installs += count
      }
    }

    await sleep(600)

    // Fetch first orders
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      const results = await fetchChunk(branchKey, branchSecret, chunks[i].start, chunks[i].end, 'eo_custom_event', { name: ['first_order_created_fe'] })
      if (i === 0) rawOrderSample = results.slice(0, 3)
      for (const r of results) {
        const date = extractDate(r, chunks[i].start)
        const count = Number(r.result?.total_count || 0)
        const partner = r.result?.last_attributed_touch_data_tilde_advertising_partner_name || ''
        const channel = getChannel(partner)
        if (dailyMap[date]) dailyMap[date].first_orders += count
        initChannel(channel, date)
        channelMap[channel][date].first_orders += count
      }
    }

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    // Build per-channel daily arrays
    const byChannel: Record<string, { date: string; installs: number; first_orders: number }[]> = {}
    for (const [ch, dateData] of Object.entries(channelMap)) {
      byChannel[ch] = allDates.map(d => ({
        date: d,
        installs: dateData[d]?.installs || 0,
        first_orders: dateData[d]?.first_orders || 0,
      }))
    }

    const response: any = { daily, by_channel: byChannel, date_range: { start: startDate, end: endDate } }

    if (debug) {
      response.debug = { raw_install_sample: rawInstallSample, raw_order_sample: rawOrderSample }
    }

    return NextResponse.json(response)

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
