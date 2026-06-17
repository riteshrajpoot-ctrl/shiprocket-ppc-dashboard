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

    // Campaign-level aggregates for the date range
    const campaigns = await sql`
      SELECT
        campaign_name,
        campaign_id,
        objective,
        SUM(spend) as spend,
        SUM(installs) as installs,
        SUM(clicks) as clicks,
        SUM(leads) as leads,
        SUM(impressions) as impressions,
        CASE WHEN SUM(installs) > 0 THEN ROUND(SUM(spend) / SUM(installs), 1) ELSE 0 END as cpi,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END as ctr
      FROM metrics_daily
      WHERE date >= ${dateStart}::date
        AND date <= ${dateEnd}::date
      GROUP BY campaign_name, campaign_id, objective
      ORDER BY spend DESC
    `

    // Daily trend data for the date range
    const daily = await sql`
      SELECT
        date,
        SUM(spend) as spend,
        SUM(installs) as installs,
        SUM(clicks) as clicks,
        SUM(leads) as leads,
        SUM(impressions) as impressions,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END as ctr,
        CASE WHEN SUM(installs) > 0 THEN ROUND(SUM(spend) / SUM(installs), 1) ELSE 0 END as cpi
      FROM metrics_daily
      WHERE date >= ${dateStart}::date
        AND date <= ${dateEnd}::date
      GROUP BY date
      ORDER BY date ASC
    `

    return NextResponse.json({ campaigns, daily })
  } catch (error) {
    console.error('Metrics API error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
