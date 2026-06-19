import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { ads, brand } = await request.json()

  if (!ads?.length) return NextResponse.json({ error: 'No ads provided' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })

  const adTexts = ads
    .slice(0, 10)
    .map((ad: any, i: number) => `Ad ${i + 1}:\nTitle: ${ad.creative_title || 'N/A'}\nBody: ${ad.creative_body || 'N/A'}`)
    .join('\n\n---\n\n')

  const prompt = `You are a performance marketing expert analyzing competitor ads for Shiprocket Quick — a last-mile delivery app that recruits delivery partners and serves business owners in India.

Here are ${ads.length} active Meta ads from competitor brand "${brand}":

${adTexts}

Analyze these ads and respond ONLY with a valid JSON object (no markdown, no backticks) in this exact format:
{
  "summary": "2-3 sentence overview of their overall creative strategy",
  "hooks": ["hook pattern 1", "hook pattern 2", "hook pattern 3"],
  "offers": ["offer/incentive 1", "offer/incentive 2", "offer/incentive 3"],
  "formats": ["format 1", "format 2"],
  "ctas": ["CTA 1", "CTA 2", "CTA 3"],
  "angles": ["messaging angle 1", "messaging angle 2", "messaging angle 3"],
  "gaps": ["gap or weakness in their strategy that Shiprocket can exploit 1", "gap 2", "gap 3"],
  "recommendations": ["specific recommendation for Shiprocket Quick based on this analysis 1", "recommendation 2", "recommendation 3"]
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
