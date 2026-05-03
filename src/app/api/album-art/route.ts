import { NextRequest, NextResponse } from 'next/server'
import { parseTrackTitle, getTrackArtwork, TrackArtwork } from '@/lib/lastfm'

// =====================================================
// LRU CACHE WITH TTL (исправление memory leak)
// =====================================================
interface AlbumArtResult {
  title: string
  artist: string | null
  track: string
  album?: string
  albumArt: string | null
  albumArtLarge: string | null
  source: 'lastfm' | 'itunes' | 'none'
}

interface CacheEntry {
  data: AlbumArtResult
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 1000 // 1 минута
const MAX_CACHE_SIZE = 100 // максимум 100 записей в кэше

// Периодическая очистка просроченных записей
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key)
    }
  }
}, 60 * 1000) // каждую минуту

function getFromCache(key: string): CacheEntry | null {
  const entry = cache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }

  return entry
}

function setToCache(key: string, data: AlbumArtResult): void {
  // LRU: удаляем старые записи если кэш полон
  if (cache.size >= MAX_CACHE_SIZE) {
    // Удаляем самую старую запись
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [k, v] of cache.entries()) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp
        oldestKey = k
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }

  cache.set(key, { data, timestamp: Date.now() })
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title')

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  // Check cache
  const cached = getFromCache(title)
  if (cached) {
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

  setToCache(title, result)

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60' }
  })
}
