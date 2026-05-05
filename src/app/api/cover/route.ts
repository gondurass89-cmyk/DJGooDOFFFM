import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

interface CoverResult {
  cover: string | null
  source: string
}

// Last.fm API - бесплатный, без ключа работает
async function getLastFmCover(artist: string, title: string): Promise<string | null> {
  if (!artist && !title) return null
  
  try {
    // Last.fm API (можно без ключа для простого поиска)
    const query = encodeURIComponent(`${artist} ${title}`.trim())
    const response = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${query}&api_key=demo&format=json&limit=1`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'DJGooDOFFM-Radio/1.0',
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      const tracks = data.results?.trackmatches?.track
      if (tracks && tracks.length > 0) {
        // Получаем информацию о треке для обложки
        const trackInfo = tracks[0]
        
        // Попробуем получить обложку альбома через track.getInfo
        if (trackInfo.artist && trackInfo.name) {
          const infoResponse = await fetch(
            `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(trackInfo.artist)}&track=${encodeURIComponent(trackInfo.name)}&api_key=demo&format=json`,
            {
              signal: AbortSignal.timeout(5000),
              headers: {
                'User-Agent': 'DJGooDOFFM-Radio/1.0',
              }
            }
          )
          
          if (infoResponse.ok) {
            const infoData = await infoResponse.json()
            const album = infoData.track?.album
            if (album?.image) {
              // Ищем самую большую обложку (mega или extralarge)
              const images = album.image as Array<{ '#text': string; size: string }>
              const megaImage = images.find(img => img.size === 'mega')
              const extraLargeImage = images.find(img => img.size === 'extralarge')
              const largeImage = images.find(img => img.size === 'large')
              
              const coverUrl = megaImage?.['#text'] || extraLargeImage?.['#text'] || largeImage?.['#text']
              if (coverUrl && coverUrl.length > 0) {
                return coverUrl
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[COVER] Last.fm error:', e)
  }
  
  return null
}

// Try to get cover from Apple Music
async function getAppleMusicCover(artist: string, title: string): Promise<string | null> {
  if (!artist && !title) return null
  
  try {
    const query = encodeURIComponent(`${artist} ${title}`.trim())
    const response = await fetch(
      `https://itunes.apple.com/search?term=${query}&media=music&limit=1`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      if (data.results && data.results.length > 0) {
        const artwork = data.results[0].artworkUrl100
        if (artwork) {
          return artwork.replace('100x100', '600x600')
        }
      }
    }
  } catch (e) {
    console.error('[COVER] Apple Music error:', e)
  }
  
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artist = searchParams.get('artist') || ''
  const title = searchParams.get('title') || ''
  
  console.log(`[COVER] Searching for: ${artist} - ${title}`)
  
  const result: CoverResult = {
    cover: null,
    source: 'none'
  }
  
  // 1. Сначала пробуем Last.fm
  console.log('[COVER] Trying Last.fm...')
  const lastFmCover = await getLastFmCover(artist, title)
  if (lastFmCover) {
    console.log('[COVER] Found on Last.fm')
    result.cover = lastFmCover
    result.source = 'lastfm'
    return NextResponse.json(result)
  }
  
  // 2. Потом Apple Music
  console.log('[COVER] Trying Apple Music...')
  const appleCover = await getAppleMusicCover(artist, title)
  if (appleCover) {
    console.log('[COVER] Found on Apple Music')
    result.cover = appleCover
    result.source = 'apple_music'
    return NextResponse.json(result)
  }
  
  // 3. Не нашли - возвращаем null (фронтенд покажет логотип)
  console.log('[COVER] No cover found, will use logo')
  return NextResponse.json(result)
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
