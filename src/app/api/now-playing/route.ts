import { NextResponse } from 'next/server'

const ICECAST_STATUS_URL = 'http://178.49.69.37:8000/status-json.xsl'

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
    const response = await fetch(ICECAST_STATUS_URL, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
      cache: 'no-store', // Always fetch fresh data
    })
    
    if (!response.ok) {
      console.error('Icecast status fetch failed:', response.status)
      return ''
    }
    
    const data = await response.json()
    
    // Get the source (mount point)
    const source = data?.icestats?.source
    if (!source) {
      console.log('No source in Icecast response')
      return ''
    }
    
    // Try to get title from different places
    // 1. metadata.x_icy_title (most reliable for current track)
    // 2. title field
    // 3. First track in playlist
    let title = null
    
    if (source.metadata?.x_icy_title) {
      title = source.metadata.x_icy_title
    } else if (source.title) {
      title = source.title
    } else if (source.playlist?.trackList?.length > 0) {
      title = source.playlist.trackList[0].title
    }
    
    if (title) {
      const cleanTitle = cleanTrackTitle(title)
      console.log('Track fetched:', { raw: title, clean: cleanTitle })
      return cleanTitle
    }
    
    console.log('No title found in Icecast response')
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
