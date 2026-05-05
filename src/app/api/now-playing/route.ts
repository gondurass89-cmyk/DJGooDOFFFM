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

// =====================================================
// DJ METADATA DETECTION
// =====================================================

// Check if a string segment is DJ metadata (key, energy, bpm, etc.)
function isDjMetadata(str: string): boolean {
  if (!str) return false
  const cleanStr = str.trim().toLowerCase()
  
  // Empty or very short
  if (cleanStr.length < 2) return false
  
  // Key patterns: 1A-12A, 1B-12B (Camelot Wheel)
  if (/^[1-9][0-2]?[ab]$/i.test(cleanStr)) return true
  
  // Energy patterns: Energy 1-10, Energy10
  if (/^energy\s*[0-9]+$/i.test(cleanStr)) return true
  
  // BPM patterns: 120BPM, 120 BPM
  if (/^\d+\s*bpm$/i.test(cleanStr)) return true
  
  // Musical key notations: Cm, Am, F#m, Bb, etc.
  if (/^[a-g][#b]?m?$/i.test(cleanStr) && cleanStr.length <= 3) return true
  
  return false
}

// Check if a string STARTS with DJ metadata
function startsWithDjMetadata(str: string): { isMetadata: boolean; cleanStart: string } {
  if (!str) return { isMetadata: false, cleanStart: str }
  
  const trimmed = str.trim()
  
  // Pattern: "4A - " or "4A - Energy 7 - " at the start
  // Match: KEY followed by optional " - Energy X" and " - "
  const startPattern = /^([1-9][0-2]?[ab](\s*-\s*energy\s*[0-9]+)?(\s*-\s*)?)/i
  const match = trimmed.match(startPattern)
  
  if (match) {
    // Check if what we matched ends with " - " (meaning more content follows)
    const matched = match[1]
    if (matched.includes(' - ') || isDjMetadata(matched.replace(/\s*-\s*$/, ''))) {
      const cleanStart = trimmed.slice(matched.length)
      return { isMetadata: true, cleanStart }
    }
  }
  
  // Pattern: "Energy 7 - " at the start
  const energyStartPattern = /^(energy\s*[0-9]+\s*-\s*)/i
  const energyMatch = trimmed.match(energyStartPattern)
  if (energyMatch) {
    const cleanStart = trimmed.slice(energyMatch[1].length)
    return { isMetadata: true, cleanStart }
  }
  
  return { isMetadata: false, cleanStart: trimmed }
}

// Remove DJ metadata from the END of a title string
function stripDjMetadataFromEnd(title: string): string {
  if (!title) return title
  
  let cleaned = title.trim()
  
  // Pattern: " - 7A - Energy 6" or " 7A - Energy 6" at the end
  cleaned = cleaned.replace(/\s*(-\s*)?[1-9][0-2]?[ab]\s*(-\s*energy\s*[0-9]+)?$/i, '')
  
  // Pattern: " - Energy 6" or " Energy 6" at the end
  cleaned = cleaned.replace(/\s*(-\s*)?energy\s*[0-9]+$/i, '')
  
  // Pattern: " - 5A" or " 5A" at the end
  cleaned = cleaned.replace(/\s*(-\s*)?[1-9][0-2]?[ab]$/i, '')
  
  // Pattern: " - 120 BPM" at the end
  cleaned = cleaned.replace(/\s*(-\s*)?\d+\s*bpm$/i, '')
  
  // Clean up trailing " - " that might be left
  cleaned = cleaned.replace(/\s*-\s*$/, '').trim()
  
  return cleaned
}

// Remove DJ metadata from the START of a string
function stripDjMetadataFromStart(str: string): string {
  if (!str) return str
  
  let cleaned = str.trim()
  
  // Pattern: "4A - Energy 7 - " or "4A - " at the start
  const startPattern = /^([1-9][0-2]?[ab](\s*-\s*energy\s*[0-9]+)?(\s*-\s*)?)/i
  cleaned = cleaned.replace(startPattern, '')
  
  // Pattern: "Energy 7 - " at the start
  cleaned = cleaned.replace(/^energy\s*[0-9]+\s*-\s*/i, '')
  
  // Pattern: Just a key at the start followed by " - "
  cleaned = cleaned.replace(/^[1-9][0-2]?[ab]\s*-\s*/i, '')
  
  return cleaned.trim()
}

// =====================================================
// TRACK PARSING - COMPLETE REWRITE
// =====================================================

interface ParsedTrack {
  artist: string
  title: string
  cleanTitle: string
}

/**
 * Parse track info from AzuraCast's messy data structure
 * 
 * AzuraCast can return data in various formats:
 * 
 * Example 1 (metadata in artist):
 *   text: "4A - Energy 7 - Paperclip, Despersion - Axiom"
 *   artist: "4A - Energy 7"  <- This is JUST metadata!
 *   title: "Paperclip, Despersion - Axiom"  <- Contains artist AND title
 *   Expected: artist="Paperclip, Despersion", title="Axiom"
 * 
 * Example 2 (metadata in text):
 *   text: "9A - Energy 7 - Ondamike - Molly - Molly (Original Mix)"
 *   artist: "9A - Energy 7 - Ondamike"  <- Metadata prefix + artist
 *   title: "Molly (Original Mix)"
 *   Expected: artist="Ondamike", title="Molly (Original Mix)"
 * 
 * Example 3 (normal):
 *   text: "Artist Name - Track Title"
 *   artist: "Artist Name"
 *   title: "Track Title"
 */
function parseTrackInfo(text: string, artist: string, title: string): ParsedTrack {
  // Step 1: Check if artist field is ONLY DJ metadata (empty after stripping = all metadata)
  const strippedArtist = artist ? stripDjMetadataFromStart(artist) : ''
  const artistIsOnlyMetadata = artist && (strippedArtist === '' || isDjMetadata(strippedArtist))

  if (artistIsOnlyMetadata) {
    // The artist field is just metadata, ignore it
    // Try to parse artist from title or text
    if (title && title.includes(' - ')) {
      // Title contains "Artist - Title"
      const titleParts = title.split(' - ')
      const cleanTitleParts = titleParts.filter(p => !isDjMetadata(p.trim()))
      
      if (cleanTitleParts.length >= 2) {
        const parsedArtist = cleanTitleParts[0].trim()
        const parsedTitle = cleanTitleParts[cleanTitleParts.length - 1].trim()
        return {
          artist: parsedArtist,
          title: parsedTitle,
          cleanTitle: `${parsedArtist} - ${parsedTitle}`
        }
      }
      
      if (cleanTitleParts.length === 1) {
        return {
          artist: '',
          title: cleanTitleParts[0].trim(),
          cleanTitle: cleanTitleParts[0].trim()
        }
      }
    }
    
    // Fall back to parsing text
    if (text) {
      return parseTextWithMetadata(text)
    }
    
    return {
      artist: '',
      title: title || 'Неизвестный трек',
      cleanTitle: title || 'Неизвестный трек'
    }
  }
  
  // Step 2: Clean metadata from artist field (already computed above)
  let cleanArtist = strippedArtist
  
  // Step 3: If title contains "Artist - Title", extract from there
  if (title && title.includes(' - ')) {
    const titleParts = title.split(' - ')
    const cleanTitleParts = titleParts.filter(p => !isDjMetadata(p.trim()))
    
    if (cleanTitleParts.length >= 2) {
      // Title has both artist and track name
      cleanArtist = cleanTitleParts[0].trim()
      const cleanTitle = cleanTitleParts[cleanTitleParts.length - 1].trim()
      return {
        artist: cleanArtist,
        title: cleanTitle,
        cleanTitle: `${cleanArtist} - ${cleanTitle}`
      }
    }
  }
  
  // Step 4: Clean title of any trailing metadata
  let cleanTitle = title ? stripDjMetadataFromEnd(title) : ''
  
  // Step 5: If we have both artist and title, return them
  if (cleanArtist && cleanTitle) {
    return {
      artist: cleanArtist,
      title: cleanTitle,
      cleanTitle: `${cleanArtist} - ${cleanTitle}`
    }
  }
  
  // Step 6: Parse from text field as last resort
  if (text) {
    return parseTextWithMetadata(text)
  }
  
  // Fallback
  return {
    artist: cleanArtist || '',
    title: cleanTitle || 'Неизвестный трек',
    cleanTitle: cleanArtist && cleanTitle ? `${cleanArtist} - ${cleanTitle}` : (cleanTitle || cleanArtist || 'Неизвестный трек')
  }
}

// Parse the text field which might contain metadata-prefixed content
function parseTextWithMetadata(text: string): ParsedTrack {
  if (!text) {
    return { artist: '', title: 'Неизвестный трек', cleanTitle: 'Неизвестный трек' }
  }
  
  // Remove metadata from start
  let cleaned = stripDjMetadataFromStart(text)
  
  // Remove metadata from end
  cleaned = stripDjMetadataFromEnd(cleaned)
  
  // Split by " - "
  const parts = cleaned.split(' - ')
  
  // Filter out any remaining metadata parts
  const cleanParts = parts.filter(p => !isDjMetadata(p.trim()))
  
  if (cleanParts.length >= 2) {
    const artist = cleanParts[0].trim()
    const title = cleanParts[cleanParts.length - 1].trim()
    return {
      artist,
      title,
      cleanTitle: `${artist} - ${title}`
    }
  }
  
  if (cleanParts.length === 1) {
    return {
      artist: '',
      title: cleanParts[0].trim(),
      cleanTitle: cleanParts[0].trim()
    }
  }
  
  return {
    artist: '',
    title: cleaned || 'Неизвестный трек',
    cleanTitle: cleaned || 'Неизвестный трек'
  }
}

// =====================================================
// API HANDLER
// =====================================================

export async function GET() {
  const now = Date.now()
  
  // Return cached data if fresh
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
      
      // Parse properly with the new logic
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
