import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, campaignContext, referenceImageUrl } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const hook = variant?.hook || ''
  const cta = variant?.cta || ''
  const angle = variant?.angle || ''

  const prompt = `Square mobile ad creative for "Shiprocket Quick" — Indian on-demand 3-wheeler delivery app.

STYLE: Flat vector cartoon illustration. Bold, colorful. NOT photorealistic. Similar to Swiggy/Zomato illustrated ads.

COMPOSITION:
- Bright yellow (#FFD000) background with simple geometric shapes
- Center: Friendly cartoon Indian auto-rickshaw driver in yellow Shiprocket Quick branded t-shirt, smiling, thumbs up pose
- Right side: Yellow cartoon 3-wheeler auto-rickshaw vehicle
- Top-left corner: Small white rounded rectangle with purple "Shiprocket Quick" text

TEXT ON IMAGE (exact text, clean typography):
- Large bold white text center-top: "${hook}"
- Bottom-center: Rounded purple (#6B21A8) pill button, white text: "${cta}"

RULES:
- Only yellow and purple colors
- No extra text anywhere else
- CTA button must look like a real rounded button
- Clean professional ad layout
- Angle/mood: ${angle}`

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    }),
  })

  const data = await res.json()

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 400 })
  }

  const b64 = data.data?.[0]?.b64_json
  const url = data.data?.[0]?.url
  const image = b64 ? `data:image/png;base64,${b64}` : url

  return NextResponse.json({ image })
}
