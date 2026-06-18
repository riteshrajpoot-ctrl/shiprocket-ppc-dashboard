import { NextResponse } from 'next/server'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

async function fetchBranchOrders(branchKey: string, branchSecret: string, startDate: string, endDate: string) {
  const chunks = chunkDateRange(startDate, endDate, 7)
  const orderMap: Record<string, number> = {}

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(600)
    const body = {
      branch_key: branchKey,
      branch_secret: branchSecret,
      start_date: chunks[i].start,
      end_date: chunks[i].end,
      data_source: 'eo_custom_event',
      aggregation: 'total_count',
      dimensions: ['last_attributed_touch_data_tilde_campaign'],
      filters: { name: ['first_order_created_fe'] },
      granularity: 'all',
    }

    const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status === 429) { await sleep(3000); continue }
    if (!res.ok) continue

    const data = await res.json()
    for (const r of data.results || []) {
      const campaign = r.result?.['last_attributed_touch_data_tilde_campaign'] || ''
      const orders = r.result?.total_count || 0
      if (campaign) orderMap[campaign] = (orderMap[campaign] || 0) + orders
    }
  }
  return orderMap
}

async function fetchMetaCampaigns(accessToken: string, accountId: string, startDate: string, endDate: string) {
  const fields = 'campaign_name,campaign_id,spend,impressions,clicks,actions,objective'
  const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights?fields=${fields}&time_range={"since":"${startDate}","until":"${endDate}"}&level=campaign&limit=50&access_token=${accessToken}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API error ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2026-06-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  const metaToken = process.env.META_ACCESS_TOKEN
  const metaAccount = process.env.META_ACCOUNT_ID || '596746546417726'
  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!metaToken || !branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 })
  }

  try {
    // Fetch Meta and Branch in parallel
    const [metaCampaigns, branchOrders] = await Promise.all([
      fetchMetaCampaigns(metaToken, metaAccount, startDate, endDate),
      fetchBranchOrders(branchKey, branchSecret, startDate, endDate),
    ])

    // Merge Meta spend with Branch orders by campaign name
    const campaigns = metaCampaigns.map((c: any) => {
      const spend = parseFloat(c.spend || '0')
      const installs = c.actions?.find((a: any) => a.action_type === 'mobile_app_install')?.value || 0
      const orders = branchOrders[c.campaign_name] || 0
      const cpo = orders > 0 ? Math.round(spend / orders) : null
      const cpi = installs > 0 ? Math.round(spend / installs) : null

      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        spend,
        impressions: parseInt(c.impressions || '0'),
        clicks: parseInt(c.clicks || '0'),
        ctr: c.impressions > 0 ? parseFloat(((parseInt(c.clicks) / parseInt(c.impressions)) * 100).toFixed(2)) : 0,
        installs: parseInt(installs),
        cpi,
        first_orders: orders,
        cpo,
        objective: c.objective,
      }
    })

    const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0)
    const totalInstalls = campaigns.reduce((s: number, c: any) => s + c.installs, 0)
    const totalOrders = campaigns.reduce((s: number, c: any) => s + c.first_orders, 0)
    const avgCPO = totalOrders > 0 ? Math.round(totalSpend / totalOrders) : null
    const avgCPI = totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : null

    return NextResponse.json({
      summary: {
        total_spend: totalSpend,
        total_installs: totalInstalls,
        total_orders: totalOrders,
        avg_cpo: avgCPO,
        avg_cpi: avgCPI,
        date_range: { start: startDate, end: endDate },
      },
      campaigns: campaigns.sort((a: any, b: any) => b.spend - a.spend),
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
