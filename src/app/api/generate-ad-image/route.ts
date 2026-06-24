import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, issues, campaignContext, referenceImageUrl } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const hookText = variant?.hook || ''
  const ctaText = variant?.cta || ''

  // Illustrated style prompt (matches Shiprocket Quick cartoon brand style)
  const illustratedPrompt = `A square mobile ad creative for Shiprocket Quick, Indian on-demand 3-wheeler delivery app.
Style: Flat vector illustration / cartoon style. Bold, colorful, NOT photorealistic.
Background: Bright yellow (#FFD000) with simple graphic shapes.
Main character: Friendly cartoon Indian auto-rickshaw (3-wheeler) driver in yellow branded uniform, smiling, confident pose.
Vehicle: Yellow cartoon 3-wheeler auto-rickshaw beside the driver.
Text layout:
  - Top-left: Small rounded white pill with "Shiprocket Quick" purple text
  - Center: Bold white text reading exactly: ${hookText}
  - Bottom-center: Rounded purple (#6B21A8) button with white text: ${ctaText}
Design rules:
  - Only yellow and purple brand colors
  - Clean readable typography, large font for hook
  - CTA button looks tappable, rounded corners
  - No extra random text anywhere
  - Cartoon illustration like Swiggy or Zomato brand ads
  - Square 1:1 format`

  // Style reference prompt (when we have a reference image)  
  const referencePrompt = `Create a new mobile ad creative in the EXACT same visual style as the reference image.
Match: illustration style, color palette, layout structure, character style, logo placement.
Only change the text content:
  - Hook text: ${hookText}
  - CTA button text: ${ctaText}
Keep everything else identical to the reference — same cartoon style, same brand colors, same composition.`

  try {
    // Try image edit with reference first
    if (referenceImageUrl) {
      try {
        const imgRes = await fetch(referenceImageUrl)
        const imgBuffer = await imgRes.arrayBuffer()
        const imgBase64 = Buffer.from(imgBuffer).toString('base64')
        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'

        const { default: FormData } = await import('form-data')
        const form = new FormData()
        form.append('model', 'gpt-image-1')
        form.append('prompt', referencePrompt)
        form.append('n', '1')
        form.append('size', '1024x1024')
        form.append('quality', 'high')
        form.append('image', Buffer.from(imgBase64, 'base64'), {
          filename: 'reference.jpg',
          contentType: mimeType,
        })

        const editRes = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...form.getHeaders(),
          },
          body: form,
        })

        const editData = await editRes.json()

        if (!editData.error) {
          const b64 = editData.data?.[0]?.b64_json
          const url = editData.data?.[0]?.url
          const image = b64 ? `data:image/png;base64,${b64}` : url
          if (image) {
            return NextResponse.json({ image })
          }
        }
      } catch (_e) {
        // fall through to standard generation
      }
    }

    // Standard generation fallback
    const genRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: illustratedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    })

    const genData = await genRes.json()

    if (genData.error) {
      return NextResponse.json({ error: genData.error.message }, { status: 400 })
    }

    const b64 = genData.data?.[0]?.b64_json
    const url = genData.data?.[0]?.url
    const image = b64 ? `data:image/png;base64,${b64}` : url

    return NextResponse.json({ image })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
