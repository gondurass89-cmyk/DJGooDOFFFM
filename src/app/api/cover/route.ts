import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Last.fm API key (free tier)
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || ''

interface CoverResult {
  cover: string | null
  source: string
}

// Try to get cover from AzuraCast
async function getAzuraCastCover(artUrl: string | null): Promise<string | null> {
  if (!artUrl) return null
  
  try {
    // If it's a relative URL, prepend AzuraCast base URL
    const fullUrl = artUrl.startsWith('http') 
      ? artUrl 
      : `http://178.49.69.37${artUrl}`
    
    const response = await fetch(fullUrl, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })
    
    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
      return fullUrl
    }
  } catch (e) {
    console.error('[COVER] AzuraCast error:', e)
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
        // Get high-res artwork (replace 100x100 with 600x600)
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

// Try to get cover from Last.fm
async function getLastFmCover(artist: string, title: string): Promise<string | null> {
  if (!LASTFM_API_KEY || (!artist && !title)) return null
  
  try {
    // Try track.getInfo first
    const params = new URLSearchParams({
      method: 'track.getInfo',
      api_key: LASTFM_API_KEY,
      artist: artist || 'Unknown',
      track: title || 'Unknown',
      format: 'json',
    })
    
    const response = await fetch(
      `https://ws.audioscrobbler.com/2.0/?${params}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      const images = data?.track?.album?.image
      if (images && images.length > 0) {
        // Get the largest image (extralarge or mega)
        const largeImage = images.find((img: any) => img.size === 'extralarge')?.['#text']
          || images.find((img: any) => img.size === 'mega')?.['#text']
          || images[images.length - 1]?.['#text']
        
        if (largeImage) {
          return largeImage
        }
      }
    }
    
    // Try album.getInfo if track search failed
    const albumParams = new URLSearchParams({
      method: 'album.getInfo',
      api_key: LASTFM_API_KEY,
      artist: artist || 'Unknown',
      album: title || 'Unknown',
      format: 'json',
    })
    
    const albumResponse = await fetch(
      `https://ws.audioscrobbler.com/2.0/?${albumParams}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
        }
      }
    )
    
    if (albumResponse.ok) {
      const data = await albumResponse.json()
      const images = data?.album?.image
      if (images && images.length > 0) {
        const largeImage = images.find((img: any) => img.size === 'extralarge')?.['#text']
          || images.find((img: any) => img.size === 'mega')?.['#text']
          || images[images.length - 1]?.['#text']
        
        if (largeImage) {
          return largeImage
        }
      }
    }
  } catch (e) {
    console.error('[COVER] Last.fm error:', e)
  }
  
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artist = searchParams.get('artist') || ''
  const title = searchParams.get('title') || ''
  const azuracastArt = searchParams.get('azuracast_art')
  
  const result: CoverResult = {
    cover: null,
    source: 'none'
  }
  
  // Try AzuraCast first
  if (azuracastArt) {
    const cover = await getAzuraCastCover(azuracastArt)
    if (cover) {
      result.cover = cover
      result.source = 'azuracast'
      return NextResponse.json(result)
    }
  }
  
  // Try Apple Music
  const appleCover = await getAppleMusicCover(artist, title)
  if (appleCover) {
    result.cover = appleCover
    result.source = 'apple_music'
    return NextResponse.json(result)
  }
  
  // Try Last.fm
  const lastFmCover = await getLastFmCover(artist, title)
  if (lastFmCover) {
    result.cover = lastFmCover
    result.source = 'lastfm'
    return NextResponse.json(result)
  }
  
  // No cover found
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
