// =====================================================
// CLOUDFLARE WORKER: RADIO STREAM PROXY
// HTTPS proxy для HTTP аудио потока Icecast
// =====================================================
//
// НАЗНАЧЕНИЕ:
// - Проксирует HTTP MP3 поток через HTTPS
// - Копирует icy-* заголовки от Icecast
// - Добавляет CORS заголовки
// - Возвращает JSON ошибку если стрим недоступен
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: radio-stream
// - URL: https://radio-stream.gondurass89.workers.dev
// =====================================================

// =====================================================
// КОНФИГУРАЦИЯ
// =====================================================
const UPSTREAM_URL = 'http://178.49.69.37:8000/Radio';
const CONNECT_TIMEOUT = 5000; // 5 секунд на подключение

// Заголовки Icecast которые проксируем клиенту
const ICY_HEADERS = [
  'icy-name',
  'icy-description',
  'icy-genre',
  'icy-url',
  'icy-br',           // Bitrate
  'icy-sr',           // Sample rate
  'icy-audio-info',
];

// =====================================================
// ГЛАВНЫЙ ОБРАБОТЧИК
// =====================================================
export default {
  async fetch(request, env, ctx) {

    // =====================================================
    // OPTIONS (CORS preflight)
    // =====================================================
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(),
      });
    }

    // =====================================================
    // ПРОВЕРКА МЕТОДА
    // =====================================================
    const allowedMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!allowedMethods.includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // =====================================================
    // ЗАПРОС К UPSTREAM
    // =====================================================
    try {
      console.log(`[PROXY] ${request.method} from ${request.headers.get('CF-Connecting-IP') || 'unknown'}`);

      // Заголовки для upstream
      const upstreamHeaders = new Headers();
      upstreamHeaders.set('User-Agent', 'DJGooDOFF-FM-Radio-Proxy/1.0');

      // Запрос с таймаутом
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT);

      const upstreamResponse = await fetch(UPSTREAM_URL, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // =====================================================
      // ПРОВЕРКА ОТВЕТА UPSTREAM
      // =====================================================
      if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
        console.error(`[PROXY] Upstream error: ${upstreamResponse.status}`);
        return jsonResponse({ error: 'Stream offline' }, 503);
      }

      console.log(`[PROXY] Connected: ${upstreamResponse.status}`);

      // =====================================================
      // ФОРМИРОВАНИЕ ЗАГОЛОВКОВ ОТВЕТА
      // =====================================================
      const responseHeaders = getCorsHeaders();

      // Anti-cache для live потока
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      responseHeaders.set('Pragma', 'no-cache');
      responseHeaders.set('Expires', '0');

      // Content-Type из ответа Icecast или по умолчанию
      const contentType = upstreamResponse.headers.get('Content-Type');
      responseHeaders.set('Content-Type', contentType || 'audio/mpeg');

      // Проксирование icy-* заголовков
      for (const header of ICY_HEADERS) {
        const value = upstreamResponse.headers.get(header);
        if (value) {
          responseHeaders.set(header, value);
        }
      }

      // Разрешаем клиенту читать эти заголовки через JS
      const exposeHeaders = [
        'Content-Type',
        'Content-Length',
        'Cache-Control',
        ...ICY_HEADERS,
      ].join(', ');
      responseHeaders.set('Access-Control-Expose-Headers', exposeHeaders);

      // =====================================================
      // STREAMING RESPONSE
      // =====================================================
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });

    } catch (error) {
      // =====================================================
      // ОБРАБОТКА ОШИБОК
      // =====================================================
      console.error('[PROXY] Error:', error.message);

      // Таймаут или недоступность upstream
      if (error.name === 'AbortError') {
        return jsonResponse({ error: 'Stream offline' }, 503);
      }

      // Другие ошибки (DNS, сеть и т.д.)
      return jsonResponse({ error: 'Stream offline' }, 503);
    }
  }
};

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

/**
 * Базовые CORS заголовки
 */
function getCorsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '3600',
  });
}

/**
 * JSON ответ с CORS заголовками
 */
function jsonResponse(data, status = 200) {
  const headers = getCorsHeaders();
  headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}
