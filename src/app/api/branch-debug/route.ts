import { NextResponse } from 'next/server'

export async function GET() {
  const branchKey = process.env.BRANCH_KEY
  const branchSecret = process.env.BRANCH_SECRET
  const appId = process.env.BRANCH_APP_ID || '1342462952309018934'

  if (!branchKey || !branchSecret) {
    return NextResponse.json({ error: 'Missing env vars', has_key: !!branchKey, has_secret: !!branchSecret })
  }

  const credentials = Buffer.from(`${branchKey}:${branchSecret}`).toString('base64')

  // Test 1: Query API with app_id in body
  const body1 = {
    app_id: appId,
    start_date: '2026-06-01',
    end_date: '2026-06-18',
    data_source: 'eo_custom_event',
    dimensions: ['last_attributed_touch_data_tilde_campaign'],
    metrics: ['total_count'],
    granularity: 'all',
    filters: { name: ['first_order_created_fe'] },
  }

  // Test 2: Without app_id
  const body2 = {
    start_date: '2026-06-01',
    end_date: '2026-06-18',
    data_source: 'eo_custom_event',
    dimensions: ['last_attributed_touch_data_tilde_campaign'],
    metrics: ['total_count'],
    granularity: 'all',
    filters: { name: ['first_order_created_fe'] },
  }

  const [res1, res2] = await Promise.all([
    fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
      body: JSON.stringify(body1),
    }),
    fetch('https://api2.branch.io/v1/query/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
      body: JSON.stringify(body2),
    }),
  ])

  const [text1, text2] = await Promise.all([res1.text(), res2.text()])

  return NextResponse.json({
    key_prefix: branchKey.slice(0, 12) + '...',
    secret_prefix: branchSecret.slice(0, 12) + '...',
    app_id: appId,
    key_length: branchKey.length,
    secret_length: branchSecret.length,
    test1_with_app_id: { status: res1.status, body: text1 },
    test2_without_app_id: { status: res2.status, body: text2 },
  })
}
