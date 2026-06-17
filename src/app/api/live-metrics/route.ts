import { NextResponse } from 'next/server'

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!
const META_ACCOUNT_ID = 'act_596746546417726'

// Budget targets per campaign objective
const CPI_TARGET = 120
const CPL_TARGET = 80
const CTR_MIN = 0.5
const FREQUENCY_MAX = 2.5
const MONTHLY_BUDGET = 350000

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dateEnd = searchParams.get('date_end') ||
      new Date().toISOString().split('T')[0]

    // 1. Campaign-level aggregates — add frequency
    const campaignUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    campaignUrl.searchParams.set('fields', 'campaign_name,campaign_id,spend,impressions,clicks,ctr,cpc,reach,frequency,actions,objective')
    campaignUrl.searchParams.set('level', 'campaign')
    campaignUrl.searchParams.set('time_range[since]', dateStart)
    campaignUrl.searchParams.set('time_range[until]', dateEnd)
    campaignUrl.searchParams.set('limit', '50')
    campaignUrl.searchParams.set('access_token', META_ACCESS_TOKEN)

    const campaignRes = await fetch(campaignUrl.toString())
    if (!campaignRes.ok) throw new Error(`Meta API error: ${campaignRes.status}`)
    const campaignJson = await campaignRes.json()
    const rawCampaigns = campaignJson.data || []

    // 2. Daily aggregates
    const dailyUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    dailyUrl.searchParams.set('fields', 'spend,impressions,clicks,ctr,actions')
    dailyUrl.searchParams.set('level', 'account')
    dailyUrl.searchParams.set('time_increment', '1')
    dailyUrl.searchParams.set('time_range[since]', dateStart)
    dailyUrl.searchParams.set('time_range[until]', dateEnd)
    dailyUrl.searchParams.set('limit', '90')
    dailyUrl.searchParams.set('access_token', META_ACCESS_TOKEN)

    const dailyRes = await fetch(dailyUrl.toString())
    const dailyJson = await dailyRes.json()
    const rawDaily = dailyJson.data || []

    // Transform campaigns
    const campaigns = rawCampaigns.map((c: any) => {
      const actions = c.actions || []
      const installs = Number(actions.find((a: any) => a.action_type === 'mobile_app_install')?.value ?? 0)
      const leads = Number(actions.find((a: any) => a.action_type === 'onsite_conversion.lead')?.value ?? 0)
      const spend = Number(c.spend)
      const clicks = Number(c.clicks)
      const impressions = Number(c.impressions)
      const frequency = Number(c.frequency ?? 0)

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
      }
    })

    // Transform daily
    const daily = rawDaily.map((d: any) => {
      const actions = d.actions || []
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

    // Totals
    const totals = campaigns.reduce((acc: any, c: any) => ({
      spend: acc.spend + c.spend,
      installs: acc.installs + c.installs,
      leads: acc.leads + c.leads,
      clicks: acc.clicks + c.clicks,
      impressions: acc.impressions + c.impressions,
    }), { spend: 0, installs: 0, leads: 0, clicks: 0, impressions: 0 })
    totals.cpi = totals.installs > 0 ? Math.round(totals.spend / totals.installs * 10) / 10 : 0
    totals.ctr = totals.impressions > 0 ? Math.round(totals.clicks / totals.impressions * 10000) / 100 : 0
    totals.cpl = totals.leads > 0 ? Math.round(totals.spend / totals.leads * 10) / 10 : 0

    // ── Dynamic alerts ────────────────────────────────────────────────────────
    const alerts: any[] = []

    // Budget pacing (MTD only)
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const dayOfMonth = today.getDate()
    const expectedPct = dayOfMonth / daysInMonth
    const actualPct = totals.spend / MONTHLY_BUDGET
    if (actualPct > expectedPct + 0.1) {
      alerts.push({ severity: 'critical', msg: `Budget overpacing — ₹${Math.round(totals.spend / 1000)}K spent (${Math.round(actualPct * 100)}% of monthly budget)`, time: 'Now', category: 'budget' })
    } else if (actualPct < expectedPct - 0.15) {
      alerts.push({ severity: 'warning', msg: `Budget underpacing — only ${Math.round(actualPct * 100)}% of monthly budget used`, time: 'Now', category: 'budget' })
    }

    // High CPI campaigns
    campaigns.filter((c: any) => c.cpi > CPI_TARGET && c.installs > 0).forEach((c: any) => {
      alerts.push({ severity: 'critical', msg: `${c.campaign_name} CPI ₹${Math.round(c.cpi)} — ${Math.round(c.cpi / CPI_TARGET)}x above ₹${CPI_TARGET} target`, time: 'Now', category: 'cpi' })
    })

    // High CPL
    campaigns.filter((c: any) => c.cpl > CPL_TARGET && c.leads > 0).forEach((c: any) => {
      alerts.push({ severity: 'critical', msg: `${c.campaign_name} CPL ₹${Math.round(c.cpl)} — above ₹${CPL_TARGET} target`, time: 'Now', category: 'cpl' })
    })

    // Low CTR
    campaigns.filter((c: any) => c.ctr < CTR_MIN && c.impressions > 10000 && !['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)).forEach((c: any) => {
      alerts.push({ severity: 'warning', msg: `${c.campaign_name} CTR ${c.ctr.toFixed(2)}% — below ${CTR_MIN}% threshold`, time: 'Now', category: 'ctr' })
    })

    // High frequency
    campaigns.filter((c: any) => c.frequency > FREQUENCY_MAX).forEach((c: any) => {
      alerts.push({ severity: 'warning', msg: `${c.campaign_name} frequency ${c.frequency.toFixed(1)} — consider creative refresh`, time: 'Now', category: 'frequency' })
    })

    // Zero installs on install campaigns
    campaigns.filter((c: any) => c.installs === 0 && ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective) && c.spend > 1000).forEach((c: any) => {
      alerts.push({ severity: 'critical', msg: `${c.campaign_name} — ₹${Math.round(c.spend / 1000)}K spent with 0 installs tracked`, time: 'Now', category: 'installs' })
    })

    // ── Health score ──────────────────────────────────────────────────────────
    let health = 0

    // Budget pacing (0-20): ideal is within 10% of expected pace
    const pacingDiff = Math.abs(actualPct - expectedPct)
    health += Math.max(0, 20 - Math.round(pacingDiff * 100))

    // CPI vs target (0-20)
    if (totals.cpi > 0) {
      const cpiScore = totals.cpi <= CPI_TARGET ? 20 : Math.max(0, 20 - Math.round((totals.cpi / CPI_TARGET - 1) * 40))
      health += cpiScore
    } else { health += 15 }

    // CTR quality (0-15)
    const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    health += avgCtr >= 1.0 ? 15 : avgCtr >= 0.7 ? 12 : avgCtr >= 0.5 ? 9 : avgCtr >= 0.3 ? 6 : 3

    // Ad strength — based on number of active campaigns (0-15)
    const activeCampaigns = campaigns.filter((c: any) => c.spend > 500).length
    health += activeCampaigns >= 6 ? 15 : activeCampaigns >= 4 ? 12 : activeCampaigns >= 2 ? 9 : 6

    // Reach diversity — based on unique reach vs impressions (0-15)
    const totalReach = campaigns.reduce((a, c) => a + c.reach, 0)
    const reachRatio = totals.impressions > 0 ? totalReach / totals.impressions : 0
    health += reachRatio >= 0.6 ? 15 : reachRatio >= 0.4 ? 12 : reachRatio >= 0.25 ? 8 : 5

    // Wasted spend — campaigns with high CPI (0-15)
    const wastedSpend = campaigns.filter((c: any) => c.cpi > CPI_TARGET * 2 && c.installs > 0).reduce((a, c) => a + c.spend, 0)
    const wastedPct = totals.spend > 0 ? wastedSpend / totals.spend : 0
    health += wastedPct < 0.05 ? 15 : wastedPct < 0.15 ? 10 : wastedPct < 0.3 ? 5 : 2

    health = Math.min(100, Math.max(0, Math.round(health)))

    // Health breakdown for display
    const healthBreakdown = [
      { label: 'Budget pacing', score: Math.max(0, 20 - Math.round(pacingDiff * 100)), max: 20 },
      { label: 'CPI vs target', score: totals.cpi > 0 ? (totals.cpi <= CPI_TARGET ? 20 : Math.max(0, 20 - Math.round((totals.cpi / CPI_TARGET - 1) * 40))) : 15, max: 20 },
      { label: 'CTR quality', score: avgCtr >= 1.0 ? 15 : avgCtr >= 0.7 ? 12 : avgCtr >= 0.5 ? 9 : avgCtr >= 0.3 ? 6 : 3, max: 15 },
      { label: 'Ad strength', score: activeCampaigns >= 6 ? 15 : activeCampaigns >= 4 ? 12 : activeCampaigns >= 2 ? 9 : 6, max: 15 },
      { label: 'Reach diversity', score: reachRatio >= 0.6 ? 15 : reachRatio >= 0.4 ? 12 : reachRatio >= 0.25 ? 8 : 5, max: 15 },
      { label: 'Wasted spend', score: wastedPct < 0.05 ? 15 : wastedPct < 0.15 ? 10 : wastedPct < 0.3 ? 5 : 2, max: 15 },
    ]

    // ── Budget optimizer ──────────────────────────────────────────────────────
    // Find best performer and worst performers
    const installCampaigns = campaigns.filter((c: any) => c.installs > 0 && ['APP_INSTALLS', 'OUTCOME_APP_PROMOTION'].includes(c.objective))
    const sorted = [...installCampaigns].sort((a, b) => a.cpi - b.cpi)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]

    const budgetSuggestions = installCampaigns.map((c: any) => {
      const cpiRatio = best ? c.cpi / best.cpi : 1
      let action: 'scale' | 'maintain' | 'reduce' | 'pause'
      let suggestedChange = 0
      if (cpiRatio <= 1.2) { action = 'scale'; suggestedChange = 20 }
      else if (cpiRatio <= 2) { action = 'maintain'; suggestedChange = 0 }
      else if (cpiRatio <= 3.5) { action = 'reduce'; suggestedChange = -30 }
      else { action = 'pause'; suggestedChange = -100 }
      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        current_spend: c.spend,
        cpi: c.cpi,
        installs: c.installs,
        action,
        suggested_change_pct: suggestedChange,
        reason: action === 'scale' ? `Best CPI ₹${Math.round(c.cpi)} — scale up` : action === 'pause' ? `CPI ₹${Math.round(c.cpi)} is ${Math.round(cpiRatio)}x above best` : action === 'reduce' ? `CPI ₹${Math.round(c.cpi)} — reduce spend` : `CPI ₹${Math.round(c.cpi)} — maintain`
      }
    })

    return NextResponse.json({
      campaigns,
      daily,
      totals,
      alerts: alerts.slice(0, 6),
      health,
      healthBreakdown,
      budgetSuggestions,
      source: 'live'
    })

  } catch (error: any) {
    console.error('Live metrics error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
