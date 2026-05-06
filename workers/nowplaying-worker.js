// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Получение текущего трека из AzuraCast API
// =====================================================

const AZURACAST_API = 'https://stream.volfrings.ru/api/nowplaying/djgoodofffm';

// =====================================================
// TITLE CASE ФОРМАТИРОВАНИЕ
// =====================================================
const LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'vs', 'vs.',
  'feat', 'feat.', 'ft', 'ft.', 'x', '&'
]);

function toTitleCase(text) {
  if (!text) return text;
  return formatTitle(text);
}

function formatTitle(text) {
  const parts = text.split(' - ');
  return parts.map((part, i) => formatPart(part, i === 0)).join(' - ');
}

function formatPart(text, isFirstPart) {
  let result = '', i = 0, wordStart = 0;
  while (i <= text.length) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0);
      result += char;
      wordStart = i + 1;
      isFirstPart = true;
    } else if (char === ')' || char === ']' || char === '}') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), false);
      result += char;
      wordStart = i + 1;
    } else if (char === ' ') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0);
      result += char;
      wordStart = i + 1;
      isFirstPart = false;
    } else if (i === text.length && i > wordStart) {
      result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0);
    }
    i++;
  }
  return result;
}

function formatWord(word, isFirstWord) {
  if (!word) return word;
  const lowerWord = word.toLowerCase();
  if (/^[ivxlcdm]+$/i.test(word) && word.length <= 5) return word.toUpperCase();
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();
  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

// =====================================================
// ОЧИСТКА НАЗВАНИЯ ТРЕКА
// =====================================================
function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';
  let title = text.trim();

  // Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // Удаляем голые URL (www.site.com, https://site.com) без скобок
  title = title.replace(/\s*www\.[^\s]+/gi, '');
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '');

  // Удаляем URL в скобках с точками
  title = title.replace(/\s*\[[^\]]*\.[^\]]*\]/g, '');
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');

  // Удаляем год в конце
  title = title.replace(/\s*\(?\d{4}\)?\s*$/g, '');

  // Нормализуем разделители
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // Разбиваем на части по " - "
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p);

  // Удаляем Camelot keys (1A-12A, 1B-12B) как отдельные части
  parts = parts.filter(p => !/^\d{1,2}[ABab]$/i.test(p));

  // Удаляем Energy levels (Energy 1-11) как отдельные части
  parts = parts.filter(p => !/^Energy\s*\d{1,2}$/i.test(p));

  // Если частей 0 - возвращаем дефолт
  if (parts.length === 0) return returnNull ? null : 'DJ GooD OFF FM';

  // Если 1 часть - это и есть название
  if (parts.length === 1) {
    return toTitleCase(parts[0]);
  }

  // Если 2+ частей - определяем порядок
  // Обычно формат: "Title (Mix) - Artist" или "Artist - Title (Mix)"
  // Проверяем: если в первой части есть скобки с Mix/Remix/Edit - это Title
  // Если в последней части есть скобки с Mix/Remix/Edit - это Title
  
  const mixPattern = /\((Original|Extended|Radio|Club|Remix|Mix|Edit|Version|Dub|Instrumental|Acoustic|Live|Remastered)/i;
  
  const firstHasMix = mixPattern.test(parts[0]);
  const lastHasMix = mixPattern.test(parts[parts.length - 1]);

  let artist, trackTitle;

  if (firstHasMix && !lastHasMix) {
    // Формат: "Title (Mix) - Artist"
    artist = parts[parts.length - 1];
    trackTitle = parts.slice(0, -1).join(' - ');
  } else if (!firstHasMix && lastHasMix) {
    // Формат: "Artist - Title (Mix)"
    artist = parts[0];
    trackTitle = parts.slice(1).join(' - ');
  } else {
    // Неясно - берём первую часть как артиста (стандартный формат)
    artist = parts[0];
    trackTitle = parts.slice(1).join(' - ');
  }

  // Убираем лишние пробелы
  artist = artist.replace(/\s+/g, ' ').trim();
  trackTitle = trackTitle.replace(/\s+/g, ' ').trim();

  if (!artist || !trackTitle) {
    return toTitleCase(parts.join(' - '));
  }

  // Форматируем и собираем
  return `${toTitleCase(artist)} - ${toTitleCase(trackTitle)}`;
}

// =====================================================
// ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
// =====================================================
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

    try {
      const response = await fetch(AZURACAST_API, {
        headers: { 'User-Agent': 'DJGooDOFF-FM-NowPlaying/1.0' }
      });
      if (!response.ok) throw new Error(`AzuraCast API error: ${response.status}`);

      const data = await response.json();
      const nowPlaying = data.now_playing || {};
      const song = nowPlaying.song || {};
      const station = data.station || {};

      const rawText = song.text || '';
      const cleanText = cleanTrackTitle(rawText);

      let cleanArtist = '', cleanTitle = cleanText;
      const parts = cleanText.split(' - ');
      if (parts.length >= 2) {
        cleanArtist = parts[0].trim();
        cleanTitle = parts.slice(1).join(' - ').trim();
      }

      return new Response(JSON.stringify({
        title: cleanText,
        artist: cleanArtist,
        track: cleanTitle,
        listeners: data.listeners?.total || 0,
        online: data.is_online || false,
        station: station.name || 'DJ GooD OFF FM',
        art: song.art || null,
        duration: nowPlaying.duration || 0,
        elapsed: nowPlaying.elapsed || 0
      }), { headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({
        title: 'DJ GooD OFF FM', artist: '', listeners: 0, online: false, error: error.message
      }), { status: 200, headers: corsHeaders });
    }
  }
};
