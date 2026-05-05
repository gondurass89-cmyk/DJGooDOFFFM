import { NextRequest } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// AzuraCast stream URL
const AZURACAST_URL = 'https://stream.volfrings.ru'
const STATION_SHORTCODE = 'dj_good_off_fm'
const STREAM_URL = `${AZURACAST_URL}/listen/${STATION_SHORTCODE}/radio.mp3`

export async function GET(request: NextRequest) {
  try {
    // Fetch the stream from AzuraCast
    const response = await fetch(STREAM_URL, {
      headers: {
        'Accept': 'audio/mpeg, audio/*, */*',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
      },
    })

    if (!response.ok) {
      console.error('[STREAM] AzuraCast error:', response.status)
      return new Response('Stream unavailable', { status: response.status })
    }

    // Get the response body as a readable stream
    const reader = response.body?.getReader()
    
    if (!reader) {
      return new Response('Stream unavailable', { status: 500 })
    }

    // Create a TransformStream to pipe the audio
    const { readable, writable } = new TransformStream()
    
    // Pipe the stream in the background
    ;(async () => {
      const writer = writable.getWriter()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await writer.write(value)
        }
      } catch (error) {
        console.error('[STREAM] Pipe error:', error)
      } finally {
        await writer.close()
      }
    })()

    // Return the proxied stream with proper headers
    return new Response(readable, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-cache, no-store',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
        'icy-name': 'DJ GooD OFF FM',
        'icy-genre': 'Electronic',
      },
    })

  } catch (error) {
    console.error('[STREAM] Error:', error)
    return new Response('Stream error', { status: 500 })
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
