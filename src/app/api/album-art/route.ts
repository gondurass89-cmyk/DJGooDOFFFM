import { NextRequest, NextResponse } from 'next/server'
import { parseTrackTitle, fetchTrackInfo, searchAlbumArt } from '@/lib/lastfm'

// Cache for album art requests
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 1 minute

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
    // Can't extract artist from title
    const result = { 
      title, 
      artist: null, 
      track: title, 
      albumArt: null,
      albumArtLarge: null 
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60' }
    })
  }
  
  // Fetch from Last.fm
  const trackInfo = await fetchTrackInfo(parsed.artist, parsed.track)
  
  if (trackInfo && trackInfo.albumArtLarge) {
    const result = {
      title,
      artist: trackInfo.artist,
      track: trackInfo.track,
      album: trackInfo.album,
      albumArt: trackInfo.albumArt,
      albumArtLarge: trackInfo.albumArtLarge,
    }
    
    cache.set(title, { data: result, timestamp: Date.now() })
    
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60' }
    })
  }
  
  // Fallback: search for album art
  const albumArt = await searchAlbumArt(parsed.artist, parsed.track)
  
  const result = {
    title,
    artist: parsed.artist,
    track: parsed.track,
    albumArt,
    albumArtLarge: albumArt,
  }
  
  cache.set(title, { data: result, timestamp: Date.now() })
  
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60' }
  })
}
