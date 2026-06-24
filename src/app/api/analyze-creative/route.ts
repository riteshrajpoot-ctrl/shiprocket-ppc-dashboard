import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { image, copy, metrics } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const contentBlocks: any[] = []

  if (image) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: image }
    })
  }

  const metricsContext = metrics
    ? `\nActual performance data:\n- Spend: ${metrics.spend}\n- CTR: ${metrics.ctr}%\n- CPC: ${metrics.cpc}\n- Installs: ${metrics.installs || 'N/A'}\n- CPI: ₹${metrics.cpi || 'N/A'}\n- Impressions: ${metrics.impressions}`
    : ''

  const promptText = `You are a senior performance marketing analyst. Analyse this ad creative${copy ? ' and copy' : ''}${metrics ? ' along with its actual performance metrics' : ''}.
${copy ? `\nAd details:\n${copy}` : ''}
${metricsContext}

Your analysis should factor in the actual performance data if provided — a high CTR validates the hook, low CPI validates the overall creative. Be specific and actionable.

Return ONLY valid JSON, no markdown:
{
  "overall_score": <number 1-10>,
  "summary": "<2-3 sentence overall assessment referencing actual metrics if available>",
  "hook_strength": "<Strong/Medium/Weak — one sentence why>",
  "cta_effectiveness": "<Strong/Medium/Weak — one sentence why>",
  "audience_fit": "<assessment of how well the creative fits the target audience>",
  "tone": "<tone description>",
  "improvements": ["<specific improvement 1>", "<specific improvement 2>", "<specific improvement 3>"]
}`

  contentBlocks.push({ type: 'text', text: promptText })

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
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return NextResponse.json(JSON.parse(clean))
  } catch {
    return NextResponse.json({ error: 'Parse failed', raw: text }, { status: 500 })
  }
}
