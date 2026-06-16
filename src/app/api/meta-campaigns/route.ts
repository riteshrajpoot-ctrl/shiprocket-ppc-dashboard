import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const today = new Date()
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    
    const dateEnd = today.toISOString().split('T')[0]
    const dateStart = firstOfMonth.toISOString().split('T')[0]

    const response = await fetch(
      `${process.env.N8N_META_WEBHOOK_URL}?date_start=${dateStart}&date_end=${dateEnd}`,
      { next: { revalidate: 10800 } }
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
