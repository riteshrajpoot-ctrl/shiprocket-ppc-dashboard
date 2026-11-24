import { NextResponse } from 'next/server';
import { BUSINESS_COOKIE } from '../../../../lib/stark/businesses';

// The Shiprocket LM | Shiprocket Quick switch: remembers the choice for a year, then goes back to the page.
export function GET(req: Request) {
  const url = new URL(req.url);
  const b = url.searchParams.get('b') === 'lm' ? 'lm' : 'quick';
  const next = url.searchParams.get('next') || '/creative-fatigue';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/creative-fatigue';
  const res = NextResponse.redirect(new URL(safeNext, url.origin));
  res.cookies.set(BUSINESS_COOKIE, b, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
