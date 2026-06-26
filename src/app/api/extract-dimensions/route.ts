import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })

  const { ad_name, creative_body, campaign_name } = await req.json()

  const prompt = `You are a creative strategist analysing a Meta ad for Shiprocket Quick (an on-demand 3-wheeler delivery service in India).

Ad name: "${ad_name}"
Campaign: "${campaign_name}"
Ad copy: "${creative_body || 'No copy available'}"

Extract the following creative dimensions from this ad. Be specific and consistent — use the same label every time you see the same creative choice. Return ONLY valid JSON, no markdown.

{
  "dimensions": {
    "hook_strategy": "<one of: Question-based | Statistic/number | Pain-point | Aspirational | Testimonial | Direct offer | Challenge | Story-based | Unknown>",
    "script_tone": "<one of: Friendly/Casual | Urgent | Inspiring | Direct/Bold | Conversational | Professional | Unknown>",
    "setting": "<one of: Kirana/local shop | Street/road | Studio | Home delivery | Office/warehouse | Market/mandi | Unknown>",
    "financial_incentive": "<one of: Cashback on first transaction | Daily earnings claim | Percentage discount | Fixed amount off | No incentive | Unknown>",
    "language": "<one of: Hinglish | Hindi | English | Tamil | Bengali | Unknown>",
    "ad_side": "<SUPPLY if targeting delivery partners/drivers/operators, DEMAND if targeting senders/businesses/customers>"
  }
}

If the copy is too short or unclear for a dimension, use "Unknown". Do not invent values.`

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
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const textBlock = data.content?.find((b: any) => b.type === 'text')
    if (!textBlock) return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })

    const clean = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
