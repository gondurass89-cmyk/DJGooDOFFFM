// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Получение текущего трека из AzuraCast API
// =====================================================
//
// НАЗНАЧЕНИЕ:
// - Получает название текущего трека из AzuraCast API
// - Очищает техническую информацию (Camelot keys, Energy)
// - Отдаёт чистое название для отображения в приложении
//
// РАЗМЕЩЕНИЕ:
// - Cloudflare Dashboard -> Workers -> Create Worker
// - Имя: nowplaying
// - URL: https://nowplaying.gondurass89.workers.dev
// =====================================================

// AzuraCast API endpoint
const AZURACAST_API = 'https://stream.volfrings.ru/api/nowplaying/djgoodofffm';

// =====================================================
// ОЧИСТКА НАЗВАНИЯ ТРЕКА
// =====================================================
function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';

  let title = text.trim();

  // Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // Удаляем Camelot keys в начале (1A-12A, 1B-12B)
  title = title.replace(/^\d{1,2}[AB]\s*[-–—]\s*/i, '');

  // Удаляем Energy levels (Energy 1-11)
  title = title.replace(/Energy\s*\d{1,2}\s*[-–—]\s*/gi, '');

  // Удаляем Camelot keys в любом месте
  title = title.replace(/\d{1,2}[AB]\s*[-–—]\s*/gi, '');

  // Удаляем Energy levels в любом месте
  title = title.replace(/\s*Energy\s*\d{1,2}/gi, '');

  // Удаляем лишние разделители в начале
  title = title.replace(/^[\s\-–—:]+/, '');

  // Удаляем дублирующиеся разделители
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // =====================================================
  // УДАЛЯЕМ САЙТЫ И URL
  // =====================================================
  // Сайты в квадратных скобках: [4clubbers.com.pl], [www.site.com]
  title = title.replace(/\s*\[[^\]]*\.(com|ru|net|org|io|me|pro|dj|fm|radio|pl|de|uk|fr|es|it|nl|be|cz|hu|ro|bg|ua|by|kz|info|biz|co|tv)[^\]]*\]/gi, '');
  
  // Сайты в круглых скобках: (www.site.com), (site.ru)
  title = title.replace(/\s*\([^)]*\.(com|ru|net|org|io|me|pro|dj|fm|radio|pl|de|uk|fr|es|it|nl|be|cz|hu|ro|bg|ua|by|kz|info|biz|co|tv)[^)]*\)/gi, '');
  
  // Любые оставшиеся квадратные скобки с www или http
  title = title.replace(/\s*\[[^\]]*(www\.|https?:\/\/)[^\]]*\]/gi, '');
  
  // Любые оставшиеся круглые скобки с www или http
  title = title.replace(/\s*\([^)]*(www\.|https?:\/\/)[^)]*\)/gi, '');

  // Удаляем лишние пробелы
  title = title.replace(/\s+/g, ' ').trim();

  // Если после очистки пусто
  if (!title || title.length < 2) {
    return returnNull ? null : 'DJ GooD OFF FM';
  }

  return title;
}

// =====================================================
// ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
// =====================================================
export default {
  async fetch(request, env, ctx) {

    // CORS заголовки
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Только GET
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      // Запрос к AzuraCast API
      const response = await fetch(AZURACAST_API, {
        headers: {
          'User-Agent': 'DJGooDOFF-FM-NowPlaying/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`AzuraCast API error: ${response.status}`);
      }

      const data = await response.json();

      // Извлекаем информацию о треке
      const nowPlaying = data.now_playing || {};
      const song = nowPlaying.song || {};
      const station = data.station || {};

      // Получаем сырой текст трека (полная строка "Camelot - Energy - Artist - Title")
      const rawText = song.text || '';
      
      // Очищаем полное название от технической информации
      const cleanText = cleanTrackTitle(rawText);
      
      // Парсим Artist - Title из очищенной строки
      let cleanArtist = '';
      let cleanTitle = cleanText;
      
      const parts = cleanText.split(' - ');
      if (parts.length >= 2) {
        cleanArtist = parts[0].trim();
        cleanTitle = parts.slice(1).join(' - ').trim();
      }

      // Формируем ответ
      const result = {
        title: cleanText,           // Полное название "Artist - Title"
        artist: cleanArtist,         // Только артист
        track: cleanTitle,           // Только название трека
        listeners: data.listeners?.total || 0,
        online: data.is_online || false,
        station: station.name || 'DJ GooD OFF FM',
        art: song.art || null,
        duration: nowPlaying.duration || 0,
        elapsed: nowPlaying.elapsed || 0
      };

      console.log('[NOWPLAYING] Track:', cleanTitle, '| Listeners:', result.listeners);

      return new Response(JSON.stringify(result), {
        headers: corsHeaders
      });

    } catch (error) {
      console.error('[NOWPLAYING] Error:', error.message);

      return new Response(JSON.stringify({
        title: 'DJ GooD OFF FM',
        artist: '',
        listeners: 0,
        online: false,
        error: error.message
      }), {
        status: 200, // Возвращаем 200 чтобы не ломать клиент
        headers: corsHeaders
      });
    }
  }
};
