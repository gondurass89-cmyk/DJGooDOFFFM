import { NextResponse } from 'next/server'

const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

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
    
    const html = await response.text()
    
    // Find the mount point section - look for the mount point header first
    const mountStart = html.indexOf(`<h3>Канал /${MOUNT_POINT}</h3>`)
    if (mountStart === -1) {
      console.log('Mount point not found')
      return ''
    }
    
    // Find "Сейчас играет:" after the mount point header
    const searchArea = html.substring(mountStart, mountStart + 5000)
    const playMatch = searchArea.match(/Сейчас играет:<\/td>\s*<td class="streamdata">([^<]*)<\/td>/i)
    
    if (playMatch && playMatch[1]) {
      const rawTitle = playMatch[1].trim()
      const cleanTitle = cleanTrackTitle(rawTitle)
      console.log('Track fetched:', { raw: rawTitle, clean: cleanTitle })
      return cleanTitle
    }
    
    console.log('Play info not found in section')
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
