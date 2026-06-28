import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.DASHBOARD_PASSWORD || 'shiprocket2026'

  if (password === correct) {
    const res = NextResponse.json({ success: true })
    res.cookies.set('ppc_auth', correct, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return res
  }

  return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
}
