import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

function cleanTrackTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // 1. Remove file extension at the end (.mp3, .wav, etc.)
  cleaned = cleaned.replace(/\.(mp3|wav|flac|aac|ogg|m4a)$/i, '')
  
  // 2. Remove Camelot Wheel keys at START: "5A Artist" or "11B - Artist"
  cleaned = cleaned.replace(/^\d{1,2}[AB]\s*[-–—]?\s*/gi, '')
  
  // 3. Remove Camelot Wheel keys in middle/end: " - 5A" or " - 11B"
  cleaned = cleaned.replace(/\s*[-–—]\s*\d{1,2}[AB]\s*/gi, ' ')
  
  // 4. Remove trailing " - NUMBER" pattern (BPM like " - 115")
  cleaned = cleaned.replace(/\s*[-–—]\s*\d+\s*$/g, '')
  
  // 5. Remove Energy levels: "Energy 8" or " - Energy 5"
  cleaned = cleaned.replace(/\s*[-–—]?\s*Energy\s*\d{1,2}(\s*[-–—]\s*)?/gi, ' ')
  
  // 6. Remove websites in parentheses: (megapesni.com), (site.ru)
  cleaned = cleaned.replace(/\s*\([^)]*\.(com|ru|net|org|io|info|biz|me)[^)]*\)\s*/gi, ' ')
  
  // 7. Remove www.domain.com and http(s):// URLs
  cleaned = cleaned.replace(/www\.\S+\.\S+/gi, '')
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '')
  
  // 8. Remove common music site names
  const sites = ['livingelectro', 'beatport', 'junodownload', 'megapesni', 'zaycev', 
                 'mp3store', 'mp3poisk', 'muzofan', 'primemusic', 'hitmos', 'hotplayer']
  for (const site of sites) {
    cleaned = cleaned.replace(new RegExp(`\\b${site}\\b`, 'gi'), '')
  }
  
  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')           // Multiple spaces to single
    .replace(/\s*[-–—]\s*$/g, '')       // Trailing separator
    .replace(/^[\s\-–—:]+/, '')         // Leading separators
    .trim()
  
  return cleaned || title
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
