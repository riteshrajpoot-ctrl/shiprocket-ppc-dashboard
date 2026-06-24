import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { objective, audience, offer, tone, refCreative, refImage, adSide } = body
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })

    const contentBlocks: any[] = []

    if (refImage) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: refImage }
      })
    }

    const refSection = (refCreative || refImage)
      ? `\nREFERENCE CREATIVE:${refImage ? ' (see image above)' : ''}${refCreative ? `\n"${refCreative}"` : ''}\nMatch its language style, Hinglish ratio, and copy length.`
      : ''

    const sideRule = adSide === 'SUPPLY'
      ? `\nCRITICAL — SUPPLY-SIDE AD: Talking to 3-WHEELER DRIVERS wanting to earn money.\n- Write about: earning, flexible work, guaranteed orders, daily payout\n- NEVER mention: booking delivery, customer experience, sending goods\n- Good CTAs: "Partner Bano Aaj", "Kamaana Shuru Karo", "Abhi Join Karo"`
      : `\nCRITICAL — DEMAND-SIDE AD: Talking to CUSTOMERS or BUSINESSES who want to book 3-wheeler delivery.\n- Write about: fast delivery, affordable rates, easy booking, 3-wheeler for sending goods\n- NEVER mention: earning, joining as partner, driver recruitment\n- Good CTAs: "Abhi Book Karo", "Pehli Delivery Free", "Order Karo Abhi"`

    const prompt = `You are a top performance creative writer for Shiprocket Quick, India's on-demand 3-wheeler delivery app.

Brief:
- Objective: ${objective || 'Improve ad performance'}
- Target audience: ${audience || 'Relevant audience'}
- Key offer/USP: ${offer || 'Shiprocket Quick service'}
- Tone: ${tone || 'Urgent'}
${sideRule}
${refSection}

RULES:
1. Hook: MAX 8 words. Instant curiosity or urgency.
2. Body: MAX 2 short sentences. One problem, one solution.
3. CTA: 3-5 words. Action verb first.
4. Natural Hinglish. Not forced translation.
5. Each variant must have a genuinely different angle.
6. Always write "3-Wheeler" never "1-Wheeler".
7. Use specific numbers from the offer if available.

Return ONLY a valid JSON object. No markdown, no explanation, no backticks:
{"variants":[{"variant":1,"format":"Video ad","angle":"angle name","hook":"hook text","body":"body text","cta":"cta text"},{"variant":2,"format":"Carousel ad","angle":"angle name","hook":"hook text","body":"body text","cta":"cta text"},{"variant":3,"format":"Static image","angle":"angle name","hook":"hook text","body":"body text","cta":"cta text"}]}`

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

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `Anthropic API error: ${res.status}`, detail: errText }, { status: 500 })
    }

    const data = await res.json()

    // Safely extract text from any content block type
    const textBlock = data.content?.find((b: any) => b.type === 'text')
    if (!textBlock?.text) {
      return NextResponse.json({ error: 'No text in response', raw: data }, { status: 500 })
    }

    const clean = textBlock.text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
