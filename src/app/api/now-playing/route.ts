import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// Cloudflare Worker (primary source - has Cyrillic support)
const WORKER_URL = 'https://nowplaying.gondurass89.workers.dev'

// Icecast fallback (secondary source - limited Cyrillic support)
const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

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
    .replace(/&nbsp;/gi, ' ')
  
  // Remove BOM and zero-width characters
  cleaned = cleaned.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '')
  
  // Remove Camelot key at START: "4A - " or "11B-"
  cleaned = cleaned.replace(/^\d{1,2}[AB]\s*[-–—]\s*/gi, '')
  
  // Remove Energy level at START: "Energy 6 - " or "Energy 8 "
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*[-–—]\s*/gi, '')
  
  // Remove Camelot key in middle/end: " - 5A" or "- 11B - "
  cleaned = cleaned.replace(/\s*[-–—]\s*\d{1,2}[AB]\s*/gi, ' ')
  
  // Remove Energy level in middle/end
  cleaned = cleaned.replace(/\s*[-–—]?\s*Energy\s*\d{1,2}\s*/gi, ' ')
  
  // Remove trailing BPM number: " - 115"
  cleaned = cleaned.replace(/\s*[-–—]\s*\d+\s*$/g, '')
  
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
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/^[\s\-–—:]+/, '')
    .trim()
  
  return cleaned || title
}

// Fetch from Cloudflare Worker (RadioBoss sends track there)
async function fetchFromWorker(): Promise<string | null> {
  try {
    const response = await fetch(WORKER_URL, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.log('Worker not available:', response.status)
      return null
    }

    // Worker returns plain text, not JSON
    const title = await response.text()

    if (title && title.trim()) {
      const cleaned = cleanTrackTitle(title.trim())
      console.log('Worker track:', { raw: title, clean: cleaned })
      return cleaned
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

async function fetchCurrentTrack(): Promise<string> {
  // Try Worker first (has full track info with Cyrillic)
  const workerTrack = await fetchFromWorker()
  if (workerTrack) {
    return workerTrack
  }
  
  // Fallback to Icecast
  console.log('Falling back to Icecast...')
  return await fetchFromIcecast()
}

export async function GET() {
  const title = await fetchCurrentTrack()
  
  return NextResponse.json({
    title,
    timestamp: Date.now()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  })
}
