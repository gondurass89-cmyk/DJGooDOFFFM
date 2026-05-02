// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Хранение названия текущего трека через D1 Database
// =====================================================
// 
// НАЗНАЧЕНИЕ:
// - Приём POST запросов с названием текущего трека от RadioBoss
// - Отдача GET запросов с названием текущего трека
// - Поддержка кириллицы (UTF-8)
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: nowplaying
// - URL: https://nowplaying.gondurass89.workers.dev
// - D1 Binding: DB -> nowplaying-db
//
// SQL ТАБЛИЦА (выполнить в D1 Console):
// CREATE TABLE track (id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT);
// INSERT INTO track (id, title) VALUES (1, 'DJ GooD OFF FM - Загрузка...');
// =====================================================

// =====================================================
// ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
// =====================================================
/**
 * Обрабатывает входящие HTTP запросы
 * @param request - Входящий Request объект
 * @param env - Переменные окружения (bindings), включает DB для D1
 * @param ctx - Контекст выполнения
 * @returns Response объект
 */
export default {
  async fetch(request, env, ctx) {
    
    // =====================================================
    // CORS ЗАГОЛОВКИ (общие для всех ответов)
    // =====================================================
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',                    // Разрешаем с любого источника
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',  // Разрешённые методы
      'Access-Control-Allow-Headers': 'Content-Type',        // Разрешённые заголовки
      'Content-Type': 'text/plain; charset=utf-8',           // UTF-8 для кириллицы!
      'Cache-Control': 'no-store, no-cache, must-revalidate', // Не кешировать
    };
    
    // =====================================================
    // ОБРАБОТКА OPTIONS (CORS preflight)
    // =====================================================
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // =====================================================
    // ОБРАБОТКА POST ЗАПРОСОВ (сохранение трека)
    // =====================================================
    if (request.method === 'POST') {
      try {
        // Читаем тело запроса как plain text
        let track = await request.text();

        // =====================================================
        // НОРМАЛИЗАЦИЯ АПОСТРОФОВ
        // =====================================================
        // Разные источники используют разные символы для апострофа
        // Приводим всё к стандартному ASCII апострофу (U+0027)
        track = track
          .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // ' ' ‚ ‛ -> '
          .replace(/[\u0060\u00B4]/g, "'")               // ` ´ -> '
          .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // " " „ ‟ -> "
          .replace(/\u2026/g, '...')                     // … -> ...
          .replace(/\u2013\u2014/g, '-')                 // – — -> -

        // Логируем для отладки
        console.log('[NOWPLAYING] Received track:', track);

        // =====================================================
        // СОХРАНЕНИЕ В D1 DATABASE
        // =====================================================
        // Обновляем единственную запись с id = 1
        await env.DB.prepare(`
          UPDATE track SET title = ? WHERE id = 1
        `).bind(track).run();
        
        // Возвращаем подтверждение
        return new Response('OK: ' + track, {
          headers: corsHeaders
        });
        
      } catch (error) {
        console.error('[NOWPLAYING] POST Error:', error);
        return new Response('Error: ' + error.message, {
          status: 500,
          headers: corsHeaders
        });
      }
    }
    
    // =====================================================
    // ОБРАБОТКА GET ЗАПРОСОВ (получение трека)
    // =====================================================
    if (request.method === 'GET') {
      try {
        // =====================================================
        // ЧТЕНИЕ ИЗ D1 DATABASE
        // =====================================================
        const result = await env.DB.prepare(`
          SELECT title FROM track WHERE id = 1
        `).first();
        
        // Если запись найдена - возвращаем название трека
        const track = result?.title || 'DJ GooD OFF FM - Загрузка...';
        
        // Логируем для отладки
        console.log('[NOWPLAYING] Returning track:', track);
        
        return new Response(track, {
          headers: corsHeaders
        });
        
      } catch (error) {
        console.error('[NOWPLAYING] GET Error:', error);
        return new Response('DJ GooD OFF FM - Ошибка', {
          status: 500,
          headers: corsHeaders
        });
      }
    }
    
    // =====================================================
    // НЕПОДДЕРЖИВАЕМЫЙ МЕТОД
    // =====================================================
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }
};
