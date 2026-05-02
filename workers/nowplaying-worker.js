// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Получение текущего трека из Icecast JSON API
// =====================================================
//
// НАЗНАЧЕНИЕ:
// - Получает название текущего трека из Icecast
// - Возвращает JSON с title, listeners, online
// - Кэширует ответ на 10 секунд
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: nowplaying
// - URL: https://nowplaying.gondurass89.workers.dev
// =====================================================

// =====================================================
// КОНФИГУРАЦИЯ
// =====================================================
const ICECAST_JSON_URL = 'http://178.49.69.37:8000/status-json.xsl';
const MOUNT_POINT = '/Radio';
const CACHE_MAX_AGE = 10; // секунд
const CONNECT_TIMEOUT = 5000; // 5 секунд

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
    // Только GET
    // =====================================================
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // =====================================================
    // ЗАПРОС К ICECAST
    // =====================================================
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT);

      const response = await fetch(ICECAST_JSON_URL, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return jsonResponse(getOfflineResponse(), 503, CACHE_MAX_AGE);
      }

      const data = await response.json();

      // =====================================================
      // ПАРСИНГ ДАННЫХ
      // =====================================================
      const source = findSource(data, MOUNT_POINT);

      if (!source) {
        return jsonResponse(getOfflineResponse(), 503, CACHE_MAX_AGE);
      }

      // Извлекаем title с fallback логикой
      let title = source.title;

      // Если title пустой, пробуем metadata.x_icy_title
      if (!title && source.metadata?.x_icy_title) {
        title = source.metadata.x_icy_title;
      }

      // Если всё ещё пустой, берём первый трек из плейлиста
      if (!title && source.playlist?.trackList?.length > 0) {
        title = source.playlist.trackList[0].title;
      }

      // Очищаем title от технических префиксов
      title = cleanTitle(title);

      // Если после очистки пусто — дефолт
      if (!title) {
        title = 'DJ GooD OFF FM';
      }

      // Количество слушателей
      const listeners = source.listeners || 0;

      // =====================================================
      // ОТВЕТ
      // =====================================================
      return jsonResponse({
        title,
        listeners,
        online: true,
      }, 200, CACHE_MAX_AGE);

    } catch (error) {
      console.error('[NOWPLAYING] Error:', error.message);
      return jsonResponse(getOfflineResponse(), 503, CACHE_MAX_AGE);
    }
  }
};

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

/**
 * Найти source по mount point
 */
function findSource(data, mountPoint) {
  if (!data?.icestats?.source) return null;

  const source = data.icestats.source;

  // Если один source (не массив)
  if (!Array.isArray(source)) {
    const url = source.listenurl || '';
    if (url.endsWith(mountPoint) || url.includes(mountPoint)) {
      return source;
    }
    return null;
  }

  // Если массив sources
  for (const s of source) {
    const url = s.listenurl || '';
    if (url.endsWith(mountPoint) || url.includes(mountPoint)) {
      return s;
    }
  }

  // Если не нашли по mount, берём первый
  return source[0] || null;
}

/**
 * Очистка title от технических префиксов
 * Удаляет: "6A - Energy 8 - " и подобное
 */
function cleanTitle(title) {
  if (!title) return null;

  let cleaned = title.trim();

  // Удаляем Camelot key и Energy в начале
  // Паттерн: "6A - Energy 8 - " или "11B - "
  cleaned = cleaned.replace(/^\d{1,2}[ABАВ]\s*-\s*(Energy\s*\d{1,2}\s*-\s*)?/gi, '');

  // Удаляем Camelot key в середине/конце
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABАВ]\s*/gi, ' ');

  // Удаляем "Energy X" в середине/конце
  cleaned = cleaned.replace(/\s*-?\s*Energy\s*\d{1,2}\s*/gi, ' ');

  // Убираем лишние пробелы
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // Убираем trailing dash
  cleaned = cleaned.replace(/\s*-\s*$/g, '').trim();

  return cleaned || null;
}

/**
 * Базовые CORS заголовки
 */
function getCorsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '3600',
  });
}

/**
 * JSON ответ с CORS и кэшированием
 */
function jsonResponse(data, status = 200, maxAge = 0) {
  const headers = getCorsHeaders();
  headers.set('Content-Type', 'application/json');

  if (maxAge > 0) {
    headers.set('Cache-Control', `public, max-age=${maxAge}`);
  } else {
    headers.set('Cache-Control', 'no-store');
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Ответ когда стрим офлайн
 */
function getOfflineResponse() {
  return {
    title: 'Офлайн',
    listeners: 0,
    online: false,
  };
}
