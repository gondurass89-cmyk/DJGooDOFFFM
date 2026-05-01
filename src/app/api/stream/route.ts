import { NextRequest, NextResponse } from 'next/server';

// =====================================================
// RADIO STREAM PROXY API
// Проксирует MP3 поток через HTTPS для Telegram Mini APP
// =====================================================

// URL аудио потока (Icecast сервер)
const UPSTREAM_URL = 'http://178.49.69.37:8000/Radio';

// =====================================================
// OPTIONS - CORS Preflight
// =====================================================
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '3600',
    },
  });
}

// =====================================================
// GET - Проксирование аудио потока
// =====================================================
export async function GET(request: NextRequest) {
  try {
    console.log('[STREAM PROXY] Request from:', request.headers.get('x-forwarded-for') || 'unknown');

    // Создаём заголовки для upstream
    const upstreamHeaders = new Headers();
    upstreamHeaders.set('User-Agent', 'DJGooDOFF-FM-Stream-Proxy/1.0');

    // Запрос к Icecast серверу
    const upstreamResponse = await fetch(UPSTREAM_URL, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!upstreamResponse.ok) {
      console.error('[STREAM PROXY] Upstream error:', upstreamResponse.status, upstreamResponse.statusText);
      return new NextResponse(`Upstream Error: ${upstreamResponse.status}`, {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    console.log('[STREAM PROXY] Upstream OK:', upstreamResponse.status);
    console.log('[STREAM PROXY] Content-Type:', upstreamResponse.headers.get('Content-Type'));

    // Формируем заголовки ответа
    const responseHeaders = new Headers();

    // CORS заголовки
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    // Anti-cache для live потока
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');

    // Content-Type
    responseHeaders.set('Content-Type', 'audio/mpeg');

    // Возвращаем streaming response
    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[STREAM PROXY] Error:', error);
    return new NextResponse(`Proxy Error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// =====================================================
// HEAD - Для проверки доступности
// =====================================================
export async function HEAD(request: NextRequest) {
  try {
    const upstreamResponse = await fetch(UPSTREAM_URL, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'DJGooDOFF-FM-Stream-Proxy/1.0',
      },
    });

    return new NextResponse(null, {
      status: upstreamResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    return new NextResponse(null, {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
