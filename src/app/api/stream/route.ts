import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const ICECAST_URL = 'http://178.49.69.37:8000/Radio'

export async function GET(request: Request) {
  try {
    const { headers } = request
    
    // Build headers to forward to Icecast
    const forwardHeaders: HeadersInit = {
      'User-Agent': headers.get('user-agent') || 'DJGooDOFFFM-Proxy/1.0',
    }
    
    const response = await fetch(ICECAST_URL, {
      method: 'GET',
      headers: forwardHeaders,
    })

    if (!response.ok) {
      console.error('Icecast error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Stream unavailable', status: response.status },
        { status: response.status }
      )
    }

    // Build response headers
    const responseHeaders = new Headers()
    
    // Copy content-type
    const contentType = response.headers.get('content-type')
    if (contentType) responseHeaders.set('Content-Type', contentType)
    
    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type')
    responseHeaders.set('Cache-Control', 'no-store, no-cache')
    
    // Stream the response directly
    return new NextResponse(response.body, {
      status: 200,
      headers: responseHeaders,
    })
    
  } catch (error: any) {
    console.error('Stream proxy error:', error)
    return NextResponse.json(
      { error: 'Stream connection failed', message: error.message },
      { status: 502 }
    )
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
