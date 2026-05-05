import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

interface CoverResult {
  cover: string | null
  source: string
}

// Proxy AzuraCast cover art (HTTP -> HTTPS)
async function getAzuraCastCover(artUrl: string | null): Promise<string | null> {
  if (!artUrl) return null
  
  try {
    // If it's already a full URL, use it
    const fullUrl = artUrl.startsWith('http') 
      ? artUrl 
      : `http://178.49.69.37${artUrl}`
    
    // For HTTPS compatibility, we return the proxy URL instead of direct HTTP
    // The frontend will use this proxied URL
    const encodedUrl = encodeURIComponent(fullUrl)
    return `/api/cover-proxy?url=${encodedUrl}`
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

// Try to get cover from Deezer (good fallback)
async function getDeezerCover(artist: string, title: string): Promise<string | null> {
  if (!artist && !title) return null
  
  try {
    const query = encodeURIComponent(`${artist} ${title}`.trim())
    const response = await fetch(
      `https://api.deezer.com/search?q=${query}&limit=1`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      if (data.data && data.data.length > 0) {
        const cover = data.data[0].album?.cover_xl || data.data[0].album?.cover_big
        if (cover) {
          return cover
        }
      }
    }
  } catch (e) {
    console.error('[COVER] Deezer error:', e)
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
  
  // Try AzuraCast first (through proxy)
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
  
  // Try Deezer
  const deezerCover = await getDeezerCover(artist, title)
  if (deezerCover) {
    result.cover = deezerCover
    result.source = 'deezer'
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
