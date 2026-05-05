import { NextRequest, NextResponse } from 'next/server'

// Force dynamic
export const dynamic = 'force-dynamic'

// AzuraCast stream URL
const STREAM_URL = 'http://178.49.69.37/listen/dj_good_off_fm/radio.mp3'

export async function GET(request: NextRequest) {
  try {
    // Fetch the stream from AzuraCast
    const response = await fetch(STREAM_URL, {
      headers: {
        'User-Agent': 'DJGooDOFF-FM/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'identity', // Don't request compressed audio
        'Icy-MetaData': '1', // Request ICY metadata
      },
    })

    if (!response.ok) {
      console.error('[STREAM] AzuraCast error:', response.status)
      return NextResponse.json(
        { error: 'Stream unavailable' },
        { status: response.status }
      )
    }

    // Get the content type
    const contentType = response.headers.get('content-type') || 'audio/mpeg'

    // Stream the response
    const reader = response.body?.getReader()

    if (!reader) {
      return NextResponse.json(
        { error: 'No stream body' },
        { status: 500 }
      )
    }

    // Create a TransformStream to pipe the audio
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          controller.close()
        } catch (error) {
          console.error('[STREAM] Read error:', error)
          controller.error(error)
        }
      },
      cancel() {
        reader.cancel()
      }
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store',
        'Accept-Ranges': 'none',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('[STREAM] Error:', error)
    return NextResponse.json(
      { error: 'Stream error' },
      { status: 500 }
    )
  }
}

// Handle HEAD requests for stream info
export async function HEAD() {
  try {
    const response = await fetch(STREAM_URL, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'DJGooDOFF-FM/1.0',
      },
    })

    const contentType = response.headers.get('content-type') || 'audio/mpeg'

    return new NextResponse(null, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Stream unavailable' }, { status: 500 })
  }
}
