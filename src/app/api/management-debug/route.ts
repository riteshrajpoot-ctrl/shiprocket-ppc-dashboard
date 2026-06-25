import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET
  const appId = process.env.BRANCH_APP_ID

  // Step 1 — check all env vars exist
  if (!branchKey || !branchSecret || !appId) {
    return NextResponse.json({
      error: 'Missing env vars',
      BRANCH_KEY: !!branchKey,
      BRANCH_SECRET: !!branchSecret,
      BRANCH_APP_ID: !!appId,
      fix: 'Add missing vars to Vercel → Settings → Environment Variables then redeploy'
    })
  }

  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')
  const today = new Date().toISOString().split('T')[0]
  const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  // Step 2 — use EXACT same format as working /api/branch-metrics route
  const body = {
    app_id: appId,
    start_date: startDate,
    end_date: today,
    data_source: 'eo_custom_event',
    dimensions: ['last_attributed_touch_data_tilde_advertising_partner_name'],
    metrics: ['total_count'],
    filters: { name: ['first_order_created_fe'] },
    granularity: 'all',
  }

  try {
    const res = await fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}

    // Step 3 — extract Facebook orders if successful
    let facebookOrders = 0
    if (parsed?.results) {
      parsed.results.forEach((row: any) => {
        const partner = (row.dimensions?.last_attributed_touch_data_tilde_advertising_partner_name || '').toLowerCase()
        if (partner.includes('facebook')) {
          facebookOrders += Number(row.result?.total_count || 0)
        }
      })
    }

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      facebook_orders_found: facebookOrders,
      all_results: parsed?.results?.map((r: any) => ({
        partner: r.dimensions?.last_attributed_touch_data_tilde_advertising_partner_name,
        count: r.result?.total_count,
      })) || [],
      raw_error: res.ok ? null : parsed,
      env_check: {
        BRANCH_KEY_prefix: branchKey.substring(0, 12),
        BRANCH_APP_ID: appId,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}
