import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// Cloudflare Worker (primary source - has Cyrillic support)
const WORKER_URL = 'https://nowplaying.gondurass89.workers.dev'

// Icecast fallback (secondary source - limited Cyrillic support)
const ICECAST_STATUS_URL = 'http://s0.radioheart.ru:8000/status.xsl'
const MOUNT_POINT = 'RH84200'

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
    
    const data = await response.json()
    
    if (data && data.title) {
      console.log('Worker track:', data.title)
      return data.title
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
      console.log('Icecast track:', title)
      return title
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
