// =====================================================
// CLOUDFLARE WORKER: RADIO STREAM PROXY
// HTTPS clean proxy для MP3 аудио потока
// =====================================================
// 
// НАЗНАЧЕНИЕ:
// - Проксирует HTTP MP3 поток через HTTPS
// - Добавляет CORS заголовки для кросс-доменного доступа
// - НЕ делает transcoding, НЕ делает HLS, НЕ делает MSE
// - Возвращает streaming response как есть
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: radio-stream
// - URL: https://radio-stream.gondurass89.workers.dev
// =====================================================

// =====================================================
// ИСХОДНЫЙ URL АУДИО ПОТОКА
// =====================================================
// RadioHeart MP3 поток (HTTP)
const UPSTREAM_URL = 'http://178.49.69.37:8000/Radio';
// ^^^^ HTTP URL который нужно проксировать через HTTPS

// =====================================================
// ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
// =====================================================
/**
 * Обрабатывает входящие HTTP запросы
 * @param request - Входящий Request объект
 * @param env - Переменные окружения (bindings)
 * @param ctx - Контекст выполнения
 * @returns Response объект
 */
export default {
  async fetch(request, env, ctx) {
    
    // =====================================================
    // ОБРАБОТКА OPTIONS (CORS preflight)
    // =====================================================
    // Браузеры отправляют OPTIONS запрос перед фактическим запросом
    // для проверки CORS политики
    if (request.method === 'OPTIONS') {
      // Возвращаем пустой ответ с CORS заголовками
      return new Response(null, {
        status: 204,                                          // No Content
        headers: {
          // Разрешаем запросы с любого источника
          'Access-Control-Allow-Origin': '*',
          // Разрешённые HTTP методы
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          // Разрешённые заголовки запроса
          'Access-Control-Allow-Headers': '*',
          // Время кеширования preflight ответа (1 час)
          'Access-Control-Max-Age': '3600',
        }
      });
    }
    
    // =====================================================
    // ПРОВЕРКА МЕТОДА ЗАПРОСА
    // =====================================================
    // Поддерживаем только GET, HEAD, OPTIONS
    const allowedMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!allowedMethods.includes(request.method)) {
      // Возвращаем ошибку 405 Method Not Allowed
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // =====================================================
    // ФОРМИРОВАНИЕ ЗАПРОСА К UPSTREAM
    // =====================================================
    try {
      // Логируем входящий запрос для отладки
      console.log(`[PROXY] ${request.method} request from ${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
      
      // Создаём заголовки для запроса к upstream
      const upstreamHeaders = new Headers();
      
      // =====================================================
      // ВАЖНО: НЕ добавляем Icy-MetaData заголовок
      // =====================================================
      // Icy-MetaData: 1 запрашивает метаданные в потоке
      // Это может вызвать проблемы с воспроизведением
      // Метаданные (название трека) встраиваются в аудио поток
      // и могут вызвать "щелчки" или ошибки декодирования
      // upstreamHeaders.set('Icy-MetaData', '1'); // <-- ЗАПРЕЩЕНО!
      
      // Добавляем User-Agent для upstream сервера
      // Некоторые сервера блокируют запросы без User-Agent
      upstreamHeaders.set('User-Agent', 'DJGooDOFF-FM-Radio-Proxy/1.0');
      
      // =====================================================
      // ВАЖНО: НЕ передаём Range заголовок!
      // =====================================================
      // Live-радио — это бесконечный поток, seek невозможен
      // Если передать Range, iOS Safari может попытаться сделать seek
      // и получить ошибку декодирования
      // Range заголовки игнорируем намеренно
      
      // =====================================================
      // ВЫПОЛНЕНИЕ ЗАПРОСА К UPSTREAM
      // =====================================================
      // fetch возвращает streaming response - не загружаем весь поток в память
      const upstreamResponse = await fetch(UPSTREAM_URL, {
        method: request.method,                               // GET или HEAD
        headers: upstreamHeaders,                             // Заголовки запроса
        redirect: 'follow',                                   // Следовать редиректам
      });
      
      // =====================================================
      // ПРОВЕРКА ОТВЕТА UPSTREAM
      // =====================================================
      if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
        // 206 Partial Content - нормальный ответ для Range запросов
        console.error(`[PROXY] Upstream error: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
        return new Response('Upstream Error', {
          status: upstreamResponse.status,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
      
      // Логируем успешный ответ
      console.log(`[PROXY] Upstream response: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
      console.log(`[PROXY] Content-Type: ${upstreamResponse.headers.get('Content-Type')}`);
      console.log(`[PROXY] Content-Length: ${upstreamResponse.headers.get('Content-Length') || 'streaming'}`);
      
      // =====================================================
      // ФОРМИРОВАНИЕ ЗАГОЛОВКОВ ОТВЕТА
      // =====================================================
      const responseHeaders = new Headers();
      
      // --- CORS заголовки (критически важны для WebAudio) ---
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');
      
      // --- Anti-cache заголовки ---
      // Отключаем кеширование для live потока
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      responseHeaders.set('Pragma', 'no-cache');
      responseHeaders.set('Expires', '0');
      
      // --- Content-Type ---
      // Явно указываем что это MP3 аудио
      // Критически важно для iOS Safari - он строг к MIME-типам
      responseHeaders.set('Content-Type', 'audio/mpeg');
      
      // =====================================================
      // КРИТИЧЕСКИ ВАЖНО ДЛЯ iOS
      // =====================================================
      // Удаляем заголовки которые могут сломать воспроизведение:
      
      // Content-Encoding: если upstream случайно отдаст gzip/br,
      // а тело - сырой MP3, браузер попытается распаковать и получит мусор
      responseHeaders.delete('Content-Encoding');
      
      // Accept-Ranges: live stream не поддерживает seek
      // Если оставить, iOS Safari может попытаться сделать range-запрос
      responseHeaders.delete('Accept-Ranges');
      
      // Connection: бесполезен в HTTP/2, может вызывать конфликты
      responseHeaders.delete('Connection');
      
      // =====================================================
      // Access-Control-Expose-Headers
      // =====================================================
      // Позволяет клиенту читать эти заголовки через JS
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Cache-Control');
      
      // =====================================================
      // ВАЖНО: НЕ передаём icy-* заголовки клиенту
      // =====================================================
      // Icecast сервера могут возвращать icy-name, icy-genre и т.д.
      // Эти заголовки нестандартные и могут вызывать проблемы
      // Поэтому НЕ копируем их из upstream ответа
      
      // =====================================================
      // ВОЗВРАЩАЕМ STREAMING RESPONSE
      // =====================================================
      // upstreamResponse.body - это ReadableStream
      // Мы передаём его напрямую клиенту без буферизации
      // Это критически важно для бесконечного MP3 потока!
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,                      // 200 OK или 206 Partial Content
        headers: responseHeaders,
      });
      
    } catch (error) {
      // =====================================================
      // ОБРАБОТКА ОШИБОК
      // =====================================================
      console.error('[PROXY] Error:', error.message);
      
      // Возвращаем ошибку клиенту
      return new Response(`Proxy Error: ${error.message}`, {
        status: 502,                                          // Bad Gateway
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
  }
};
