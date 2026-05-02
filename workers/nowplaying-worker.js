// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING (HYBRID)
// Получение текущего трека: D1 + Icecast JSON fallback
// =====================================================
//
// ИСТОЧНИКИ ДАННЫХ:
// 1. D1 Database (POST от RadioBoss) — первичный
// 2. Icecast JSON API — fallback
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> nowplaying
// - URL: https://nowplaying.gondurass89.workers.dev
// - D1 Binding: DB -> nowplaying-db
//
// SQL ТАБЛИЦА:
// CREATE TABLE track (id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT);
// INSERT INTO track (id, title) VALUES (1, 'DJ GooD OFF FM');
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
    // POST: Сохранение трека от RadioBoss
    // =====================================================
    if (request.method === 'POST') {
      return handlePost(request, env);
    }

    // =====================================================
    // GET: Получение текущего трека
    // =====================================================
    if (request.method === 'GET') {
      return handleGet(env);
    }

    // =====================================================
    // Неподдерживаемый метод
    // =====================================================
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
};

// =====================================================
// POST: Сохранение от RadioBoss
// =====================================================
async function handlePost(request, env) {
  try {
    let track = await request.text();

    // Нормализация апострофов
    track = track
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u0060\u00B4]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u2013\u2014/g, '-');

    console.log('[NOWPLAYING] POST received:', track);

    // Сохранение в D1
    await env.DB.prepare(`
      UPDATE track SET title = ? WHERE id = 1
    `).bind(track).run();

    return jsonResponse({ success: true, title: track }, 200);

  } catch (error) {
    console.error('[NOWPLAYING] POST Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// =====================================================
// GET: Получение трека (D1 + Icecast fallback)
// =====================================================
async function handleGet(env) {
  let title = null;
  let listeners = 0;
  let source = 'unknown';

  // =====================================================
  // 1. Пробуем получить из D1
  // =====================================================
  try {
    const result = await env.DB.prepare(`
      SELECT title FROM track WHERE id = 1
    `).first();

    if (result?.title && result.title.trim() && !result.title.includes('Загрузка')) {
      title = cleanTitle(result.title);
      source = 'd1';
      console.log('[NOWPLAYING] D1 title:', title);
    }
  } catch (error) {
    console.error('[NOWPLAYING] D1 Error:', error);
  }

  // =====================================================
  // 2. Если D1 пустой — fallback на Icecast JSON
  // =====================================================
  if (!title) {
    try {
      const icecastData = await fetchIcecastData();
      if (icecastData) {
        title = icecastData.title;
        listeners = icecastData.listeners;
        source = 'icecast';
        console.log('[NOWPLAYING] Icecast title:', title);
      }
    } catch (error) {
      console.error('[NOWPLAYING] Icecast Error:', error);
    }
  } else {
    // Если title из D1 — всё равно получаем listeners из Icecast
    try {
      const icecastData = await fetchIcecastData();
      if (icecastData) {
        listeners = icecastData.listeners;
      }
    } catch (error) {
      // Ignore
    }
  }

  // =====================================================
  // 3. Формируем ответ
  // =====================================================
  if (!title) {
    return jsonResponse({
      title: 'DJ GooD OFF FM',
      listeners: 0,
      online: false,
      source: 'none',
    }, 200, CACHE_MAX_AGE);
  }

  return jsonResponse({
    title,
    listeners,
    online: true,
    source,
  }, 200, CACHE_MAX_AGE);
}

// =====================================================
// Получение данных из Icecast JSON API
// =====================================================
async function fetchIcecastData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT);

  const response = await fetch(ICECAST_JSON_URL, {
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) return null;

  const data = await response.json();
  const source = findSource(data, MOUNT_POINT);

  if (!source) return null;

  // Извлекаем title с fallback
  let title = source.title;

  if (!title && source.metadata?.x_icy_title) {
    title = source.metadata.x_icy_title;
  }

  if (!title && source.playlist?.trackList?.length > 0) {
    title = source.playlist.trackList[0].title;
  }

  title = cleanTitle(title);

  return {
    title: title || null,
    listeners: source.listeners || 0,
  };
}

// =====================================================
// Найти source по mount point
// =====================================================
function findSource(data, mountPoint) {
  if (!data?.icestats?.source) return null;

  const source = data.icestats.source;

  if (!Array.isArray(source)) {
    const url = source.listenurl || '';
    if (url.endsWith(mountPoint) || url.includes(mountPoint)) {
      return source;
    }
    return null;
  }

  for (const s of source) {
    const url = s.listenurl || '';
    if (url.endsWith(mountPoint) || url.includes(mountPoint)) {
      return s;
    }
  }

  return source[0] || null;
}

// =====================================================
// Очистка title от технических префиксов
// =====================================================
function cleanTitle(title) {
  if (!title) return null;

  let cleaned = title.trim();

  // Удаляем [by ...] теги (например, "[by DragoN_Sky]")
  cleaned = cleaned.replace(/\s*\[by[^\]]*\]/gi, '');

  // Удаляем Camelot key и Energy
  cleaned = cleaned.replace(/^\d{1,2}[ABАВ]\s*-\s*(Energy\s*\d{1,2}\s*-\s*)?/gi, '');
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABАВ]\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*-?\s*Energy\s*\d{1,2}\s*/gi, ' ');

  // Удаляем веб-сайты в скобках
  cleaned = cleaned.replace(/\s*\([^)]*\.(com|ru|net|org|io)[^)]*\)/gi, '');

  // Cleanup
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/\s*-\s*$/g, '').trim();

  return cleaned || null;
}

// =====================================================
// CORS заголовки
// =====================================================
function getCorsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '3600',
  });
}

// =====================================================
// JSON ответ
// =====================================================
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
