import { NextRequest, NextResponse } from 'next/server'

const META_ACCOUNT_ID = 'act_596746546417726'

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Missing META_ACCESS_TOKEN' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const dateStart = searchParams.get('date_start') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dateEnd = searchParams.get('date_end') || new Date().toISOString().split('T')[0]

  try {
    // Fetch ad-level insights with creative fields
    const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    insightsUrl.searchParams.set('fields', 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions')
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('time_range[since]', dateStart)
    insightsUrl.searchParams.set('time_range[until]', dateEnd)
    insightsUrl.searchParams.set('limit', '100')
    insightsUrl.searchParams.set('access_token', token)

    const insightsRes = await fetch(insightsUrl.toString())
    const insightsJson = await insightsRes.json()

    if (insightsJson.error) {
      return NextResponse.json({ error: insightsJson.error.message }, { status: 400 })
    }

    const insightsData: any[] = insightsJson.data || []

    // For each ad, fetch creative details (body, title, snapshot URL)
    const adIds = insightsData.map((a: any) => a.ad_id).filter(Boolean)

    // Batch fetch ad creatives
    const creativeMap: Record<string, { body: string; title: string; snapshot_url: string }> = {}

    if (adIds.length > 0) {
      // Fetch in batches of 20
      const batchSize = 20
      for (let i = 0; i < adIds.length; i += batchSize) {
        const batch = adIds.slice(i, i + batchSize)
        const batchUrl = new URL(`https://graph.facebook.com/v19.0/`)
        // Use batch request
        const batchReqs = batch.map((id: string) => ({
          method: 'GET',
          relative_url: `${id}?fields=creative{body,title,effective_object_story_id,thumbnail_url,object_story_spec}`
        }))

        const batchRes = await fetch(`https://graph.facebook.com/v19.0/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${token}&include_headers=false`, {
          method: 'POST'
        })
        const batchJson = await batchRes.json()

        if (Array.isArray(batchJson)) {
          batchJson.forEach((item: any, idx: number) => {
            if (item.code === 200) {
              try {
                const adData = JSON.parse(item.body)
                const creative = adData.creative || {}
                creativeMap[batch[idx]] = {
                  body: creative.body || creative.object_story_spec?.link_data?.message || '',
                  title: creative.title || creative.object_story_spec?.link_data?.name || '',
                  snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=${batch[idx]}&access_token=${token}`
                }
              } catch {}
            }
          })
        }
      }
    }

    // Merge insights + creatives
    const ads = insightsData
      .filter((a: any) => Number(a.spend) > 0)
      .sort((a: any, b: any) => Number(b.spend) - Number(a.spend))
      .map((a: any) => {
        const actions = a.actions || []
        const installs = Number(actions.find((x: any) => x.action_type === 'mobile_app_install')?.value ?? 0)
        const creative = creativeMap[a.ad_id] || {}

        return {
          ad_id: a.ad_id,
          ad_name: a.ad_name,
          campaign_name: a.campaign_name,
          adset_name: a.adset_name,
          spend: a.spend,
          impressions: a.impressions,
          clicks: a.clicks,
          ctr: a.ctr || '0',
          cpc: a.cpc || '0',
          installs,
          cpi: installs > 0 ? (Number(a.spend) / installs).toFixed(0) : null,
          creative_body: creative.body || '',
          creative_title: creative.title || '',
          thumbnail_url: creative.snapshot_url || '',
          ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=${a.ad_id}&access_token=${token}`,
        }
      })

    return NextResponse.json({ ads, total: ads.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
