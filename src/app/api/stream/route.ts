import { NextRequest } from 'next/server'
import { serverLog } from '@/lib/logger'

// Force Node.js runtime for streaming support
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Icecast stream URL (IPv4 only, your local server)
const STREAM_URL = 'http://178.49.69.37:8000/Radio'

export async function GET(request: NextRequest) {
  try {
    // Fetch the stream from Icecast
    const response = await fetch(STREAM_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'DJGooDOFF-FM-Vercel-Proxy/1.0',
        'Accept': '*/*',
      },
    })

    if (!response.ok) {
      serverLog.error('[STREAM] Upstream error:', response.status, response.statusText)
      return new Response('Stream unavailable', {
        status: response.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Return streaming response
    return new Response(response.body, {
      status: 200,
      headers: {
        // CORS headers
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length',

        // Content type - MP3 audio
        'Content-Type': 'audio/mpeg',

        // No caching for live stream
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    serverLog.error('[STREAM] Error:', message)
    return new Response(`Stream error: ${message}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '3600',
    },
  })
}
