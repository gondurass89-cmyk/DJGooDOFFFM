import { NextRequest, NextResponse } from 'next/server'
import { parseTrackTitle, getTrackArtwork } from '@/lib/lastfm'

// Cache for album art requests
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 1 minute

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title')
  
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  
  // Check cache
  const cached = cache.get(title)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, max-age=60' }
    })
  }
  
  // Parse track title to extract artist and track name
  const parsed = parseTrackTitle(title)
  
  if (!parsed) {
    const result = { 
      title, 
      artist: null, 
      track: title, 
      albumArt: null,
      albumArtLarge: null,
      source: 'none'
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60' }
    })
  }
  
  // Fetch from Last.fm → iTunes fallback
  const trackInfo = await getTrackArtwork(parsed.artist, parsed.track)
  
  const result = {
    title,
    artist: trackInfo?.artist || parsed.artist,
    track: trackInfo?.track || parsed.track,
    album: trackInfo?.album || '',
    albumArt: trackInfo?.albumArt || null,
    albumArtLarge: trackInfo?.albumArtLarge || null,
    source: trackInfo?.source || 'none',
  }
  
  cache.set(title, { data: result, timestamp: Date.now() })
  
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60' }
  })
}
