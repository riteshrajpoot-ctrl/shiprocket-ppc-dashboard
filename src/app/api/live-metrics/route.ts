import { NextResponse } from 'next/server'

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!
const META_ACCOUNT_ID = 'act_596746546417726'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start') ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dateEnd = searchParams.get('date_end') ||
      new Date().toISOString().split('T')[0]

    // 1. Fetch campaign-level aggregates
    const campaignUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    campaignUrl.searchParams.set('fields', 'campaign_name,campaign_id,spend,impressions,clicks,ctr,cpc,reach,actions,objective')
    campaignUrl.searchParams.set('level', 'campaign')
    campaignUrl.searchParams.set('time_range[since]', dateStart)
    campaignUrl.searchParams.set('time_range[until]', dateEnd)
    campaignUrl.searchParams.set('limit', '50')
    campaignUrl.searchParams.set('access_token', META_ACCESS_TOKEN)

    const campaignRes = await fetch(campaignUrl.toString())
    if (!campaignRes.ok) throw new Error(`Meta API error: ${campaignRes.status}`)
    const campaignJson = await campaignRes.json()
    const rawCampaigns = campaignJson.data || []

    // 2. Fetch daily aggregates (time_increment=1)
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

      return {
        campaign_name: c.campaign_name.replace(/SR_Quick_|SR_QUICK_/gi, ''),
        campaign_id: c.campaign_id,
        objective: c.objective,
        spend: Math.round(spend * 100) / 100,
        installs,
        leads,
        clicks,
        impressions,
        cpi: installs > 0 ? Math.round(spend / installs * 10) / 10 : 0,
        ctr: impressions > 0 ? Math.round(clicks / impressions * 10000) / 100 : 0
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

    return NextResponse.json({ campaigns, daily, totals, source: 'live' })

  } catch (error: any) {
    console.error('Live metrics error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
