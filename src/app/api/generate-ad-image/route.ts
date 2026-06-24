import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, issues, campaignContext } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  // Build a tight, specific image prompt from the ad variant
  const imagePrompt = `Performance marketing ad creative for Indian logistics app "Shiprocket Quick".
Ad angle: ${variant.angle}
Hook text to show on image: "${variant.hook}"
CTA text: "${variant.cta}"
Context: ${campaignContext}

Visual style: Bold, high-contrast mobile ad. Real Indian street/delivery context. 
Show a delivery rider or 3-wheeler vehicle in action. 
Large readable Hindi/English text overlay showing the hook.
Bright yellow and purple brand colors (Shiprocket Quick brand).
Professional mobile feed ad format, 1:1 ratio.
No watermarks, no borders. Photorealistic style.`

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
