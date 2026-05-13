import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const LISTENERS_API = 'https://djgoodoff.duckdns.org/api/listeners'

export async function GET() {
  try {
    const res = await fetch(`${LISTENERS_API}?_t=${Date.now()}`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
    }
  } catch {}
  return NextResponse.json({ total: 0, listeners: [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(LISTENERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
    }
  } catch {}
  return NextResponse.json({ ok: true, total: 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
