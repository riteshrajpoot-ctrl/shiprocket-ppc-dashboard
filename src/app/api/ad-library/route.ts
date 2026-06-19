import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const brand = searchParams.get('brand')

  if (!brand) return NextResponse.json({ error: 'Brand name required' }, { status: 400 })

  const token = process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Missing META_ACCESS_TOKEN' }, { status: 500 })

  try {
    const url = new URL('https://graph.facebook.com/v19.0/ads_archive')
    url.searchParams.set('access_token', token)
    url.searchParams.set('ad_reached_countries', '["IN"]')
    url.searchParams.set('search_terms', brand)
    url.searchParams.set('ad_active_status', 'ACTIVE')
    url.searchParams.set('fields', 'id,page_name,creative_body,creative_title,creative_link_caption,ad_snapshot_url,delivery_start_time,impressions,spend,currency')
    url.searchParams.set('limit', '20')

    const res = await fetch(url.toString())
    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.error?.message || 'Meta API error' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ads: data.data || [], total: data.data?.length || 0 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
