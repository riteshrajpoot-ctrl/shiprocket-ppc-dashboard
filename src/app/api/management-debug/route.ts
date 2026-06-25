import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing BRANCH_KEY or BRANCH_SECRET' })
  }

  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')
  const today = new Date().toISOString().split('T')[0]
  const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  try {
    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: today,
        data_source: 'eo_custom_event',
        aggregation: 'total_count',
        dimensions: ['last_attributed_touch_data_tilde_advertising_partner_name'],
        filters: { name: ['first_order_created_fe'] },
        granularity: 'all',
      }),
    })

    const text = await res.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      date_range: `${startDate} to ${today}`,
      raw_response: parsed || text,
      env_check: {
        BRANCH_KEY_exists: !!branchKey,
        BRANCH_KEY_prefix: branchKey.substring(0, 12),
        BRANCH_SECRET_exists: !!branchSecret,
        auth_method: 'Basic Auth header',
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}
