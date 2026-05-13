import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const AZURACAST_API = 'https://djgoodoff.duckdns.org/api/nowplaying/djgoodofffm'

async function getListenerCountFromAzuraCast(): Promise<number> {
  try {
    const res = await fetch(`${AZURACAST_API}?_t=${Date.now()}`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data.listeners?.total || 0
  } catch {
    return 0
  }
}

export async function GET() {
  const total = await getListenerCountFromAzuraCast()
  return NextResponse.json(
    { total, listeners: [] },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(request: NextRequest) {
  const total = await getListenerCountFromAzuraCast()
  return NextResponse.json(
    { ok: true, total },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
