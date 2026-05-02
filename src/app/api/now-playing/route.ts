import { NextResponse } from 'next/server'

// Local Icecast server - streaming from local PC via RadioBoss
const ICECAST_HOST = 'http://178.49.69.37:8000'
const MOUNT_POINT = 'Radio'

// Patterns to remove from track title
const PATTERNS_TO_REMOVE = [
  // Camelot Wheel keys: 1A-12A, 1B-12B with separators
  /\d{1,2}[AB]\s*[-–—]\s*/gi,
  // Energy levels: Energy 1-10 with separators
  /Energy\s*\d{1,2}\s*[-–—]\s*/gi,
  /Energy\s*\d{1,2}/gi,
  // BPM info
  /\d+\s*BPM\s*[-–—]\s*/gi,
  /\d+\s*BPM/gi,
  // Key info variations
  /Key[:\s]*[A-G][#b]?\s*(min|maj|minor|major)?\s*[-–—]\s*/gi,
  // Website URLs - www.domain.com, domain.com, etc.
  /www\.[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/gi,
  /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/gi,
  // Common music download sites
  /livingelectro\.com/gi,
  /beatport\.com/gi,
  /junodownload\.com/gi,
  /bandcamp\.com/gi,
  /soundcloud\.com/gi,
  /spotify\.com/gi,
  /apple\.music/gi,
  /music\.apple\.com/gi,
  /youtube\.com/gi,
  /youtu\.be/gi,
  /audiio\.com/gi,
  /artlist\.io/gi,
  /epidemicsound\.com/gi,
  // Site names without TLD (common patterns)
  /\blivingelectro\b/gi,
  /\bbeatport\b/gi,
  /\bjunodownload\b/gi,
]

function cleanTrackTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // Apply all patterns
  for (const pattern of PATTERNS_TO_REMOVE) {
    cleaned = cleaned.replace(pattern, ' ')
  }
  
  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')  // Multiple spaces to single
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')  // Trim separators
    .trim()
  
  return cleaned || title  // Return original if cleaning resulted in empty string
}

async function fetchCurrentTrack(): Promise<string> {
  try {
    // Try Icecast JSON status first (Icecast 2.4+)
    const jsonUrl = `${ICECAST_HOST}/status-json.xsl`
    const response = await fetch(jsonUrl, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    
    if (response.ok) {
      const data = await response.json()
      
      // Icecast JSON structure: { icestats: { source: [...] } }
      const sources = data?.icestats?.source
      if (sources) {
        // Find our mount point
        const sourceArray = Array.isArray(sources) ? sources : [sources]
        const mountSource = sourceArray.find((s: any) => 
          s.listenurl?.includes(`/${MOUNT_POINT}`) || 
          s.server_name === MOUNT_POINT
        )
        
        if (mountSource?.title) {
          const rawTitle = mountSource.title.trim()
          const cleanTitle = cleanTrackTitle(rawTitle)
          console.log('Track fetched from JSON:', { raw: rawTitle, clean: cleanTitle })
          return cleanTitle
        }
      }
    }
    
    // Fallback to HTML parsing for older Icecast versions
    const htmlResponse = await fetch(`${ICECAST_HOST}/status.xsl`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    
    if (!htmlResponse.ok) {
      console.error('Icecast status fetch failed:', htmlResponse.status)
      return ''
    }
    
    const html = await htmlResponse.text()
    
    // Try different HTML patterns for Icecast 2.5
    // Pattern 1: Standard Icecast mount point header
    let mountStart = html.indexOf(`<h3>Канал /${MOUNT_POINT}</h3>`)
    if (mountStart === -1) {
      // Pattern 2: English version
      mountStart = html.indexOf(`<h3>Mount Point /${MOUNT_POINT}</h3>`)
    }
    if (mountStart === -1) {
      // Pattern 3: Stream name in heading
      mountStart = html.indexOf(`<h3>/${MOUNT_POINT}</h3>`)
    }
    if (mountStart === -1) {
      // Pattern 4: Listen URL containing mount point
      mountStart = html.indexOf(`/${MOUNT_POINT}`)
    }
    
    if (mountStart !== -1) {
      const searchArea = html.substring(mountStart, mountStart + 5000)
      
      // Try multiple patterns for "Now Playing"
      const patterns = [
        /Сейчас играет:<\/td>\s*<td[^>]*>([^<]*)<\/td>/i,
        /Currently Playing:<\/td>\s*<td[^>]*>([^<]*)<\/td>/i,
        /Current Song:<\/td>\s*<td[^>]*>([^<]*)<\/td>/i,
        /title:<\/td>\s*<td[^>]*>([^<]*)<\/td>/i,
        /<td[^>]*>Title<\/td>\s*<td[^>]*>([^<]*)<\/td>/i,
      ]
      
      for (const pattern of patterns) {
        const match = searchArea.match(pattern)
        if (match && match[1]) {
          const rawTitle = match[1].trim()
          const cleanTitle = cleanTrackTitle(rawTitle)
          console.log('Track fetched from HTML:', { raw: rawTitle, clean: cleanTitle })
          return cleanTitle
        }
      }
    }
    
    console.log('Mount point or play info not found')
    return ''
  } catch (error) {
    console.error('Error fetching track:', error)
    return ''
  }
}

export async function GET() {
  // Fetch fresh data every time (no cache on serverless)
  const title = await fetchCurrentTrack()
  
  return NextResponse.json({
    title,
    timestamp: Date.now()
  }, {
    headers: {
      // Prevent caching by Vercel CDN
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  })
}
