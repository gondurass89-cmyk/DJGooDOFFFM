import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// Cloudflare Worker (primary source - has Cyrillic support)
// Can be overridden via environment variable
const WORKER_URL = process.env.NEXT_PUBLIC_NOWPLAYING_URL || 'https://nowplaying.gondurass89.workers.dev'

// Icecast fallback (secondary source - limited Cyrillic support)
const ICECAST_STATUS_URL = 'http://178.49.69.37:8000/status.xsl'
const MOUNT_POINT = 'Radio'

// Clean track title from technical info
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
    .replace(/&#180;/g, "'")       // ACUTE ACCENT entity
    .replace(/&#x2019;/g, "'")     // RIGHT SINGLE QUOTATION MARK entity
    .replace(/&#x2018;/g, "'")     // LEFT SINGLE QUOTATION MARK entity
    .replace(/&#8217;/g, "'")      // RIGHT SINGLE QUOTATION MARK decimal entity
    .replace(/&#8216;/g, "'")      // LEFT SINGLE QUOTATION MARK decimal entity
    .replace(/&nbsp;/gi, ' ')

  // Normalize various apostrophe-like characters to standard apostrophe
  cleaned = cleaned
    .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")  // ' ' ‚ ‛ ` ´ -> '

  // Remove BOM and zero-width characters
  cleaned = cleaned.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '')

  // Normalize all dash-like characters to regular dash for easier matching
  cleaned = cleaned.replace(/[–—―‒–]/g, '-')

  // =====================================================
  // REMOVE CAMELOT KEY AND ENERGY LEVEL FROM BEGINNING
  // Pattern: "8A - Energy 8 - Real Track Name"
  // =====================================================
  // Remove pattern like "8A - " at start (support both Latin and Cyrillic A/B)
  cleaned = cleaned.replace(/^\d{1,2}[ABАВ]\s*-\s*/gi, '')

  // Remove pattern like "Energy 8 - " at start
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/gi, '')

  // Repeat in case there are multiple (e.g., "8A - Energy 8 - Track")
  cleaned = cleaned.replace(/^\d{1,2}[ABАВ]\s*-\s*/gi, '')
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/gi, '')

  // =====================================================
  // REMOVE CAMELOT KEY AND ENERGY LEVEL FROM MIDDLE/END
  // =====================================================
  // Remove " - 5A" or " - 11B" in middle/end
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABАВ]\s*/gi, ' ')

  // Remove " - Energy 8" in middle/end
  cleaned = cleaned.replace(/\s*-?\s*Energy\s*\d{1,2}\s*/gi, ' ')

  // Remove trailing BPM number: " - 115"
  cleaned = cleaned.replace(/\s*-\s*\d{2,3}\s*$/g, '')

  // Remove "File" suffix (from RadioBoss recovery)
  cleaned = cleaned.replace(/\s+File$/gi, '')

  // Remove websites in parentheses
  cleaned = cleaned.replace(/\s*\([^)]*\.(com|ru|net|org|io)[^)]*\)\s*/gi, ' ')

  // Remove URLs
  cleaned = cleaned.replace(/www\.\S+\.\S+/gi, '')
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '')

  // Remove [by ...] tags (e.g., "[by DragoN_Sky]")
  cleaned = cleaned.replace(/\s*\[by[^\]]*\]/gi, '')

  // Remove curly braces but keep text inside
  cleaned = cleaned.replace(/\{\s*/g, '')
  cleaned = cleaned.replace(/\s*\}/g, '')

  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')      // Remove trailing dash
    .replace(/^[\s\-:]+/, '')      // Remove leading whitespace/dashes/colons
    .trim()

  return cleaned || title
}

// Fetch from Cloudflare Worker (RadioBoss sends track there)
async function fetchFromWorker(): Promise<{ title: string; listeners: number } | null> {
  try {
    // Add timestamp to prevent any caching
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

    if (process.env.NODE_ENV === 'development') {
      console.log('Worker response status:', response.status)
    }

    if (!response.ok) {
      console.log('Worker not available:', response.status)
      return null
    }

    // Worker returns JSON: { title, listeners, online, source }
    const data = await response.json()

    if (data.title && data.title.trim() && !data.title.includes('Загрузка') && !data.title.includes('Офлайн')) {
      const cleaned = cleanTrackTitle(data.title.trim())
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Worker track:', { raw: data.title, clean: cleaned })
      }
      
      return {
        title: cleaned,
        listeners: data.listeners || 0,
      }
    }

    return null
  } catch (error) {
    console.log('Worker fetch error:', error)
    return null
  }
}

// Fetch from Icecast (fallback)
async function fetchFromIcecast(): Promise<string> {
  try {
    const response = await fetch(ICECAST_STATUS_URL, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    
    if (!response.ok) {
      console.error('Icecast status fetch failed:', response.status)
      return ''
    }
    
    const html = await response.text()
    
    const mountStart = html.indexOf(`<h3>Канал /${MOUNT_POINT}</h3>`)
    if (mountStart === -1) {
      console.log('Mount point not found')
      return ''
    }
    
    const searchArea = html.substring(mountStart, mountStart + 5000)
    const playMatch = searchArea.match(/Сейчас играет:<\/td>\s*<td class="streamdata">([^<]*)<\/td>/i)
    
    if (playMatch && playMatch[1]) {
      const title = playMatch[1].trim()
      const cleaned = cleanTrackTitle(title)
      console.log('Icecast track:', { raw: title, clean: cleaned })
      return cleaned
    }
    
    return ''
  } catch (error) {
    console.error('Icecast fetch error:', error)
    return ''
  }
}

async function fetchCurrentTrack(): Promise<{ title: string; listeners: number }> {
  // Try Worker first (has full track info with Cyrillic)
  const workerData = await fetchFromWorker()
  if (workerData) {
    return workerData
  }
  
  // Fallback to Icecast
  console.log('Falling back to Icecast...')
  const title = await fetchFromIcecast()
  return { title, listeners: 0 }
}

export async function GET() {
  const data = await fetchCurrentTrack()
  
  return NextResponse.json({
    title: data.title || 'Загрузка...',
    listeners: data.listeners,
    timestamp: Date.now()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  })
}
