import { NextRequest, NextResponse } from 'next/server'

const META_ACCOUNT_ID = 'act_596746546417726'

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Missing META_ACCESS_TOKEN' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const dateStart = searchParams.get('date_start') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dateEnd = searchParams.get('date_end') || new Date().toISOString().split('T')[0]

  try {
    // ── Step 1: Fetch Meta ad-level insights ──────────────────────────────
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

    // ── Step 2: Detect supply vs demand from app store URL ────────────────
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

    // ── Step 3: Aggregate by side ─────────────────────────────────────────
    const supply = { spend: 0, impressions: 0, clicks: 0, installs: 0, campaigns: new Map<string, boolean>(), ads: [] as any[] }
    const demand = { spend: 0, impressions: 0, clicks: 0, installs: 0, orders: 0, campaigns: new Map<string, boolean>(), ads: [] as any[] }
    // Campaign-level spend for demand (for CPO matching)
    const demandCampaignSpend: Record<string, number> = {}

    activeAds.forEach((a: any) => {
      const side = sideMap[a.ad_id] || 'DEMAND'
      const actions = a.actions || []
      const installs = Number(actions.find((x: any) => x.action_type === 'mobile_app_install')?.value ?? 0)
      const orders = Number(actions.find((x: any) => ['purchase', 'complete_registration', 'fb_mobile_purchase'].includes(x.action_type))?.value ?? 0)
      const spend = Number(a.spend)

      if (side === 'SUPPLY') {
        supply.spend += spend
        supply.impressions += Number(a.impressions || 0)
        supply.clicks += Number(a.clicks || 0)
        supply.installs += installs
        supply.campaigns.set(a.campaign_name, true)
        supply.ads.push({ name: a.ad_name, spend, installs, ctr: Number(a.ctr || 0), cpi: installs > 0 ? spend / installs : null })
      } else {
        demand.spend += spend
        demand.impressions += Number(a.impressions || 0)
        demand.clicks += Number(a.clicks || 0)
        demand.installs += installs
        demand.orders += orders
        demand.campaigns.set(a.campaign_name, true)
        demand.ads.push({ name: a.ad_name, campaign: a.campaign_name, spend, installs, ctr: Number(a.ctr || 0), cpi: installs > 0 ? spend / installs : null })
        // Accumulate campaign-level spend
        const campKey = (a.campaign_name || '').toLowerCase()
        demandCampaignSpend[campKey] = (demandCampaignSpend[campKey] || 0) + spend
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

    // ── Step 4: Fetch Branch first orders per campaign (Facebook only) ────
    let branchOrders = 0
    let performanceSpend = 0
    // Map: branch campaign name → first orders
    const branchOrdersByCampaign: Record<string, number> = {}

    try {
      const branchKey = process.env.BRANCH_KEY
      const branchSecret = process.env.BRANCH_SECRET
      if (branchKey && branchSecret) {
        // Chunk into 7-day windows
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
                const campaignRaw = (result['last_attributed_touch_data_tilde_campaign'] || '').trim()
                const campaignNorm = campaignRaw.toLowerCase()
                const orders = Number(result.total_count || 0)
                const isFacebook = partner.includes('facebook')
                const isExcluded = campaignNorm.includes('_d_partner') || campaignNorm.includes('_brand')
                if (isFacebook && !isExcluded && orders > 0) {
                  branchOrders += orders
                  branchOrdersByCampaign[campaignNorm] = (branchOrdersByCampaign[campaignNorm] || 0) + orders
                }
              }
            }
          } catch {}
        }

        // Match Branch campaigns → Meta campaign spend
        for (const [branchCamp, _orders] of Object.entries(branchOrdersByCampaign)) {
          for (const [metaCamp, spend] of Object.entries(demandCampaignSpend)) {
            if (metaCamp.includes(branchCamp) || branchCamp.includes(metaCamp) ||
                metaCamp.replace(/[_\s]/g, '') === branchCamp.replace(/[_\s]/g, '')) {
              performanceSpend += spend
              break
            }
          }
        }
      }
    } catch (_e) {}

    // ── Step 5: Build demand top campaigns by first orders ────────────────
    // Match each Meta campaign to Branch orders
    const demandTopCampaigns = Array.from(demand.campaigns.keys()).map(campName => {
      const campNorm = campName.toLowerCase()
      const campSpend = demandCampaignSpend[campNorm] || 0
      // Find matching Branch orders
      let campOrders = 0
      for (const [branchCamp, orders] of Object.entries(branchOrdersByCampaign)) {
        if (campNorm.includes(branchCamp) || branchCamp.includes(campNorm) ||
            campNorm.replace(/[_\s]/g, '') === branchCamp.replace(/[_\s]/g, '')) {
          campOrders += orders
        }
      }
      const campInstalls = demand.ads.filter(a => a.campaign === campName).reduce((s, a) => s + a.installs, 0)
      return {
        name: campName,
        spend: Math.round(campSpend),
        installs: campInstalls,
        orders: campOrders,
        cpo: campOrders > 0 ? Math.round(campSpend / campOrders) : null,
        ctr: demand.ads.filter(a => a.campaign === campName).length > 0
          ? (demand.ads.filter(a => a.campaign === campName).reduce((s, a) => s + a.ctr, 0) / demand.ads.filter(a => a.campaign === campName).length).toFixed(2)
          : '0',
      }
    }).sort((a, b) => b.orders - a.orders || b.installs - a.installs)

    const cpoDenominator = performanceSpend > 0 ? performanceSpend : demand.spend
    const cpo = branchOrders > 0 ? Math.round(cpoDenominator / branchOrders) : null

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
        pacingPct: totalSpend > 0 ? Math.round((supply.spend / totalSpend) * 100) : 0,
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
        ctr: demand.impressions > 0 ? ((demand.clicks / demand.impressions) * 100).toFixed(2) : '0',
        cpi: demand.installs > 0 ? Math.round(demand.spend / demand.installs) : null,
        cpo,
        cpc: demand.clicks > 0 ? Math.round(demand.spend / demand.clicks) : null,
        pacingPct: totalSpend > 0 ? Math.round((demand.spend / totalSpend) * 100) : 0,
        dailyRate: Math.round(demandDailyRate),
        projectedMonthEnd: Math.round(demand.spend + demandDailyRate * daysLeft),
        projectedOrders: branchOrders > 0 && cpoDenominator > 0 ? Math.round((cpoDenominator + demandDailyRate * daysLeft) / (cpoDenominator / branchOrders)) : 0,
        // Top campaigns by first orders (not installs) for director view
        topCampaigns: demandTopCampaigns.slice(0, 5),
        topAds: demand.ads.slice(0, 5).map(a => ({ ...a, cpi: a.cpi ? Math.round(a.cpi) : null })),
        branchSource: branchOrders > 0,
      },
      total: {
        spend: Math.round(totalSpend),
        installs: supply.installs + demand.installs,
        impressions: supply.impressions + demand.impressions,
        supplySharePct: totalSpend > 0 ? Math.round((supply.spend / totalSpend) * 100) : 0,
        demandSharePct: totalSpend > 0 ? Math.round((demand.spend / totalSpend) * 100) : 0,
        daysLeft,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
