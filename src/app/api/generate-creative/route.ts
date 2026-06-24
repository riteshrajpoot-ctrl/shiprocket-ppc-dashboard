import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { objective, audience, offer, tone, refCreative, refImage, adSide } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const contentBlocks: any[] = []

  if (refImage) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: refImage }
    })
  }

  const refSection = (refCreative || refImage)
    ? `\nREFERENCE CREATIVE:${refImage ? ' (see image above)' : ''}${refCreative ? `\n"${refCreative}"` : ''}
Match its language style, Hinglish ratio, copy length, and messaging direction exactly.`
    : ''

  const sideRule = adSide === 'DEMAND'
    ? `\nCRITICAL — DEMAND-SIDE AD (talking to CUSTOMERS/BUSINESSES who want to book delivery):
- Write about: fast delivery, affordable rates, easy booking, 3-wheeler for sending goods
- NEVER mention: earning, joining as partner, driver recruitment, income, kamai
- Good hooks: "3-Wheeler order in 60 seconds", "Bade orders? 3-Wheeler bhejo abhi"
- Good CTAs: "Abhi Book Karo", "Pehli Delivery Free", "Order Karo Abhi"`
    : adSide === 'SUPPLY'
    ? `\nCRITICAL — SUPPLY-SIDE AD (talking to DRIVERS who want to earn money):
- Write about: earning money, flexible work, guaranteed orders, daily payout
- NEVER mention: booking delivery, customer experience, sending goods
- Good hooks: "Roz kamao apne 3-Wheeler se", "Orders ready hain, driver chahiye"
- Good CTAs: "Partner Bano Aaj", "Kamaana Shuru Karo", "Abhi Join Karo"`
    : ''

  const prompt = `You are a top performance creative writer for Shiprocket Quick — India's on-demand 3-wheeler delivery app.

Brief:
- Objective: ${objective}
- Target audience: ${audience}
- Key offer/USP: ${offer}
- Tone: ${tone}
${sideRule}
${refSection}

RULES:
1. Hook: MAX 8 words. Instant curiosity or urgency. No generic openers.
2. Body: MAX 2 short sentences. One problem, one solution.
3. CTA: 3-5 words. Action verb first.
4. Natural Hinglish. Not forced translation.
5. Each variant must have a genuinely different angle.
6. Always write "3-Wheeler" never "1-Wheeler".
7. Use specific numbers if available in the offer.

Return ONLY valid JSON, no markdown:
{
  "variants": [
    { "variant": 1, "format": "Video ad", "angle": "<2-3 words>", "hook": "<max 8 words>", "body": "<max 2 sentences>", "cta": "<3-5 words>" },
    { "variant": 2, "format": "Carousel ad", "angle": "<2-3 words>", "hook": "<max 8 words>", "body": "<max 2 sentences>", "cta": "<3-5 words>" },
    { "variant": 3, "format": "Static image", "angle": "<2-3 words>", "hook": "<max 8 words>", "body": "<max 2 sentences>", "cta": "<3-5 words>" }
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
