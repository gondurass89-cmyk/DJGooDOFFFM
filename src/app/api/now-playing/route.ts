import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// AzuraCast API
const AZURACAST_URL = 'http://178.49.69.37'
const STATION_SHORTCODE = 'dj_good_off_fm'
const API_URL = `${AZURACAST_URL}/api/nowplaying/${STATION_SHORTCODE}`

// Cache for 5 seconds to avoid hitting AzuraCast too frequently
let cachedData: any = null
let lastFetch = 0
const CACHE_TTL = 5000 // 5 seconds

// Clean artist name from AzuraCast garbage
function cleanArtistName(artist: string): string {
  if (!artist) return ''
  
  // AzuraCast sometimes puts multiple artists separated by " - "
  // Take only the first one if there are multiple
  const parts = artist.split(' - ')
  
  // If only one part, return it
  if (parts.length === 1) return artist.trim()
  
  // If multiple parts, usually the last one is the actual artist
  // But often the first one is correct too
  // Let's return the first part as it's usually the main artist
  return parts[0].trim()
}

// Clean title from AzuraCast garbage  
function cleanTitle(title: string): string {
  if (!title) return ''
  
  // Sometimes title contains "Artist - Title" pattern
  // Remove artist part if present
  if (title.includes(' - ')) {
    const parts = title.split(' - ')
    // If more than 2 parts, take the last one (actual title)
    if (parts.length > 2) {
      return parts[parts.length - 1].trim()
    }
    // If 2 parts, second one is title
    return parts[1].trim()
  }
  
  return title.trim()
}

// Parse track info from messy AzuraCast data
function parseTrackInfo(text: string, artist: string, title: string): { artist: string; title: string } {
  // If text contains "Artist - Title", parse it properly
  if (text && text.includes(' - ')) {
    const parts = text.split(' - ')
    if (parts.length >= 2) {
      // First part is artist(s), last part is title
      return {
        artist: parts[0].trim(),
        title: parts[parts.length - 1].trim()
      }
    }
  }
  
  // Otherwise use provided artist and title with cleaning
  return {
    artist: cleanArtistName(artist),
    title: cleanTitle(title)
  }
}

export async function GET() {
  const now = Date.now()
  
  // Return cached data if fresh
  if (cachedData && (now - lastFetch) < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  }
  
  try {
    const response = await fetch(API_URL, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    })
    
    if (!response.ok) {
      console.error('AzuraCast API error:', response.status)
      if (cachedData) {
        return NextResponse.json(cachedData, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          }
        })
      }
      return NextResponse.json({ title: 'Не удалось получить данные', error: true }, { status: 500 })
    }
    
    const data = await response.json()
    
    // Extract track info with proper parsing
    let title = 'Загрузка...'
    let artist = ''
    let trackTitle = ''
    
    if (data.now_playing?.song) {
      const song = data.now_playing.song
      const rawText = song.text || ''
      const rawArtist = song.artist || ''
      const rawTitle = song.title || ''
      
      // Parse the track info properly
      const parsed = parseTrackInfo(rawText, rawArtist, rawTitle)
      artist = parsed.artist
      trackTitle = parsed.title
      
      // Build display title
      if (artist && trackTitle) {
        title = `${artist} - ${trackTitle}`
      } else if (trackTitle) {
        title = trackTitle
        artist = ''
      } else if (artist) {
        title = artist
        trackTitle = ''
      } else {
        title = 'Неизвестный трек'
      }
      
      // Get art URL - we'll proxy it through our API
      const artUrl = song.art || null
    }
    
    const result = {
      title,
      artist,
      track_title: trackTitle,
      album: data.now_playing?.song?.album || '',
      art: data.now_playing?.song?.art || null,
      listeners: data.listeners?.current || 0,
      unique_listeners: data.listeners?.unique || 0,
      is_online: data.is_online || false,
      timestamp: now,
    }
    
    // Update cache
    cachedData = result
    lastFetch = now
    
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
    
  } catch (error) {
    console.error('Now playing fetch error:', error)
    
    if (cachedData) {
      return NextResponse.json(cachedData, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      })
    }
    
    return NextResponse.json({ 
      title: 'Ошибка подключения', 
      error: true 
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  }
}
