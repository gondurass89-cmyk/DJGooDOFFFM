import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Proxy for cover art images (HTTP -> HTTPS)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')
  
  if (!imageUrl) {
    return new NextResponse('Missing URL parameter', { status: 400 })
  }
  
  try {
    // Decode the URL
    const decodedUrl = decodeURIComponent(imageUrl)
    
    // Fetch the image
    const response = await fetch(decodedUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'image/*',
      },
    })
    
    if (!response.ok) {
      console.error('[COVER-PROXY] Image fetch error:', response.status)
      return new NextResponse('Image not found', { status: 404 })
    }
    
    // Get the image data
    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    
    // Return the image with proper caching
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
    
  } catch (error) {
    console.error('[COVER-PROXY] Error:', error)
    return new NextResponse('Failed to fetch image', { status: 500 })
  }
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
