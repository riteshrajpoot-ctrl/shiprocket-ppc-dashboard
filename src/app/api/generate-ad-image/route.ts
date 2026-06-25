import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, campaignContext, referenceImageUrl, adSide } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const hook = variant?.hook || ''
  const cta = variant?.cta || ''
  const angle = variant?.angle || ''

  const isDemand = adSide !== 'SUPPLY'

  const sceneDescription = isDemand
    ? `Scene: A happy small business owner or shopkeeper handing a package to a Shiprocket Quick 3-wheeler driver. The vehicle is loaded and ready to go. Setting: Indian shop/market area.`
    : `Scene: A confident cartoon Indian auto-rickshaw driver in Shiprocket Quick yellow uniform, smiling, thumbs up. Yellow 3-wheeler beside him. Setting: Indian city street.`

  const prompt = `Square mobile ad creative for "Shiprocket Quick" Indian delivery app.

STYLE: Flat vector cartoon illustration. Bold, clean. NOT photorealistic. Like Swiggy or Zomato illustrated ads.

BACKGROUND: Gradient from light yellow (#FFF9C4) at top-left to bright yellow (#FFD000) at bottom-right. NOT flat dark yellow — must be a smooth gradient.

COMPOSITION:
- ${sceneDescription}
- Top-left: "Shiprocket" in small dark grey text, "Quick" in bold purple (#6B21A8) below it — like a stacked logo lockup inside a white rounded rectangle badge
- Leave breathing room around all elements — clean layout, not crowded

TEXT ON IMAGE:
- Main hook text: Bold rounded sans-serif font (like Poppins or Nunito Bold), dark charcoal (#1A1A2E) color NOT white, large size, center of image: "${hook}"
- Accent number or key word (if any in hook): highlight in purple (#6B21A8)
- Bottom CTA button: Rounded pill shape, purple (#6B21A8) fill, white bold text: "${cta}" — centered at bottom with padding

COLOR RULES:
- Background: yellow gradient (light to bright)
- Hook text: dark charcoal or deep navy, NOT white
- Accent/highlight: purple (#6B21A8)
- CTA button: purple with white text
- Character uniform: yellow branded t-shirt with purple Shiprocket logo

STRICT RULES:
- NO flat solid yellow background — must be gradient
- NO all-white text on yellow — use dark text for readability
- CTA button at very bottom center, rounded corners
- Clean professional layout, generous whitespace
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
