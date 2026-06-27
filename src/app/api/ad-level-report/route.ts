import { NextRequest, NextResponse } from 'next/server'

const META_ACCOUNT_ID = 'act_596746546417726'

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Missing META_ACCESS_TOKEN' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const dateStart = searchParams.get('date_start') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dateEnd = searchParams.get('date_end') || new Date().toISOString().split('T')[0]
  const withPlacement = searchParams.get('placement') === 'true'

  try {
    // Fetch ad-level insights with creative fields
    const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT_ID}/insights`)
    insightsUrl.searchParams.set('fields', 'ad_id,ad_name,adset_name,campaign_name,account_name,spend,impressions,clicks,ctr,cpc,actions,publisher_platform,platform_position')
    insightsUrl.searchParams.set('level', 'ad')
    if (withPlacement) {
      insightsUrl.searchParams.set('breakdowns', 'publisher_platform,platform_position')
    }
    insightsUrl.searchParams.set('time_range[since]', dateStart)
    insightsUrl.searchParams.set('time_range[until]', dateEnd)
    insightsUrl.searchParams.set('limit', '200')
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
    const creativeMap: Record<string, { body: string; title: string; snapshot_url: string; creative_id: string; ad_side: string; store_url: string }> = {}

    if (adIds.length > 0) {
      // Fetch in batches of 20
      const batchSize = 20
      for (let i = 0; i < adIds.length; i += batchSize) {
        const batch = adIds.slice(i, i + batchSize)
        const batchUrl = new URL(`https://graph.facebook.com/v19.0/`)
        // Use batch request
        const batchReqs = batch.map((id: string) => ({
          method: 'GET',
          relative_url: `${id}?fields=creative{id,body,title,object_story_spec,image_url,thumbnail_url,object_store_url}`
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
                const fullImage =
                  creative.image_url ||
                  creative.object_story_spec?.link_data?.image_hash ||
                  creative.object_story_spec?.photo_data?.url ||
                  creative.thumbnail_url || ''
                const storeUrl =
                  creative.object_store_url ||
                  creative.object_story_spec?.link_data?.link ||
                  creative.object_story_spec?.video_data?.call_to_action?.value?.link || ''
                const adSide = storeUrl.includes('quickpartner') ? 'SUPPLY' : 'DEMAND'
                creativeMap[batch[idx]] = {
                  body: creative.body || creative.object_story_spec?.link_data?.message || creative.object_story_spec?.video_data?.message || '',
                  title: creative.title || creative.object_story_spec?.link_data?.name || '',
                  snapshot_url: fullImage,
                  creative_id: creative.id || '',
                  ad_side: adSide,
                  store_url: storeUrl,
                }
              } catch {}
            }
          })
        }
      }
    }

    // Second pass: for creatives missing full-size image, fetch via adcreatives node
    const missingImage = Object.entries(creativeMap).filter(([, v]) => v.creative_id && !v.snapshot_url)
    if (missingImage.length > 0) {
      const creativeIds = missingImage.map(([, v]) => v.creative_id)
      const batchSize2 = 20
      for (let i = 0; i < creativeIds.length; i += batchSize2) {
        const batch2 = creativeIds.slice(i, i + batchSize2)
        const batchReqs2 = batch2.map((cid: string) => ({
          method: 'GET',
          relative_url: `${cid}?fields=image_url,thumbnail_url`
        }))
        const res2 = await fetch(`https://graph.facebook.com/v19.0/?batch=${encodeURIComponent(JSON.stringify(batchReqs2))}&access_token=${token}&include_headers=false`, { method: 'POST' })
        const json2 = await res2.json()
        if (Array.isArray(json2)) {
          json2.forEach((item: any, idx: number) => {
            if (item.code === 200) {
              try {
                const d = JSON.parse(item.body)
                const adEntry = missingImage[i + idx]
                if (adEntry) {
                  const [adId] = adEntry
                  creativeMap[adId].snapshot_url = d.image_url || d.thumbnail_url || ''
                }
              } catch {}
            }
          })
        }
      }
    }

    // Third pass: fetch ad preview iframe URLs (DESKTOP_FEED_STANDARD gives best quality)
    const previewMap: Record<string, string> = {}
    const adIdsForPreview = insightsData.filter((a: any) => Number(a.spend) > 0).map((a: any) => a.ad_id).slice(0, 60)
    const previewBatchSize = 10
    for (let i = 0; i < adIdsForPreview.length; i += previewBatchSize) {
      const batch = adIdsForPreview.slice(i, i + previewBatchSize)
      const batchReqs = batch.map((id: string) => ({
        method: 'GET',
        relative_url: `${id}/previews?ad_format=MOBILE_FEED_STANDARD`
      }))
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${token}&include_headers=false`, { method: 'POST' })
        const json = await res.json()
        if (Array.isArray(json)) {
          json.forEach((item: any, idx: number) => {
            if (item.code === 200) {
              try {
                const d = JSON.parse(item.body)
                const iframeHtml: string = d.data?.[0]?.body || ''
                // Extract src from iframe tag
                const match = iframeHtml.match(/src="([^"]+)"/)
                if (match?.[1]) previewMap[batch[idx]] = match[1].replace(/&amp;/g, '&')
              } catch {}
            }
          })
        }
      } catch {}
    }

    // Map real placement from Meta breakdown fields
    const mapPlacement = (platform: string, position: string): string => {
      const p = (platform || '').toLowerCase()
      const pos = (position || '').toLowerCase()
      if (p === 'instagram') {
        if (pos.includes('reel')) return 'Instagram Reels'
        if (pos.includes('story')) return 'Instagram Stories'
        return 'Instagram Feed'
      }
      if (p === 'facebook') {
        if (pos.includes('video') || pos.includes('instream')) return 'FB In-stream'
        if (pos.includes('story')) return 'FB Stories'
        if (pos.includes('reel')) return 'FB Reels'
        return 'Facebook Feed'
      }
      if (p === 'audience_network') return 'Audience Network'
      if (p === 'messenger') return 'Messenger'
      return 'Facebook Feed'
    }

    // Merge insights + creatives
    const ads = insightsData
      .filter((a: any) => Number(a.spend) > 0)
      .sort((a: any, b: any) => Number(b.spend) - Number(a.spend))
      .map((a: any) => {
        const actions = a.actions || []
        const installs = Number(actions.find((x: any) => x.action_type === 'mobile_app_install')?.value ?? 0)
        const creative = creativeMap[a.ad_id] || {}
        const placement = mapPlacement(a.publisher_platform || '', a.platform_position || '')

        return {
          ad_id: a.ad_id,
          ad_name: a.ad_name,
          campaign_name: a.campaign_name,
          adset_name: a.adset_name,
          page_name: a.account_name || '',
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
          ad_snapshot_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=596746546417726&selected_ad_ids=${a.ad_id}`,
          preview_url: previewMap[a.ad_id] || '',
          ad_side: creative.ad_side || 'DEMAND',
          store_url: creative.store_url || '',
          placement,
          publisher_platform: a.publisher_platform || '',
          platform_position: a.platform_position || '',
        }
      })

    return NextResponse.json({ ads, total: ads.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
