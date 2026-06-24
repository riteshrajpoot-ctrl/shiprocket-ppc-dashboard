import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { variant, adName, issues, campaignContext, referenceImageUrl } = await req.json()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const imagePrompt = `Create a mobile ad creative in the EXACT same visual style as the reference image provided.

MATCH THE REFERENCE EXACTLY:
- Same illustration/cartoon character style (not photorealistic)
- Same color palette — Shiprocket Quick yellow (#FFD000) and purple (#6B21A8)
- Same layout structure and composition
- Same font weight and text style
- Same logo placement (top-left or top-right)

NEW AD CONTENT TO SHOW:
- Hook text on image: "${variant.hook}"
- CTA button text: "${variant.cta}"
- Keep the same 3-wheeler vehicle illustration style from reference
- Keep the same cartoon/illustrated human character style from reference

STRICT RULES:
- CTA must be a clean rounded purple button, bottom-center, white text
- "Shiprocket Quick" logo top-left in yellow pill
- Hook text in bold white, center of image, readable font size
- Square 1:1 format
- DO NOT add extra text or logos not in the brief
- DO NOT change the illustration style — match reference exactly`

  try {
    // Build request — use image editing if reference provided, generation if not
    let requestBody: any

    if (referenceImageUrl) {
      // Fetch reference image as base64
      const imgRes = await fetch(referenceImageUrl)
      const imgBuffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(imgBuffer).toString('base64')
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'

      // Use gpt-image-1 with image input for style reference
      requestBody = {
        model: 'gpt-image-1',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }

      // Call with image as reference using the edits endpoint
      const FormData = (await import('form-data')).default
      const form = new FormData()
      form.append('model', 'gpt-image-1')
      form.append('prompt', imagePrompt)
      form.append('n', '1')
      form.append('size', '1024x1024')
      form.append('quality', 'high')

      const imgBlob = Buffer.from(base64, 'base64')
      form.append('image', imgBlob, {
        filename: 'reference.jpg',
        contentType: mimeType,
      })

      const editRes = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        body: form,
      })

      const editData = await editRes.json()
      if (editData.error) {
        // Fallback to generation if edits fail
        console.log('Edit failed, falling back to generation:', editData.error.message)
      } else {
        const imageBase64 = editData.data?.[0]?.b64_json
        const imageUrl = editData.data?.[0]?.url
        return NextResponse.json({
          image: imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl,
        })
      }
    }

    // Standard generation (no reference or fallback)
    const genPrompt = `A mobile ad creative for Shiprocket Quick Indian delivery app.
Style: Flat illustration / cartoon style (NOT photorealistic). Bold vector art.
Show: Illustrated cartoon 3-wheeler auto-rickshaw driver in yellow Shiprocket Quick uniform, friendly and confident expression.
Background: Solid yellow (#FFD000) with simple graphic elements.
Text on image: Bold white hook text center: "${variant.hook}"
CTA: Rounded purple (#6B21A8) button bottom-center, white text: "${variant.cta}"  
Logo: "Shiprocket Quick" in top-left white pill badge.
Format: Square 1:1. Clean, bold, high contrast. Similar to Swiggy/Zomato illustrated ads.
NO photorealism. NO random extra text.`

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: genPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    })

    const data = await res.json()
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 })

    const imageBase64 = data.data?.[0]?.b64_json
    const imageUrl = data.data?.[0]?.url
    return NextResponse.json({
      image: imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


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
