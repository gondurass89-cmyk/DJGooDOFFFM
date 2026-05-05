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
      // Return cached data if available
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
    
    // Extract track info
    let title = 'Загрузка...'
    
    if (data.now_playing?.song) {
      const song = data.now_playing.song
      const artist = song.artist || ''
      const trackTitle = song.title || ''
      title = song.text || `${artist} - ${trackTitle}`.trim()
      if (title === ' - ') title = 'Неизвестный трек'
    }
    
    const result = {
      title,
      artist: data.now_playing?.song?.artist || '',
      track_title: data.now_playing?.song?.title || '',
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
    
    // Return cached data if available
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
