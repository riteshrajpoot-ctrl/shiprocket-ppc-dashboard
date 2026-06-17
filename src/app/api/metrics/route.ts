import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start')
    const dateEnd = searchParams.get('date_end')

    if (!dateStart || !dateEnd) {
      return NextResponse.json({ error: 'date_start and date_end required' }, { status: 400 })
    }

    const sql = neon(process.env.DATABASE_URL!)

    // Campaign-level aggregates using actual column names
    const campaigns = await sql`
      SELECT
        campaign_name,
        campaign_id,
        account_id,
        SUM(spend) as spend,
        SUM(ftrs) as installs,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        SUM(fts) as fts,
        CASE WHEN SUM(ftrs) > 0 THEN ROUND(SUM(spend) / SUM(ftrs), 1) ELSE 0 END as cpi,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END as ctr,
        AVG(impression_share) as impression_share
      FROM metrics_daily
      WHERE date >= ${dateStart}::date
        AND date <= ${dateEnd}::date
      GROUP BY campaign_name, campaign_id, account_id
      ORDER BY spend DESC
    `

    // Daily trend data
    const daily = await sql`
      SELECT
        date,
        SUM(spend) as spend,
        SUM(ftrs) as installs,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        SUM(fts) as fts,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END as ctr,
        CASE WHEN SUM(ftrs) > 0 THEN ROUND(SUM(spend) / SUM(ftrs), 1) ELSE 0 END as cpi
      FROM metrics_daily
      WHERE date >= ${dateStart}::date
        AND date <= ${dateEnd}::date
      GROUP BY date
      ORDER BY date ASC
    `

    return NextResponse.json({ campaigns, daily })

  } catch (error: any) {
    console.error('Metrics API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
