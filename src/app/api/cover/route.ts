import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Apple Music API
const APPLE_MUSIC_API = 'https://itunes.apple.com/search'

// Last.fm API (free API key from https://www.last.fm/api)
const LASTFM_API = 'https://ws.audioscrobbler.com/2.0'
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'your_lastfm_api_key_here'

// Cache for covers (5 minutes)
const coverCache = new Map<string, { cover: string | null, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Fetch cover from Apple Music
async function fetchAppleMusicCover(artist: string, title: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${artist} ${title}`)
    const response = await fetch(`${APPLE_MUSIC_API}?term=${query}&media=music&limit=1`, {
      signal: AbortSignal.timeout(5000),
    })
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (data.results?.[0]?.artworkUrl100) {
      // Get high-res artwork (600x600)
      return data.results[0].artworkUrl100.replace('100x100', '600x600')
    }
    return null
  } catch (error) {
    console.error('[COVER] Apple Music error:', error)
    return null
  }
}

// Fetch cover from Last.fm
async function fetchLastFmCover(artist: string, title: string): Promise<string | null> {
  if (!LASTFM_API_KEY || LASTFM_API_KEY === 'your_lastfm_api_key_here') {
    return null
  }
  
  try {
    const response = await fetch(
      `${LASTFM_API}?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    const images = data?.track?.album?.image
    if (images && images.length > 0) {
      // Get the largest image (extralarge)
      const largeImage = images.find((img: any) => img.size === 'extralarge')
      return largeImage?.['#text'] || images[images.length - 1]?.['#text'] || null
    }
    return null
  } catch (error) {
    console.error('[COVER] Last.fm error:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const artist = searchParams.get('artist') || ''
  const title = searchParams.get('title') || ''
  const azuracastArt = searchParams.get('azuracast_art') || ''
  
  if (!artist && !title) {
    return NextResponse.json({ cover: null })
  }
  
  const cacheKey = `${artist}-${title}`
  
  // Check cache
  const cached = coverCache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return NextResponse.json({ cover: cached.cover })
  }
  
  let cover: string | null = null
  
  // 1. First try AzuraCast built-in cover
  if (azuracastArt && azuracastArt.startsWith('http')) {
    cover = azuracastArt
  }
  
  // 2. Try Apple Music
  if (!cover && artist && title) {
    cover = await fetchAppleMusicCover(artist, title)
  }
  
  // 3. Try Last.fm
  if (!cover && artist && title) {
    cover = await fetchLastFmCover(artist, title)
  }
  
  // Update cache
  coverCache.set(cacheKey, { cover, timestamp: Date.now() })
  
  // Clean old cache entries
  if (coverCache.size > 100) {
    const now = Date.now()
    for (const [key, value] of coverCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        coverCache.delete(key)
      }
    }
  }
  
  return NextResponse.json({ cover })
}
