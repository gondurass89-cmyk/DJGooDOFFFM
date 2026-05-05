import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// AzuraCast API
const AZURACAST_URL = 'http://178.49.69.37'
const STATION_SHORTCODE = 'dj_good_off_fm'
const API_URL = `${AZURACAST_URL}/api/nowplaying/${STATION_SHORTCODE}`

// Cache for 5 seconds
let cachedData: any = null
let lastFetch = 0
const CACHE_TTL = 5000

// Check if string is DJ metadata (key, energy, bpm, etc.)
function isDjMetadata(str: string): boolean {
  const cleanStr = str.trim().toLowerCase()
  
  // Key patterns: 1A-12A, 1B-12B, etc.
  if (/^[1-9][0-2]?[ab]$/i.test(cleanStr)) return true
  
  // Energy patterns: Energy 1-10
  if (/^energy\s*[0-9]+$/i.test(cleanStr)) return true
  
  // BPM patterns
  if (/^\d+\s*bpm$/i.test(cleanStr)) return true
  
  // Key notations like Cm, Am, F#m
  if (/^[a-g][#b]?m?$/i.test(cleanStr) && cleanStr.length <= 3) return true
  
  return false
}

// Parse track info from AzuraCast's messy data
function parseTrackInfo(text: string, artist: string, title: string): { artist: string; title: string; cleanTitle: string } {
  // AzuraCast sometimes puts DJ metadata (key, energy) in artist field
  // Example: artist="7A - Energy 6", title="Terrie Kynd - BHO"
  // Real data: artist="Terrie Kynd", title="BHO"
  
  // First, try to parse from title field (often contains "Artist - Title")
  if (title && title.includes(' - ')) {
    const parts = title.split(' - ')
    if (parts.length >= 2) {
      // First part is artist, last part is title
      return {
        artist: parts[0].trim(),
        title: parts[parts.length - 1].trim(),
        cleanTitle: title.trim()
      }
    }
  }
  
  // If title is just the song name, check artist
  if (artist && artist.includes(' - ')) {
    const parts = artist.split(' - ')
    
    // Filter out DJ metadata parts
    const realParts = parts.filter(p => !isDjMetadata(p.trim()))
    
    if (realParts.length >= 2) {
      return {
        artist: realParts[0].trim(),
        title: realParts[realParts.length - 1].trim(),
        cleanTitle: `${realParts[0].trim()} - ${realParts[realParts.length - 1].trim()}`
      }
    }
    
    // If only one real part, it's probably the artist
    if (realParts.length === 1 && title) {
      return {
        artist: realParts[0].trim(),
        title: title.trim(),
        cleanTitle: `${realParts[0].trim()} - ${title.trim()}`
      }
    }
  }
  
  // Check if artist is just DJ metadata
  if (artist && isDjMetadata(artist)) {
    // Use title as the source
    if (title && title.includes(' - ')) {
      const parts = title.split(' - ')
      return {
        artist: parts[0].trim(),
        title: parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim(),
        cleanTitle: title.trim()
      }
    }
    return {
      artist: '',
      title: title || '',
      cleanTitle: title || ''
    }
  }
  
  // Fallback: use provided values
  return {
    artist: artist || '',
    title: title || '',
    cleanTitle: text || `${artist} - ${title}`
  }
}

export async function GET() {
  const now = Date.now()
  
  if (cachedData && (now - lastFetch) < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  }
  
  try {
    const response = await fetch(API_URL, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    })
    
    if (!response.ok) {
      console.error('AzuraCast API error:', response.status)
      if (cachedData) {
        return NextResponse.json(cachedData, {
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
        })
      }
      return NextResponse.json({ title: 'Не удалось получить данные', error: true }, { status: 500 })
    }
    
    const data = await response.json()
    
    let title = 'Загрузка...'
    let artist = ''
    let trackTitle = ''
    
    if (data.now_playing?.song) {
      const song = data.now_playing.song
      const rawText = song.text || ''
      const rawArtist = song.artist || ''
      const rawTitle = song.title || ''
      
      // Parse properly
      const parsed = parseTrackInfo(rawText, rawArtist, rawTitle)
      artist = parsed.artist
      trackTitle = parsed.title
      
      if (artist && trackTitle) {
        title = `${artist} - ${trackTitle}`
      } else if (trackTitle) {
        title = trackTitle
      } else if (artist) {
        title = artist
      } else {
        title = parsed.cleanTitle || 'Неизвестный трек'
      }
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
    
    cachedData = result
    lastFetch = now
    
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
    
  } catch (error) {
    console.error('Now playing fetch error:', error)
    
    if (cachedData) {
      return NextResponse.json(cachedData, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      })
    }
    
    return NextResponse.json({ 
      title: 'Ошибка подключения', 
      error: true 
    }, { 
      status: 500,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  }
}
