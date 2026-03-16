import { NextResponse } from 'next/server'

const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

function cleanTrackTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // 1. Remove file extensions (.mp3, .wav, .flac, etc.) with optional BPM number before
  cleaned = cleaned.replace(/\s*[-–—]?\s*\d+\.mp3$/gi, '')
  cleaned = cleaned.replace(/\.(mp3|wav|flac|aac|ogg|m4a)$/gi, '')
  
  // 2. Remove Camelot Wheel keys (1A-12A, 1B-12B) with separator after
  cleaned = cleaned.replace(/\s*[-–—]\s*\d{1,2}[AB](\s*[-–—]\s*)?/gi, ' ')
  
  // 3. Remove Energy levels (Energy 1-10) with separator
  cleaned = cleaned.replace(/\s*[-–—]?\s*Energy\s*\d{1,2}(\s*[-–—]\s*)?/gi, ' ')
  
  // 4. Remove BPM info (with or without "BPM" label)
  cleaned = cleaned.replace(/\s*[-–—]\s*\d+\s*BPM/gi, '')
  cleaned = cleaned.replace(/\s*[-–—]\s*\d+\s*$/gi, '')  // Just number at end
  
  // 5. Remove websites in parentheses: (megapesni.com), (site.ru), etc.
  cleaned = cleaned.replace(/\s*\([^)]*\.(com|ru|net|org|io|info|biz|me)[^)]*\)\s*/gi, ' ')
  
  // 6. Remove www.domain.com patterns
  cleaned = cleaned.replace(/www\.[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/gi, '')
  
  // 7. Remove https:// and http:// URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '')
  
  // 8. Remove common music site names (standalone or in text)
  const sitePatterns = [
    'livingelectro', 'beatport', 'junodownload', 'megapesni',
    'zaycev', 'mp3store', 'mp3poisk', 'muzofan', 'primemusic',
    'hitmos', 'hotplayer', 'pumpitupparty'
  ]
  for (const site of sitePatterns) {
    cleaned = cleaned.replace(new RegExp(`\\b${site}\\b`, 'gi'), '')
  }
  
  // 9. Remove Key info
  cleaned = cleaned.replace(/Key[:\s]*[A-G][#b]?\s*(min|maj|minor|major)?/gi, '')
  
  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')  // Multiple spaces to single
    .replace(/\s*[-–—]\s*$/g, '')  // Trailing separator
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')  // Trim separators from ends
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
