import { NextRequest, NextResponse } from 'next/server'

const META_ACCOUNT_ID = 'act_596746546417726'

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Missing META_ACCESS_TOKEN' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const dateStart = searchParams.get('date_start') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dateEnd = searchParams.get('date_end') || new Date().toISOString().split('T')[0]

  try {
    const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    insightsUrl.searchParams.set('fields', 'ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions')
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('time_range[since]', dateStart)
    insightsUrl.searchParams.set('time_range[until]', dateEnd)
    insightsUrl.searchParams.set('limit', '200')
    insightsUrl.searchParams.set('access_token', token)

    const insightsRes = await fetch(insightsUrl.toString())
    const insightsJson = await insightsRes.json()
    if (insightsJson.error) return NextResponse.json({ error: insightsJson.error.message }, { status: 400 })

    const insightsData: any[] = insightsJson.data || []
    const activeAds = insightsData.filter((a: any) => Number(a.spend) > 0)
    const adIds = activeAds.map((a: any) => a.ad_id)

    // Detect supply vs demand from app store URL
    const sideMap: Record<string, 'SUPPLY' | 'DEMAND'> = {}
    const batchSize = 20
    for (let i = 0; i < adIds.length; i += batchSize) {
      const batch = adIds.slice(i, i + batchSize)
      const batchReqs = batch.map((id: string) => ({
        method: 'GET',
        relative_url: `${id}?fields=creative{object_store_url,object_story_spec}`
      }))
      try {
        const batchRes = await fetch(
          `https://graph.facebook.com/v19.0/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${token}&include_headers=false`,
          { method: 'POST' }
        )
        const batchJson = await batchRes.json()
        if (Array.isArray(batchJson)) {
          batchJson.forEach((item: any, idx: number) => {
            try {
              if (item.code === 200) {
                const d = JSON.parse(item.body)
                const storeUrl = d.creative?.object_store_url || d.creative?.object_story_spec?.link_data?.link || ''
                sideMap[batch[idx]] = storeUrl.includes('quickpartner') ? 'SUPPLY' : 'DEMAND'
              } else { sideMap[batch[idx]] = 'DEMAND' }
            } catch { sideMap[batch[idx]] = 'DEMAND' }
          })
        }
      } catch {}
    }

    // Aggregate by side
    const supply = { spend: 0, impressions: 0, clicks: 0, installs: 0, campaigns: new Set<string>(), ads: [] as any[] }
    const demand = { spend: 0, impressions: 0, clicks: 0, installs: 0, orders: 0, campaigns: new Set<string>(), ads: [] as any[] }

    activeAds.forEach((a: any) => {
      const side = sideMap[a.ad_id] || 'DEMAND'
      const actions = a.actions || []
      const installs = Number(actions.find((x: any) => x.action_type === 'mobile_app_install')?.value ?? 0)
      const orders = Number(actions.find((x: any) => ['purchase', 'complete_registration', 'fb_mobile_purchase'].includes(x.action_type))?.value ?? 0)
      const spend = Number(a.spend)
      const impressions = Number(a.impressions || 0)
      const clicks = Number(a.clicks || 0)
      const ctr = Number(a.ctr || 0)

      if (side === 'SUPPLY') {
        supply.spend += spend
        supply.impressions += impressions
        supply.clicks += clicks
        supply.installs += installs
        supply.campaigns.add(a.campaign_name)
        supply.ads.push({ name: a.ad_name, spend, installs, ctr, cpi: installs > 0 ? spend / installs : null })
      } else {
        demand.spend += spend
        demand.impressions += impressions
        demand.clicks += clicks
        demand.installs += installs
        demand.orders += orders
        demand.campaigns.add(a.campaign_name)
        demand.ads.push({ name: a.ad_name, spend, installs, ctr, cpi: installs > 0 ? spend / installs : null })
      }
    })

    supply.ads.sort((a, b) => b.installs - a.installs)
    demand.ads.sort((a, b) => b.installs - a.installs)

    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const dayOfMonth = today.getDate()
    const monthPct = Math.round((dayOfMonth / daysInMonth) * 100)

    const totalSpend = supply.spend + demand.spend
    const supplyDailyRate = supply.spend / dayOfMonth
    const demandDailyRate = demand.spend / dayOfMonth
    const daysLeft = daysInMonth - dayOfMonth

    // Fetch Branch Facebook first orders — exact same format as working /api/branch-metrics
    let branchOrders = 0
    let performanceSpend = 0  // spend from campaigns that actually generated orders
    const performanceCampaigns = new Set<string>()  // campaign names that generated orders

    try {
      const branchKey = process.env.BRANCH_KEY
      const branchSecret = process.env.BRANCH_SECRET
      if (branchKey && branchSecret) {
        const chunks: { start: string; end: string }[] = []
        const cursor = new Date(dateStart)
        const endD = new Date(dateEnd)
        while (cursor <= endD) {
          const chunkEnd = new Date(cursor)
          chunkEnd.setDate(chunkEnd.getDate() + 6)
          if (chunkEnd > endD) chunkEnd.setTime(endD.getTime())
          chunks.push({ start: cursor.toISOString().split('T')[0], end: chunkEnd.toISOString().split('T')[0] })
          cursor.setDate(cursor.getDate() + 7)
        }
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) await sleep(600)
          try {
            const res = await fetch('https://api2.branch.io/v1/query/analytics?limit=100', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({
                branch_key: branchKey,
                branch_secret: branchSecret,
                start_date: chunks[i].start,
                end_date: chunks[i].end,
                data_source: 'eo_custom_event',
                aggregation: 'total_count',
                dimensions: [
                  'last_attributed_touch_data_tilde_campaign',
                  'last_attributed_touch_data_tilde_advertising_partner_name',
                ],
                filters: { name: ['first_order_created_fe'] },
                granularity: 'all',
              }),
            })
            if (res.ok) {
              const data = await res.json()
              for (const r of (data.results || [])) {
                const result = r.result || {}
                const partner = (result['last_attributed_touch_data_tilde_advertising_partner_name'] || '').toLowerCase()
                const campaignRaw = result['last_attributed_touch_data_tilde_campaign'] || ''
                const campaign = campaignRaw.toLowerCase()
                const orders = Number(result.total_count || 0)
                const isFacebook = partner.includes('facebook')
                const isExcluded = campaign.includes('_d_partner') || campaign.includes('_brand')
                if (isFacebook && !isExcluded && orders > 0) {
                  branchOrders += orders
                  performanceCampaigns.add(campaignRaw.toLowerCase().trim())
                }
              }
            }
          } catch {}
        }

        // Now sum spend from Meta for all campaigns that generated orders
        // Match Branch campaign name → Meta ad name (both use same SR_Quick_* naming)
        for (const ad of demand.ads) {
          const adNameNorm = ad.name.toLowerCase().trim()
          for (const pc of performanceCampaigns) {
            // Campaign name from Branch matches ad name from Meta
            if (adNameNorm.includes(pc) || pc.includes(adNameNorm) ||
                adNameNorm.replace(/[_\s]/g, '').includes(pc.replace(/[_\s]/g, '').substring(0, 18))) {
              performanceSpend += ad.spend
              break
            }
          }
        }
      }
    } catch (_e) {}

    // CPO = spend from performance campaigns only ÷ first orders from those campaigns
    const cpoDenominator = performanceSpend > 0 ? performanceSpend : demand.spend
    const cpo = branchOrders > 0 ? Math.round(cpoDenominator / branchOrders) : demand.orders > 0 ? Math.round(demand.spend / demand.orders) : null

    return NextResponse.json({
      dateStart, dateEnd, dayOfMonth, daysInMonth, monthPct,
      supply: {
        spend: Math.round(supply.spend),
        impressions: supply.impressions,
        clicks: supply.clicks,
        installs: supply.installs,
        campaigns: supply.campaigns.size,
        ctr: supply.impressions > 0 ? ((supply.clicks / supply.impressions) * 100).toFixed(2) : '0',
        cpi: supply.installs > 0 ? Math.round(supply.spend / supply.installs) : null,
        cpc: supply.clicks > 0 ? Math.round(supply.spend / supply.clicks) : null,
        pacingPct: monthPct > 0 ? Math.round((supply.spend / totalSpend) * 100) : 0,
        dailyRate: Math.round(supplyDailyRate),
        projectedMonthEnd: Math.round(supply.spend + supplyDailyRate * daysLeft),
        projectedInstalls: supply.installs > 0 ? Math.round((supply.spend + supplyDailyRate * daysLeft) / (supply.spend / supply.installs)) : 0,
        topAds: supply.ads.slice(0, 5).map(a => ({ ...a, cpi: a.cpi ? Math.round(a.cpi) : null })),
      },
      demand: {
        spend: Math.round(demand.spend),
        performanceSpend: Math.round(performanceSpend > 0 ? performanceSpend : demand.spend),
        impressions: demand.impressions,
        clicks: demand.clicks,
        installs: demand.installs,
        orders: branchOrders > 0 ? branchOrders : demand.orders,
        campaigns: demand.campaigns.size,
        performanceCampaigns: performanceCampaigns.size,
        ctr: demand.impressions > 0 ? ((demand.clicks / demand.impressions) * 100).toFixed(2) : '0',
        cpi: demand.installs > 0 ? Math.round(demand.spend / demand.installs) : null,
        cpo,
        cpc: demand.clicks > 0 ? Math.round(demand.spend / demand.clicks) : null,
        pacingPct: monthPct > 0 ? Math.round((demand.spend / totalSpend) * 100) : 0,
        dailyRate: Math.round(demandDailyRate),
        projectedMonthEnd: Math.round(demand.spend + demandDailyRate * daysLeft),
        projectedOrders: branchOrders > 0 && cpoDenominator > 0 ? Math.round((cpoDenominator + demandDailyRate * daysLeft) / (cpoDenominator / branchOrders)) : 0,
        topAds: demand.ads.slice(0, 5).map(a => ({ ...a, cpi: a.cpi ? Math.round(a.cpi) : null })),
        branchSource: branchOrders > 0,
      },
      total: {
        spend: Math.round(totalSpend),
        installs: supply.installs + demand.installs,
        impressions: supply.impressions + demand.impressions,
        supplySharePct: Math.round((supply.spend / totalSpend) * 100),
        demandSharePct: Math.round((demand.spend / totalSpend) * 100),
        daysLeft,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
