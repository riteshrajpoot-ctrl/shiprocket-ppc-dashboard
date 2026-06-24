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

  const prompt = `You are a top performance creative writer for Shiprocket Quick — India's on-demand 3-wheeler delivery app.

Brief:
- Objective: ${objective}
- Target audience: ${audience}
- Key offer/USP: ${offer}
- Tone: ${tone}
${refSection}

STRICT RULES:
1. Hook: MAX 8 words. Must create instant curiosity or urgency. No generic phrases like "Earn money" or "Join us"
2. Body: MAX 2 short sentences. One problem, one solution. No fluff.
3. CTA: 3-5 words max. Action verb first. e.g. "Abhi Download Karo", "Book First Ride", "Partner Bano Aaj"
4. Hinglish: Mix Hindi + English naturally like real conversations, not forced translation
5. Each variant must have a GENUINELY different angle and emotional trigger
6. Never mention "1-Wheeler" — always "3-Wheeler" for vehicle type
7. Be specific with numbers if offer has them (₹250, 3 orders, etc.)

Return ONLY valid JSON, no markdown:
{
  "variants": [
    {
      "variant": 1,
      "format": "Video ad",
      "angle": "<2-3 word angle name>",
      "hook": "<max 8 words>",
      "body": "<max 2 sentences>",
      "cta": "<3-5 words>"
    },
    {
      "variant": 2,
      "format": "Carousel ad",
      "angle": "<2-3 word angle name>",
      "hook": "<max 8 words>",
      "body": "<max 2 sentences>",
      "cta": "<3-5 words>"
    },
    {
      "variant": 3,
      "format": "Static image",
      "angle": "<2-3 word angle name>",
      "hook": "<max 8 words>",
      "body": "<max 2 sentences>",
      "cta": "<3-5 words>"
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
