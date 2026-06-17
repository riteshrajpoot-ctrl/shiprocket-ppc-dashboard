import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('date_start')
    const dateEnd = searchParams.get('date_end')

    if (!dateStart || !dateEnd) {
      return NextResponse.json({ error: 'date_start and date_end required' }, { status: 400 })
    }

    const sql = neon(process.env.DATABASE_URL!)

    // First check what columns exist in metrics_daily
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'metrics_daily'
      ORDER BY ordinal_position
    `

    // Check row count for the date range
    const countResult = await sql`
      SELECT COUNT(*) as count FROM metrics_daily
      WHERE date >= ${dateStart}::date AND date <= ${dateEnd}::date
    `

    // Get a sample row to see actual data
    const sample = await sql`
      SELECT * FROM metrics_daily LIMIT 1
    `

    return NextResponse.json({ 
      columns, 
      rowCount: countResult[0]?.count,
      sample 
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    }, { status: 500 })
  }
}
