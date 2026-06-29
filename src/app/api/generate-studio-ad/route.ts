import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const { character, background, logo, hook, body, cta, format } = await req.json()

  if (!character || !background) return NextResponse.json({ error: 'Character and background images are required' }, { status: 400 })

  const isSquare = format === '1:1'
  const size = isSquare ? '1024x1024' : '1024x1792'

  const prompt = `You are a professional ad designer. Create a polished mobile ad by compositing the provided images.

COMPOSITION INSTRUCTIONS:
- Place the character/rider image prominently on the background
- The background should fill the entire canvas
- Blend the character naturally into the scene with proper lighting and shadows
- ${logo ? 'Place the logo in the top-left or top-right corner, small and clean' : 'No logo'}

TEXT OVERLAY (place these on the image with clean, bold typography):
- HOOK (large, bold, top or center): "${hook}"
${body ? `- BODY (smaller, below hook): "${body}"` : ''}
${cta ? `- CTA BUTTON (bottom, bright contrasting color): "${cta}"` : ''}

STYLE:
- Format: ${isSquare ? 'Square 1:1 feed ad' : 'Vertical 9:16 Reels/Stories ad'}
- Brand colors: orange and white (Shiprocket Quick)
- Text should be in Hinglish style if the copy is in Hinglish
- Professional mobile ad quality, clean layout
- Strong visual hierarchy: background → character → text overlay → CTA

Make it look like a real high-quality Meta ad ready to publish.`

  try {
    // Step 1: Ask GPT-4o to write a precise image prompt based on uploaded images
    const messages: any[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${character}`, detail: 'high' }
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${background}`, detail: 'high' }
          },
          ...(logo ? [{
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${logo}`, detail: 'low' }
          }] : []),
          {
            type: 'text',
            text: 'Based on these uploaded elements, generate a detailed image generation prompt that will create this exact ad composition. Return ONLY the prompt, nothing else.'
          }
        ]
      }
    ]

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 800 }),
    })
    const gptData = await gptRes.json()
    if (gptData.error) return NextResponse.json({ error: gptData.error.message }, { status: 500 })

    const imagePrompt = gptData.choices?.[0]?.message?.content || prompt

    // Step 2: Generate the actual image with gpt-image-1
    // NOTE: gpt-image-1 does NOT support response_format or style params
    // It always returns b64_json by default
    const imageRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: imagePrompt,
        n: 1,
        size,
        quality: 'high',
        // NO response_format — gpt-image-1 returns b64_json by default
      }),
    })
    const imageData = await imageRes.json()
    if (imageData.error) return NextResponse.json({ error: imageData.error.message }, { status: 500 })

    const image = imageData.data?.[0]?.b64_json
    if (!image) return NextResponse.json({ error: 'No image returned from API' }, { status: 500 })

    return NextResponse.json({ image })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
