import { NextRequest } from 'next/server'
import { serverLog } from '@/lib/logger'
import { STREAM_CONFIG } from '@/lib/config'

// Force Node.js runtime for streaming support
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Use centralized config
const STREAM_URL = STREAM_CONFIG.internalUrl
const FETCH_TIMEOUT = STREAM_CONFIG.timeout

export async function GET(request: NextRequest) {
  try {
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    // Fetch the stream from Icecast with timeout
    const response = await fetch(STREAM_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DJGooDOFF-FM-Vercel-Proxy/1.0',
        'Accept': '*/*',
      },
    })

    clearTimeout(timeoutId)

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
    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      serverLog.error('[STREAM] Timeout: upstream did not respond in', FETCH_TIMEOUT, 'ms')
      return new Response('Stream timeout: upstream server not responding', {
        status: 504,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

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
