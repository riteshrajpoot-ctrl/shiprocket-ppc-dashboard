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

  const refSection = refCreative || refImage
    ? `\nREFERENCE CREATIVE:${refImage ? ' (see image above)' : ''}${refCreative ? `\n"${refCreative}"` : ''}
Match its language style, Hinglish ratio, copy length, and messaging direction exactly.`
    : ''

  // Hard enforce ad side if explicitly passed
  const sideRule = adSide === 'DEMAND'
    ? `\n⚠️ DEMAND-SIDE ONLY — This ad speaks to CUSTOMERS/BUSINESSES booking delivery:
- Talk about: fast delivery, affordable rates, easy booking, 3-wheeler for your goods
- NEVER mention: earning, joining as partner, driver recruitment, income, kamai
- Example hooks: "3-Wheeler order in 60 seconds", "Bade orders? 3-Wheeler bhejo abhi"
- Example CTAs: "Abhi Book Karo", "Pehli Delivery Free", "Order Karo Abhi"`
    : adSide === 'SUPPLY'
    ? `\n⚠️ SUPPLY-SIDE ONLY — This ad speaks to DRIVERS/PARTNERS wanting to earn:
- Talk about: earning money, flexible work, guaranteed orders, daily payout
- NEVER mention: booking delivery, customer orders, sending goods
- Example hooks: "Roz ₹1000+ kamao apne 3-Wheeler se", "Khali baitha hai? Orders ready hain"
- Example CTAs: "Partner Bano Aaj", "Abhi Download Karo", "Kamaana Shuru Karo"`
    : ''

  const prompt = `You are a top performance creative writer for Shiprocket Quick — India's on-demand 3-wheeler delivery app.

Brief:
- Objective: ${objective}
- Target audience: ${audience}
- Key offer/USP: ${offer}
- Tone: ${tone}
${sideRule}
${refSection}

STRICT RULES:
1. Hook: MAX 8 words. Instant curiosity or urgency. No generic openers.
2. Body: MAX 2 short sentences. One problem, one solution.
3. CTA: 3-5 words. Action verb first.
4. Natural Hinglish — not forced translation.
5. Each variant: genuinely different angle and emotional trigger.
6. Always "3-Wheeler" never "1-Wheeler".
7. Use specific numbers from the offer if available.

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
