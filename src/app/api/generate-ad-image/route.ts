import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, issues, campaignContext } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  // Build a tight, specific image prompt from the ad variant
  const imagePrompt = `A professional mobile advertising creative for Shiprocket Quick, an Indian on-demand 3-wheeler delivery app.

AD CREATIVE SPECS:
- Format: Square 1:1 mobile feed ad
- Style: High-quality photorealistic advertisement, like a premium Indian brand campaign

VISUAL CONTENT:
- Hero image: A happy Indian auto-rickshaw (3-wheeler) driver in yellow Shiprocket Quick branded uniform, actively working/delivering in a busy Indian city street
- Background: Vibrant Indian urban street, slightly blurred for depth
- Lighting: Bright daylight, professional photography style

TEXT ELEMENTS (must be clean, readable, professional):
- Top area: Small "Shiprocket Quick" wordmark in white on purple pill badge, top-left corner
- Center-bottom overlay: Bold white text on dark semi-transparent band: "${variant.hook}"
- Bottom CTA button: Rounded purple button with white text: "${variant.cta}"
- Keep text minimal — only hook + CTA, nothing else

DESIGN RULES:
- Yellow (#FFD000) and purple (#6B21A8) brand colors only
- NO random text, NO fake Hindi characters, NO lorem ipsum
- Clean professional layout like a Swiggy or Zomato ad
- CTA button must look like a real tappable button, bottom center
- DO NOT write "1-Wheeler" — always "3-Wheeler" if vehicle mentioned
- Photorealistic, not illustrated or cartoonish`

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
    })

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    // gpt-image-1 returns base64
    const imageBase64 = data.data?.[0]?.b64_json
    const imageUrl = data.data?.[0]?.url

    return NextResponse.json({
      image: imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl,
      revised_prompt: data.data?.[0]?.revised_prompt || imagePrompt,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
