import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// RadioBoss API via LocalTunnel (primary source)
const RADIOBOSS_API_URL = 'https://wide-cobras-brush.loca.lt/'
const RADIOBOSS_PASSWORD = 'bG0SNPLXIl'

// Icecast fallback (secondary source)
const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

function cleanTrackTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // 1. Remove file extension at the end
  cleaned = cleaned.replace(/\.(mp3|wav|flac|aac|ogg|m4a)$/i, '')
  
  // 2. Remove Camelot key at START: "5A - " or "5A " or "11B-"
  cleaned = cleaned.replace(/^\d{1,2}[AB]\s*[-–—]\s*/gi, '')
  cleaned = cleaned.replace(/^\d{1,2}[AB]\s+/gi, '')
  
  // 3. Remove Energy level at START: "Energy 6 - " or "Energy 8 "
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*[-–—]\s*/gi, '')
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s+/gi, '')
  
  // 4. Remove Camelot key in middle/end: " - 5A" or "- 11B - "
  cleaned = cleaned.replace(/\s*[-–—]\s*\d{1,2}[AB]\s*/gi, ' ')
  
  // 5. Remove Energy level in middle/end: " - Energy 6 - " or "- Energy 8"
  cleaned = cleaned.replace(/\s*[-–—]?\s*Energy\s*\d{1,2}\s*[-–—]?\s*/gi, ' ')
  
  // 6. Remove trailing BPM number: " - 115"
  cleaned = cleaned.replace(/\s*[-–—]\s*\d+\s*$/g, '')
  
  // 7. Remove websites in parentheses: (megapesni.com)
  cleaned = cleaned.replace(/\s*\([^)]*\.(com|ru|net|org|io|info|biz|me)[^)]*\)\s*/gi, ' ')
  
  // 8. Remove URLs
  cleaned = cleaned.replace(/www\.\S+\.\S+/gi, '')
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '')
  
  // 9. Remove site names
  const sites = ['livingelectro', 'beatport', 'junodownload', 'megapesni', 'zaycev', 
                 'mp3store', 'mp3poisk', 'muzofan', 'primemusic', 'hitmos', 'hotplayer']
  for (const site of sites) {
    cleaned = cleaned.replace(new RegExp(`\\b${site}\\b`, 'gi'), '')
  }
  
  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/^[\s\-–—:]+/, '')
    .trim()
  
  return cleaned || title
}

// Parse XML from RadioBoss playbackinfo
function parseRadioBossXML(xml: string): string {
  try {
    // Extract CurrentTrack TRACK element
    const trackMatch = xml.match(/<CurrentTrack>[\s\S]*?<TRACK\s+([^>]*)\/>/i)
    if (!trackMatch) {
      console.log('No CurrentTrack found in XML')
      return ''
    }
    
    const trackAttrs = trackMatch[1]
    
    // Extract TITLE attribute (ARTIST often contains Camelot/Energy info, so use TITLE only)
    const titleMatch = trackAttrs.match(/TITLE="([^"]*)"/i)
    
    // Also try CASTTITLE which may have full info
    const castTitleMatch = trackAttrs.match(/CASTTITLE="([^"]*)"/i)
    
    // Prefer TITLE as it's usually cleaner (Artist - Track format without tech info)
    if (titleMatch) {
      const title = titleMatch[1].replace(/&#39;/g, "'").trim()
      if (title) return title
    }
    
    // Fallback to CASTTITLE
    if (castTitleMatch) {
      const castTitle = castTitleMatch[1].replace(/&#39;/g, "'").trim()
      if (castTitle) return castTitle
    }
    
    return ''
  } catch (error) {
    console.error('Error parsing RadioBoss XML:', error)
    return ''
  }
}

// Fetch from RadioBoss API (via Cloudflare tunnel)
async function fetchFromRadioBoss(): Promise<string | null> {
  try {
    const url = `${RADIOBOSS_API_URL}?pass=${RADIOBOSS_PASSWORD}&action=playbackinfo`
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    
    if (!response.ok) {
      console.log('RadioBoss API not available:', response.status)
      return null
    }
    
    const xml = await response.text()
    console.log('RadioBoss XML received, length:', xml.length)
    
    const trackInfo = parseRadioBossXML(xml)
    if (trackInfo) {
      const cleaned = cleanTrackTitle(trackInfo)
      console.log('RadioBoss track:', { raw: trackInfo, clean: cleaned })
      return cleaned
    }
    
    return null
  } catch (error) {
    console.log('RadioBoss API error (tunnel may be down):', error)
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
      const rawTitle = playMatch[1].trim()
      const cleanTitle = cleanTrackTitle(rawTitle)
      console.log('Icecast track:', { raw: rawTitle, clean: cleanTitle })
      return cleanTitle
    }
    
    return ''
  } catch (error) {
    console.error('Icecast fetch error:', error)
    return ''
  }
}

async function fetchCurrentTrack(): Promise<string> {
  // Try RadioBoss API first (has full track info with Cyrillic support)
  const radioBossTrack = await fetchFromRadioBoss()
  if (radioBossTrack) {
    return radioBossTrack
  }
  
  // Fallback to Icecast if RadioBoss tunnel is down
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
