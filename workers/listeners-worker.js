// =====================================================
// CLOUDFLARE WORKER: LISTENERS TRACKING
// Отслеживание слушателей через D1 Database
// ТОЛЬКО ДЛЯ TELEGRAM ПОЛЬЗОВАТЕЛЕЙ
// =====================================================
// 
// НАЗНАЧЕНИЕ:
// - Регистрация слушателей по уникальному Telegram user ID
// - Heartbeat для поддержания статуса активности
// - Автоудаление неактивных слушателей (TTL)
// - ТОЛЬКО Telegram пользователи (is_telegram = 1)
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: listeners
// - URL: https://listeners.gondurass89.workers.dev
// - D1 Binding: DB -> nowplaying-db
//
// SQL ТАБЛИЦА (выполнить в D1 Console):
// DROP TABLE IF EXISTS listeners;
// CREATE TABLE listeners (
//   user_id INTEGER PRIMARY KEY,
//   first_name TEXT,
//   last_name TEXT,
//   username TEXT,
//   is_admin INTEGER DEFAULT 0,
//   is_telegram INTEGER DEFAULT 0,
//   last_heartbeat INTEGER
// );
//
// ДЛЯ СУЩЕСТВУЮЩЕЙ ТАБЛИЦЫ - добавить колонку:
// ALTER TABLE listeners ADD COLUMN is_telegram INTEGER DEFAULT 0;
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
      'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret',  // Разрешённые заголовки
      'Content-Type': 'application/json',                    // Тип контента
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
    // ОБРАБОТКА POST ЗАПРОСОВ (регистрация/heartbeat/close)
    // =====================================================
    if (request.method === 'POST') {
      try {
        // Парсим тело запроса как JSON
        const data = await request.json();
        
        // Извлекаем данные из запроса
        const { user_id, first_name, last_name, username, action, isAdmin, isTelegram } = data;
        
        // Игнорируем не-Telegram пользователей
        if (!isTelegram) {
          console.log(`[LISTENER] Skip non-Telegram user: user_id=${user_id}`);
          return new Response(
            JSON.stringify({ success: true, total: 0, skipped: true }),
            { headers: corsHeaders }
          );
        }
        
        // Текущее время в миллисекундах (Unix timestamp)
        const now = Date.now();
        
        // =====================================================
        // ОБРАБОТКА ДЕЙСТВИЯ 'open' - новый слушатель
        // =====================================================
        if (action === 'open') {
          console.log(`[LISTENER] Register Telegram user: user_id=${user_id}, name=${first_name}`);
          
          // SQL: Вставляем или обновляем слушателя
          // ON CONFLICT позволяет обновить существующую запись
          await env.DB.prepare(`
            INSERT INTO listeners (user_id, first_name, last_name, username, is_admin, is_telegram, last_heartbeat)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET 
              last_heartbeat = excluded.last_heartbeat,
              first_name = excluded.first_name,
              is_telegram = excluded.is_telegram
          `).bind(
            user_id,                                         // Telegram User ID
            first_name,                                      // Имя пользователя
            last_name || null,                               // Фамилия (опционально)
            username || null,                                // Username (опционально)
            isAdmin ? 1 : 0,                                 // Флаг администратора
            1,                                               // is_telegram = 1 (всегда true для Telegram)
            now                                              // Время последней активности
          ).run();
        }
        // =====================================================
        // ОБРАБОТКА ДЕЙСТВИЯ 'heartbeat' - подтверждение активности
        // =====================================================
        else if (action === 'heartbeat') {
          console.log(`[LISTENER] Heartbeat: user_id=${user_id}`);
          
          // SQL: Обновляем время последней активности
          await env.DB.prepare(`
            UPDATE listeners SET last_heartbeat = ? WHERE user_id = ?
          `).bind(now, user_id).run();
        }
        // =====================================================
        // ОБРАБОТКА ДЕЙСТВИЯ 'close' - слушатель ушёл
        // =====================================================
        else if (action === 'close') {
          console.log(`[LISTENER] Close: user_id=${user_id}`);
          
          // SQL: Удаляем слушателя из базы
          await env.DB.prepare(`DELETE FROM listeners WHERE user_id = ?`).bind(user_id).run();
        }
        
        // =====================================================
        // АВТОУДАЛЕНИЕ НЕАКТИВНЫХ СЛУШАТЕЛЕЙ (TTL = 2 минуты)
        // =====================================================
        // Удаляем всех, у кого нет heartbeat более 2 минут
        const ttlThreshold = now - 120000;                    // 2 минуты назад
        await env.DB.prepare(`
          DELETE FROM listeners WHERE last_heartbeat < ?
        `).bind(ttlThreshold).run();
        
        // =====================================================
        // ПОЛУЧЕНИЕ ОБЩЕГО КОЛИЧЕСТВА TELEGRAM СЛУШАТЕЛЕЙ
        // =====================================================
        const countResult = await env.DB.prepare(`
          SELECT COUNT(*) as total FROM listeners WHERE is_telegram = 1
        `).first();
        
        // Возвращаем успешный ответ с количеством слушателей
        return new Response(
          JSON.stringify({
            success: true,
            total: countResult?.total || 0
          }),
          { headers: corsHeaders }
        );
        
      } catch (error) {
        // =====================================================
        // ОБРАБОТКА ОШИБОК POST
        // =====================================================
        console.error('[LISTENER] POST Error:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }
    }
    
    // =====================================================
    // ОБРАБОТКА GET ЗАПРОСОВ (получение списка слушателей)
    // =====================================================
    if (request.method === 'GET') {
      try {
        const now = Date.now();
        
        // =====================================================
        // АВТОУДАЛЕНИЕ НЕАКТИВНЫХ СЛУШАТЕЛЕЙ
        // =====================================================
        const ttlThreshold = now - 120000;                    // 2 минуты
        await env.DB.prepare(`
          DELETE FROM listeners WHERE last_heartbeat < ?
        `).bind(ttlThreshold).run();
        
        // =====================================================
        // ПОЛУЧЕНИЕ СПИСКА TELEGRAM СЛУШАТЕЛЕЙ
        // =====================================================
        // Возвращаем только Telegram пользователей (is_telegram = 1)
        const listeners = await env.DB.prepare(`
          SELECT user_id, first_name, last_name, username, is_admin, is_telegram FROM listeners WHERE is_telegram = 1
        `).all();
        
        // Вычисляем общее количество
        const total = listeners.results?.length || 0;
        
        // Логируем для отладки
        console.log(`[LISTENER] GET: total=${total} Telegram listeners`);
        
        // Возвращаем результат
        return new Response(
          JSON.stringify({
            total,
            listeners: listeners.results || []
          }),
          { headers: corsHeaders }
        );
        
      } catch (error) {
        // =====================================================
        // ОБРАБОТКА ОШИБОК GET
        // =====================================================
        console.error('[LISTENER] GET Error:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }
    }
    
    // =====================================================
    // НЕПОДДЕРЖИВАЕМЫЙ МЕТОД
    // =====================================================
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }
};
