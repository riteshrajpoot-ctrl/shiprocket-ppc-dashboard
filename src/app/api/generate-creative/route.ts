import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { objective, audience, offer, tone, refCreative, refImage } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const contentBlocks: any[] = []

  if (refImage) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: refImage }
    })
  }

  const refSection = refCreative || refImage
    ? `\nREFERENCE CREATIVE PROVIDED:${refImage ? ' (see image above)' : ''}${refCreative ? `\n"${refCreative}"` : ''}

Study this reference carefully — match its:
- Language style and Hinglish ratio
- Copy length and sentence structure  
- Emotional angle and messaging approach
- Whether it is supply-side (partner/earning focused) or demand-side (customer/order focused)
Write new variants that feel like they come from the same creative family.`
    : `\nNo reference provided — write in natural Hinglish suited to the audience.`

  const prompt = `You are a senior performance creative strategist at Shiprocket.

Brief:
- Objective: ${objective}
- Target audience: ${audience}
- Key offer/USP: ${offer}
- Tone: ${tone}
${refSection}

Write 3 distinct ad script variants. Each must:
1. Match the reference style and angle if provided (supply-side OR demand-side — follow the reference)
2. Use natural Hinglish
3. Have a punchy hook under 10 words
4. Each variant should have a genuinely different angle

Return ONLY valid JSON, no markdown:
{
  "variants": [
    {
      "variant": 1,
      "format": "Video ad",
      "angle": "<angle name>",
      "hook": "<hook text>",
      "body": "<body copy 2-3 sentences>",
      "cta": "<CTA text>"
    },
    {
      "variant": 2,
      "format": "Carousel ad",
      "angle": "<angle name>",
      "hook": "<hook text>",
      "body": "<body copy>",
      "cta": "<CTA text>"
    },
    {
      "variant": 3,
      "format": "Static image",
      "angle": "<angle name>",
      "hook": "<hook text>",
      "body": "<body copy>",
      "cta": "<CTA text>"
    }
  ]
}`

  contentBlocks.push({ type: 'text', text: prompt })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
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
