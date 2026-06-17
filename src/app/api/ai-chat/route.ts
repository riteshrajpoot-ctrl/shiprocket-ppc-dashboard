import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { message, context, history } = await request.json()

    const messages = [
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: `You are a PPC campaign analyst for Shiprocket's performance marketing team. You have access to live Meta Ads campaign data. Be concise, specific, and actionable. Give direct recommendations. Always reference actual numbers from the data provided. Keep responses under 100 words.

Current campaign data:
${context}`,
        messages
      })
    })

    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Could not generate response.'
    return NextResponse.json({ reply })

  } catch (error: any) {
    return NextResponse.json({ reply: 'Error: ' + error.message }, { status: 500 })
  }
}
