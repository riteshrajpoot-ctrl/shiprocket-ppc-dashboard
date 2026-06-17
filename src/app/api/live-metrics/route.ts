import { NextResponse } from 'next/server'

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!
const META_ACCOUNT_ID = 'act_596746546417726'
const BRANCH_KEY = process.env.BRANCH_KEY!
const BRANCH_SECRET = process.env.BRANCH_SECRET!

const CPI_TARGET = 120
const CPL_TARGET = 80
const CTR_MIN = 0.5
const FREQUENCY_MAX = 2.5
const MONTHLY_BUDGET = 350000
const CPO_TARGET = 800

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dateEnd = searchParams.get('date_end') ||
      new Date().toISOString().split('T')[0]

    // ── Fetch Meta + Branch in parallel ──────────────────────────────────────
    const campaignUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    campaignUrl.searchParams.set('fields', 'campaign_name,campaign_id,spend,impressions,clicks,ctr,cpc,reach,frequency,actions,objective')
    campaignUrl.searchParams.set('level', 'campaign')
    campaignUrl.searchParams.set('time_range[since]', dateStart)
    campaignUrl.searchParams.set('time_range[until]', dateEnd)
    campaignUrl.searchParams.set('limit', '50')
    campaignUrl.searchParams.set('access_token', META_ACCESS_TOKEN)

    const dailyUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    dailyUrl.searchParams.set('fields', 'spend,impressions,clicks,ctr,actions')
    dailyUrl.searchParams.set('level', 'account')
    dailyUrl.searchParams.set('time_increment', '1')
    dailyUrl.searchParams.set('time_range[since]', dateStart)
    dailyUrl.searchParams.set('time_range[until]', dateEnd)
    dailyUrl.searchParams.set('limit', '90')
    dailyUrl.searchParams.set('access_token', META_ACCESS_TOKEN)

    const branchInstallBody = {
      branch_key: BRANCH_KEY,
      branch_secret: BRANCH_SECRET,
      start_date: dateStart,
      end_date: dateEnd,
      data_source: 'eo_custom_event',
      dimensions: ['last_attributed_touch_data_tilde_campaign'],
      aggregation: 'unique_count',
      granularity: 'all',
      events: ['FIRST_ORDER_CREATED_FE']
    }

    const branchOrderBody = {
      ...branchInstallBody,
      data_source: 'eo_install',
      events: ['INSTALL']
    }

    const [campaignRes, dailyRes, branchInstallRes, branchOrderRes] = await Promise.all([
      fetch(campaignUrl.toString()),
      fetch(dailyUrl.toString()),
      fetch('https://api2.branch.io/v1/query/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branchInstallBody)
      }).catch(() => null),
      fetch('https://api2.branch.io/v1/query/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branchOrderBody)
      }).catch(() => null)
    ])

    if (!campaignRes.ok) throw new Error(`Meta API error: ${campaignRes.status}`)
    const campaignJson = await campaignRes.json()
    const rawCampaigns: any[] = campaignJson.data || []

    const dailyJson = await dailyRes.json()
    const rawDaily: any[] = dailyJson.data || []

    // ── Parse Branch data ─────────────────────────────────────────────────────
    const branchMap: Record<string, { installs: number; firstOrders: number }> = {}

    if (branchInstallRes?.ok) {
      const json = await branchInstallRes.json()
      const results: any[] = json.results || []
      for (const row of results) {
        const name = row.result?.last_attributed_touch_data_tilde_campaign
        if (!name) continue
        if (!branchMap[name]) branchMap[name] = { installs: 0, firstOrders: 0 }
        branchMap[name].installs = Number(row.result?.total_count || 0)
      }
    }

    if (branchOrderRes?.ok) {
      const json = await branchOrderRes.json()
      const results: any[] = json.results || []
      for (const row of results) {
        const name = row.result?.last_attributed_touch_data_tilde_campaign
        if (!name) continue
        if (!branchMap[name]) branchMap[name] = { installs: 0, firstOrders: 0 }
        branchMap[name].firstOrders = Number(row.result?.total_count || 0)
      }
    }

    // ── Transform campaigns ───────────────────────────────────────────────────
    const campaigns = rawCampaigns.map((c: any) => {
      const actions: any[] = c.actions || []
      const installs = Number(actions.find((a: any) => a.action_type === 'mobile_app_install')?.value ?? 0)
      const leads = Number(actions.find((a: any) => a.action_type === 'onsite_conversion.lead')?.value ?? 0)
      const spend = Number(c.spend)
      const clicks = Number(c.clicks)
      const impressions = Number(c.impressions)
      const frequency = Number(c.frequency ?? 0)

      // Match Branch data by campaign name (Branch uses full name, Meta strips prefix)
      const branchKey = c.campaign_name
      const branch = branchMap[branchKey] || { installs: 0, firstOrders: 0 }
      const firstOrders = branch.firstOrders
      const branchInstalls = branch.installs
      const cpo = firstOrders > 0 ? Math.round(spend / firstOrders * 10) / 10 : 0
      const installToOrderRate = branchInstalls > 0 ? Math.round(firstOrders / branchInstalls * 1000) / 10 : 0

      return {
        campaign_name: c.campaign_name.replace(/SR_Quick_|SR_QUICK_/gi, ''),
        campaign_id: c.campaign_id,
        objective: c.objective,
        spend: Math.round(spend * 100) / 100,
        installs,
        leads,
        clicks,
        impressions,
        frequency: Math.round(frequency * 100) / 100,
        reach: Number(c.reach ?? 0),
        cpi: installs > 0 ? Math.round(spend / installs * 10) / 10 : 0,
        ctr: impressions > 0 ? Math.round(clicks / impressions * 10000) / 100 : 0,
        cpl: leads > 0 ? Math.round(spend / leads * 10) / 10 : 0,
        branch_installs: branchInstalls,
        first_orders: firstOrders,
        cpo,
        install_to_order_rate: installToOrderRate,
      }
    })

    // ── Transform daily ───────────────────────────────────────────────────────
    const daily = rawDaily.map((d: any) => {
      const actions: any[] = d.actions || []
      const installs = Number(actions.find((a: any) => a.action_type === 'mobile_app_install')?.value ?? 0)
      const spend = Number(d.spend)
      const clicks = Number(d.clicks)
      const impressions = Number(d.impressions)
      return {
        date: d.date_start,
        spend: Math.round(spend * 100) / 100,
        installs,
        clicks,
        impressions,
        ctr: impressions > 0 ? Math.round(clicks / impressions * 10000) / 100 : 0,
        cpi: installs > 0 ? Math.round(spend / installs * 10) / 10 : 0
      }
    })

    // ── Totals ────────────────────────────────────────────────────────────────
    const totals: any = campaigns.reduce((acc: any, c: any) => ({
      spend: acc.spend + c.spend,
      installs: acc.installs + c.installs,
      leads: acc.leads + c.leads,
      clicks: acc.clicks + c.clicks,
      impressions: acc.impressions + c.impressions,
      first_orders: acc.first_orders + c.first_orders,
    }), { spend: 0, installs: 0, leads: 0, clicks: 0, impressions: 0, first_orders: 0 })
    totals.cpi = totals.installs > 0 ? Math.round(totals.spend / totals.installs * 10) / 10 : 0
    totals.ctr = totals.impressions > 0 ? Math.round(totals.clicks / totals.impressions * 10000) / 100 : 0
    totals.cpl = totals.leads > 0 ? Math.round(totals.spend / totals.leads * 10) / 10 : 0
    totals.cpo = totals.first_orders > 0 ? Math.round(totals.spend / totals.first_orders * 10) / 10 : 0

    // ── Dynamic alerts ────────────────────────────────────────────────────────
    const alerts: any[] = []
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const expectedPct = today.getDate() / daysInMonth
    const actualPct = totals.spend / MONTHLY_BUDGET

    if (actualPct > expectedPct + 0.1) alerts.push({ severity: 'critical', msg: `Budget overpacing — ₹${Math.round(totals.spend / 1000)}K spent (${Math.round(actualPct * 100)}% of monthly budget)`, time: 'Now', category: 'budget' })
    else if (actualPct < expectedPct - 0.15) alerts.push({ severity: 'warning', msg: `Budget underpacing — only ${Math.round(actualPct * 100)}% of monthly budget used`, time: 'Now', category: 'budget' })

    campaigns.filter((c: any) => c.cpi > CPI_TARGET && c.installs > 0).forEach((c: any) => {
      alerts.push({ severity: 'critical', msg: `${c.campaign_name} CPI ₹${Math.round(c.cpi)} — above ₹${CPI_TARGET} target`, time: 'Now', category: 'cpi' })
    })
    campaigns.filter((c: any) => c.cpl > CPL_TARGET && c.leads > 0).forEach((c: any) => {
      alerts.push({ severity: 'critical', msg: `${c.campaign_name} CPL ₹${Math.round(c.cpl)} — above ₹${CPL_TARGET} target`, time: 'Now', category: 'cpl' })
    })
    campaigns.filter((c: any) => c.cpo > CPO_TARGET && c.first_orders > 0).forEach((c: any) => {
      alerts.push({ severity: 'warning', msg: `${c.campaign_name} CPO ₹${Math.round(c.cpo)} — above ₹${CPO_TARGET} target`, time: 'Now', category: 'cpo' })
    })
    campaigns.filter((c: any) => c.ctr < CTR_MIN && c.impressions > 10000 && !['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).forEach((c: any) => {
      alerts.push({ severity: 'warning', msg: `${c.campaign_name} CTR ${c.ctr.toFixed(2)}% — below ${CTR_MIN}% threshold`, time: 'Now', category: 'ctr' })
    })
    campaigns.filter((c: any) => c.frequency > FREQUENCY_MAX).forEach((c: any) => {
      alerts.push({ severity: 'warning', msg: `${c.campaign_name} frequency ${c.frequency.toFixed(1)} — consider creative refresh`, time: 'Now', category: 'frequency' })
    })

    // ── Health score ──────────────────────────────────────────────────────────
    const pacingDiff = Math.abs(actualPct - expectedPct)
    const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const activeCampaigns = campaigns.filter((c: any) => c.spend > 500).length
    const totalReach = campaigns.reduce((a: number, c: any) => a + c.reach, 0)
    const reachRatio = totals.impressions > 0 ? totalReach / totals.impressions : 0
    const wastedSpend = campaigns.filter((c: any) => c.cpi > CPI_TARGET * 2 && c.installs > 0).reduce((a: number, c: any) => a + c.spend, 0)
    const wastedPct = totals.spend > 0 ? wastedSpend / totals.spend : 0

    const cpiScore = totals.cpi > 0 ? (totals.cpi <= CPI_TARGET ? 20 : Math.max(0, 20 - Math.round((totals.cpi / CPI_TARGET - 1) * 40))) : 15
    const healthBreakdown = [
      { label: 'Budget pacing', score: Math.max(0, 20 - Math.round(pacingDiff * 100)), max: 20 },
      { label: 'CPI vs target', score: cpiScore, max: 20 },
      { label: 'CTR quality', score: avgCtr >= 1.0 ? 15 : avgCtr >= 0.7 ? 12 : avgCtr >= 0.5 ? 9 : avgCtr >= 0.3 ? 6 : 3, max: 15 },
      { label: 'Ad strength', score: activeCampaigns >= 6 ? 15 : activeCampaigns >= 4 ? 12 : activeCampaigns >= 2 ? 9 : 6, max: 15 },
      { label: 'Reach diversity', score: reachRatio >= 0.6 ? 15 : reachRatio >= 0.4 ? 12 : reachRatio >= 0.25 ? 8 : 5, max: 15 },
      { label: 'Wasted spend', score: wastedPct < 0.05 ? 15 : wastedPct < 0.15 ? 10 : wastedPct < 0.3 ? 5 : 2, max: 15 },
    ]
    const health = Math.min(100, Math.max(0, healthBreakdown.reduce((a, s) => a + s.score, 0)))

    // ── Budget optimizer — now uses CPO when available ────────────────────────
    const installCampaigns = campaigns.filter((c: any) => c.installs > 0 && ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective))

    // Sort by CPO if available, else CPI
    const hasCpoData = installCampaigns.some((c: any) => c.first_orders > 0)
    const sorted = [...installCampaigns].sort((a: any, b: any) => {
      if (hasCpoData) {
        if (a.cpo > 0 && b.cpo > 0) return a.cpo - b.cpo
        if (a.cpo > 0) return -1
        if (b.cpo > 0) return 1
      }
      return a.cpi - b.cpi
    })
    const best: any = sorted[0]

    const budgetSuggestions = installCampaigns.map((c: any) => {
      const ratio = best ? (hasCpoData && c.cpo > 0 ? c.cpo / (best.cpo || 1) : c.cpi / (best.cpi || 1)) : 1
      let action: 'scale' | 'maintain' | 'reduce' | 'pause'
      let suggestedChange = 0
      if (ratio <= 1.2) { action = 'scale'; suggestedChange = 20 }
      else if (ratio <= 2) { action = 'maintain'; suggestedChange = 0 }
      else if (ratio <= 3.5) { action = 'reduce'; suggestedChange = -30 }
      else { action = 'pause'; suggestedChange = -100 }
      const metric = hasCpoData && c.cpo > 0 ? `CPO ₹${Math.round(c.cpo)}` : `CPI ₹${Math.round(c.cpi)}`
      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        current_spend: c.spend,
        cpi: c.cpi,
        cpo: c.cpo,
        installs: c.installs,
        first_orders: c.first_orders,
        action,
        suggested_change_pct: suggestedChange,
        reason: action === 'scale' ? `Best ${metric} — scale up` : action === 'pause' ? `${metric} is ${Math.round(ratio)}x above best` : action === 'reduce' ? `${metric} — reduce spend` : `${metric} — maintain`
      }
    })

    return NextResponse.json({ campaigns, daily, totals, alerts: alerts.slice(0, 6), health, healthBreakdown, budgetSuggestions, source: 'live' })

  } catch (error: any) {
    console.error('Live metrics error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
