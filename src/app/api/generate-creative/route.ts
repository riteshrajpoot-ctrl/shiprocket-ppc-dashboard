import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { objective, audience, offer, tone } = await request.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })

  const prompt = `You are an expert performance marketing copywriter specializing in Indian D2C and gig economy apps.

Write 3 Meta ad script variants for Shiprocket Quick with these details:
- Objective: ${objective}
- Target audience: ${audience}
- Key offer/USP: ${offer}
- Tone: ${tone}

Each variant should be for a different format and use a different creative angle.

Respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "variants": [
    {
      "format": "Video ad",
      "angle": "Fear of missing out",
      "hook": "First 3 seconds of video script — must stop the scroll immediately",
      "body": "Full ad body copy — conversational, benefit-focused, 3-4 lines max",
      "cta": "Clear call to action text"
    },
    {
      "format": "Carousel ad",
      "angle": "Social proof",
      "hook": "First card headline",
      "body": "Cards 2-4 copy — each card one benefit",
      "cta": "Last card CTA"
    },
    {
      "format": "Static image ad",
      "angle": "Direct offer",
      "hook": "Bold headline for the image",
      "body": "Supporting copy below the image",
      "cta": "Button text"
    }
  ]
}

Write in Hinglish where natural (mix of Hindi and English) since the audience is Indian. Keep hooks punchy and under 10 words.`

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
        max_tokens: 1500,
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
