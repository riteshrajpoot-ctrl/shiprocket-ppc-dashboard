import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start')
    const dateEnd = searchParams.get('date_end')

    if (!dateStart || !dateEnd) {
      return NextResponse.json({ error: 'date_start and date_end required' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        mcp_servers: [
          {
            type: 'url',
            url: 'https://n8n.shiprocket.in/mcp/56f418b4-4d12-4080-afde-d4392df3e491',
            name: 'meta-ads'
          }
        ],
        system: `You are a data extraction assistant. When asked for Meta Ads campaign data, fetch it and return ONLY a valid JSON object with no markdown, no explanation, no backticks.

The JSON must have this exact structure:
{
  "campaigns": [
    {
      "campaign_name": string,
      "campaign_id": string,
      "spend": number,
      "installs": number,
      "clicks": number,
      "impressions": number,
      "cpi": number,
      "ctr": number,
      "objective": string
    }
  ],
  "daily": [
    {
      "date": string (YYYY-MM-DD),
      "spend": number,
      "installs": number,
      "clicks": number,
      "impressions": number,
      "ctr": number,
      "cpi": number
    }
  ],
  "totals": {
    "spend": number,
    "installs": number,
    "clicks": number,
    "impressions": number,
    "cpi": number,
    "ctr": number
  }
}

For installs, use the omni_activate_app action value. For daily data, aggregate all campaigns per day. All numbers must be actual numbers not strings.`,
        messages: [
          {
            role: 'user',
            content: `Fetch the Meta Ads campaign performance report for Shiprocket Quick account from ${dateStart} to ${dateEnd}. Return the data as JSON only.`
          }
        ]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', err)
      return NextResponse.json({ error: 'Claude API error' }, { status: 500 })
    }

    const data = await response.json()

    // Extract text from Claude's response
    const textBlock = data.content?.find((b: any) => b.type === 'text')
    if (!textBlock) {
      return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })
    }

    // Clean and parse JSON
    const raw = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(raw)

    return NextResponse.json(parsed)

  } catch (error: any) {
    console.error('Live metrics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
