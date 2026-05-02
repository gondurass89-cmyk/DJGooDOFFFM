import { NextResponse } from 'next/server'

const ICECAST_URL = 'http://178.49.69.37:8000/Radio'

export async function GET(request: Request) {
  try {
    const { headers } = request
    
    // Build headers to forward to Icecast
    const forwardHeaders: HeadersInit = {
      'User-Agent': headers.get('user-agent') || 'DJGooDOFFFM-Proxy/1.0',
      'Icy-MetaData': '1',
    }
    
    // Forward Range header if present (for seeking)
    const range = headers.get('range')
    if (range) {
      forwardHeaders['Range'] = range
    }

    const response = await fetch(ICECAST_URL, {
      method: 'GET',
      headers: forwardHeaders,
      // @ts-ignore - duplex is needed for streaming
      duplex: 'half',
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
    
    // Copy relevant headers from Icecast
    const headersToCopy = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'icy-name',
      'icy-genre',
      'icy-url',
      'icy-metaint',
      'icy-br',
    ]
    
    headersToCopy.forEach(header => {
      const value = response.headers.get(header)
      if (value) {
        responseHeaders.set(header, value)
      }
    })
    
    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type')
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length')
    
    // Prevent caching
    responseHeaders.set('Cache-Control', 'no-store, no-cache')
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
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

// Handle HEAD requests
export async function HEAD(request: Request) {
  try {
    const response = await fetch(ICECAST_URL, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'DJGooDOFFFM-Proxy/1.0',
      },
    })

    const headers = new Headers()
    headers.set('Access-Control-Allow-Origin', '*')
    
    const contentType = response.headers.get('content-type')
    if (contentType) headers.set('Content-Type', contentType)
    
    const contentLength = response.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new NextResponse(null, {
      status: response.status,
      headers,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Stream unavailable' },
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
