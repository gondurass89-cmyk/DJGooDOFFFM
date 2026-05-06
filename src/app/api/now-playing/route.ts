import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// Cloudflare Worker (fetches from AzuraCast API)
const WORKER_URL = 'https://nowplaying.gondurass89.workers.dev'

// Clean track title from technical info (backup cleaning if Worker missed something)
function cleanTrackTitle(title: string): string {
  if (!title) return ''

  let cleaned = title

  // Decode HTML entities (e.g., &amp; -> &)
  cleaned = cleaned
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")

  // Normalize various apostrophe-like characters to standard apostrophe
  cleaned = cleaned
    .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")  // ' ' ‚ ‛ ` ´ -> '

  // Remove BOM and zero-width characters
  cleaned = cleaned.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '')

  // Normalize all dash-like characters to regular dash
  cleaned = cleaned.replace(/[–—―‒–]/g, '-')

  // Remove Camelot keys and Energy levels (backup)
  cleaned = cleaned.replace(/^\d{1,2}[ABАВ]\s*-\s*/gi, '')
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/gi, '')

  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .replace(/^[\s\-:]+/, '')
    .trim()

  return cleaned || title
}

// Fetch from Cloudflare Worker (AzuraCast source)
async function fetchFromWorker() {
  try {
    const url = `${WORKER_URL}?_t=${Date.now()}`

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DJGooDOFF-FM/1.0',
        'Cache-Control': 'no-cache',
      },
    })

    console.log('Worker response status:', response.status)

    if (!response.ok) {
      console.log('Worker not available:', response.status)
      return null
    }

    // Worker now returns JSON
    const data = await response.json()
    console.log('Worker response:', data)

    // Extract track info from JSON
    const title = data.title || ''
    const artist = data.artist || ''
    const listeners = data.listeners || 0
    const online = data.online || false
    const art = data.art || null
    const duration = data.duration || 0
    const elapsed = data.elapsed || 0

    if (title && !title.includes('Загрузка')) {
      return {
        title: cleanTrackTitle(title),
        artist: cleanTrackTitle(artist),
        listeners,
        online,
        art,
        duration,
        elapsed
      }
    }

    return null
  } catch (error) {
    console.log('Worker fetch error:', error)
    return null
  }
}

export async function GET() {
  const trackData = await fetchFromWorker()

  if (trackData) {
    return NextResponse.json({
      title: trackData.title,
      artist: trackData.artist,
      listeners: trackData.listeners,
      online: trackData.online,
      art: trackData.art,
      duration: trackData.duration,
      elapsed: trackData.elapsed,
      timestamp: Date.now()
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    })
  }

  // Fallback if Worker fails
  return NextResponse.json({
    title: 'DJ GooD OFF FM',
    artist: '',
    listeners: 0,
    online: false,
    art: null,
    duration: 0,
    elapsed: 0,
    timestamp: Date.now()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  })
}
