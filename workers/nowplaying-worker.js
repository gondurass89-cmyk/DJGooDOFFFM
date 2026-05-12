// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Получение текущего трека из AzuraCast API
// =====================================================

const AZURACAST_API = 'https://djgoodoff.duckdns.org/api/nowplaying/djgoodofffm';

// =====================================================
// TITLE CASE ФОРМАТИРОВАНИЕ
// =====================================================
const LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'vs', 'vs.', 'x', '&'
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
  let inBrackets = false;  // Отслеживаем, находимся ли внутри скобок
  
  while (i <= text.length) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0);
      result += char;
      wordStart = i + 1;
      inBrackets = true;  // Вошли в скобки
    } else if (char === ')' || char === ']' || char === '}') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), true);  // В скобках - с большой буквы
      result += char;
      wordStart = i + 1;
      inBrackets = false;  // Вышли из скобок
    } else if (char === ' ') {
      if (i > wordStart) {
        // Внутри скобок - каждое слово с большой буквы
        const isStart = inBrackets || (isFirstPart && wordStart === 0);
        result += formatWord(text.slice(wordStart, i), isStart);
      }
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

  // Музыкальные термины - ПЕРВЫМИ! (до римских цифр, т.к. "mix" = m+i+x все римские)
  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro'];
  if (musicTerms.includes(lowerWord)) {
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
  }

  // Римские цифры (но не "mix", "dub", "live" и т.д.)
  if (/^[IVXLCDM]+$/.test(word) && word.length <= 5 && !musicTerms.includes(lowerWord)) {
    return word.toUpperCase();
  }

  // Аббревиатуры (DJ, MC, TV, VIP и т.д.)
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc', 'vip', 'lp', 'ep'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

// =====================================================
// ОЧИСТКА НАЗВАНИЯ ТРЕКА
// Обработка мусора из метатегов MP3 файлов
// =====================================================

/**
 * Очищает artist от технического мусора в начале
 * Например: "4A - Energy 7 - Mechanical Pressure" -> "Mechanical Pressure"
 */
function cleanArtistName(artist) {
  if (!artist) return '';
  let cleaned = artist.trim();
  
  // Удаляем паттерн "11A - Energy 7 - " в начале
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '');
  
  // Удаляем только Camelot key в начале "11A - " или "11A "
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*/i, '');
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s+/i, '');
  
  // Удаляем "Energy N - " в начале
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/i, '');
  
  // Удаляем "Energy N" если осталось только это (это мусор, не артист)
  if (/^Energy\s*\d{1,2}$/i.test(cleaned)) {
    cleaned = '';
  }
  
  // Убираем множественные пробелы
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Удаляет мусор из отдельной части (artist или title)
 */
function cleanPart(part) {
  if (!part) return '';
  let cleaned = part.trim();
  
  // Заменяем underscores на пробелы
  cleaned = cleaned.replace(/_/g, ' ');
  
  // Удаляем паттерн "11A - Energy 7 - Artist" в начале части -> оставляем только Artist
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '');
  
  // Удаляем только "11A - Energy 7" (если часть заканчивается этим)
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i, '');
  
  // Удаляем числовой ID в начале (типа 12768025_)
  cleaned = cleaned.replace(/^\d{7,}_?/g, '');
  
  // Удаляем watermark (WCM)
  cleaned = cleaned.replace(/\s*\(WCM\)/gi, '');
  
  // Удаляем vk.com/bassplace и подобные внутри названия
  cleaned = cleaned.replace(/\s*vk\.com\/[^\s]*/gi, '');
  
  // Удаляем год в конце части
  cleaned = cleaned.replace(/\s+\d{4}\s*$/g, '');
  
  // Убираем множественные пробелы
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Проверяет, является ли часть техническим мусором
 */
function isTechnicalGarbage(part) {
  if (!part) return true;
  const p = part.trim();
  
  // Camelot key (1A-12A, 1B-12B)
  if (/^\d{1,2}[ABab]$/i.test(p)) return true;
  
  // Energy level (Energy 1-11)
  if (/^Energy\s*\d{1,2}$/i.test(p)) return true;
  
  // Только Camelot + Energy (11A - Energy 7)
  if (/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i.test(p)) return true;
  
  // BPM (100-200 - типичные значения)
  if (/^\d{3}$/.test(p) && parseInt(p) >= 100 && parseInt(p) <= 200) return true;
  
  // Числовой мусор (7+ цифр)
  if (/^\d{7,}$/.test(p)) return true;
  
  // URL
  if (/^www\.|^https?:\/\//i.test(p)) return true;
  
  // URL в квадратных скобках
  if (/^\[[^\]]*\.[^\]]*\]$/.test(p)) return true;
  
  // URL в круглых скобках
  if (/^\([^)]*\.[^)]*\)$/.test(p)) return true;
  
  // vk.com/bassplace
  if (/^vk\.com\//i.test(p)) return true;
  
  return false;
}

/**
 * Защищает дефисы внутри скобок от превращения в разделители
 * Заменяет их на временный маркер, который потом восстановим
 */
function protectHyphensInBrackets(text) {
  let result = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if ((char === '-' || char === '–' || char === '—') && depth > 0) {
      result += '\x00HYPHEN\x00'; // Временный маркер
      continue;
    }
    result += char;
  }
  return result;
}

/**
 * Восстанавливает дефисы после обработки
 */
function restoreHyphensInBrackets(text) {
  return text.replace(/\x00HYPHEN\x00/g, '-');
}

/**
 * Удаляет дубликаты артистов (если одна часть содержится в начале другой)
 * Например: ["50 Cent", "50 Cent Feat. Justin Timberlake"] -> ["50 Cent Feat. Justin Timberlake"]
 */
function removeDuplicateArtists(parts) {
  if (parts.length < 2) return parts;
  
  const result = [];
  let i = 0;
  
  while (i < parts.length) {
    const current = parts[i];
    const next = parts[i + 1];
    
    // Если следующая часть существует и текущая содержится в начале следующей
    if (next && next.toLowerCase().startsWith(current.toLowerCase())) {
      // Пропускаем текущую, берём следующую (более полную)
      result.push(next);
      i += 2;
    } else if (next && current.toLowerCase().startsWith(next.toLowerCase())) {
      // Текущая более полная, берём её, пропускаем следующую
      result.push(current);
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }
  
  return result;
}

function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';
  let title = text.trim();

  // 0. Заменяем underscores на пробелы (ДО всех остальных операций!)
  title = title.replace(/_/g, ' ');

  // 1. Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // 2. Удаляем расширения файлов (.mp3, .wav, .flac и т.д.)
  title = title.replace(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i, '');

  // 3. Удаляем голые URL (www.site.com, https://site.com)
  title = title.replace(/\s*www\.[^\s]+/gi, '');
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '');

  // 4. Удаляем ЛЮБЫЕ теги в квадратных скобках (включая [by DragoN_Sky], [vk.com/bassplace])
  title = title.replace(/\s*\[[^\]]*\]/g, '');

  // 5. Удаляем URL внутри круглых скобок (но сохраняем нормальные скобки типа "Extended Mix")
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');
  
  // 6. Удаляем vk.com/... внутри круглых скобок
  title = title.replace(/\s*\([^)]*vk\.com[^)]*\)/gi, '');

  // 7. Удаляем watermark (WCM)
  title = title.replace(/\s*\(WCM\)/gi, '');

  // 8. Удаляем технический мусор в скобках в конце (ДО защиты дефисов!)
  // Паттерны: (v - 11A - 125), (- 11A - 125), (v - 128), (- 128), (11A - 125), и т.д.
  // Также без закрывающей скобки если данные пришли криво
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  // Варианты без закрывающей скобки (когда .mp3 был в конце)
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');

  // 9. Удаляем год в скобках в конце: "(2020)" или "(2021)"
  title = title.replace(/\s*\(\d{4}\)\s*$/g, '');
  
  // 10. Удаляем просто год в конце (без скобок) - 4 цифры
  title = title.replace(/\s+\d{4}\s*$/g, '');

  // 11. Защищаем дефисы внутри скобок ПЕРЕД нормализацией разделителей
  title = protectHyphensInBrackets(title);

  // 12. Нормализуем разделители (разные типы тире -> стандартное)
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // 13. Восстанавливаем дефисы в скобках
  title = restoreHyphensInBrackets(title);

  // 14. Убираем множественные пробелы
  title = title.replace(/\s+/g, ' ').trim();

  // 15. Разбиваем на части по " - "
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p);

  // 16. Удаляем технический мусор из списка частей
  parts = parts.filter(p => !isTechnicalGarbage(p));

  // 17. Очищаем каждую часть от встроенного мусора
  parts = parts.map(p => cleanPart(p)).filter(p => p);

  // 18. Удаляем дубликаты артистов
  parts = removeDuplicateArtists(parts);

  // Если частей 0 - возвращаем дефолт
  if (parts.length === 0) return returnNull ? null : 'DJ GooD OFF FM';

  // Если 1 часть - это и есть название
  if (parts.length === 1) {
    return toTitleCase(parts[0]);
  }

  // Если 2+ частей - определяем порядок
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
    // Стандартный формат: "Artist - Title"
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

      // ИСПОЛЬЗУЕМ ОТДЕЛЬНЫЕ ПОЛЯ ARTIST И TITLE (более точные!)
      // AzuraCast правильно разделяет artist и title, в отличие от text который может содержать альбом
      let cleanArtist = '';
      let cleanTitle = '';
      
      if (song.artist && song.title) {
        // Очищаем artist от Camelot key и Energy в начале
        cleanArtist = cleanArtistName(song.artist);
        // Title обычно чистый, но применяем Title Case
        cleanTitle = song.title.trim();
        
        // Если после очистки artist пустой, используем title как есть
        if (!cleanArtist) {
          cleanArtist = toTitleCase(cleanTitle);
          cleanTitle = '';
        }
      }
      
      // Fallback: если отдельные поля пустые, парсим song.text
      if (!cleanArtist && !cleanTitle) {
        const rawText = song.text || '';
        const cleanText = cleanTrackTitle(rawText);
        const parts = cleanText.split(' - ');
        if (parts.length >= 2) {
          cleanArtist = parts[0].trim();
          cleanTitle = parts.slice(1).join(' - ').trim();
        } else {
          cleanArtist = cleanText;
          cleanTitle = '';
        }
      }
      
      // Форматируем в Title Case
      cleanArtist = toTitleCase(cleanArtist);
      cleanTitle = toTitleCase(cleanTitle);
      
      // Итоговая строка
      const cleanText = cleanTitle ? `${cleanArtist} - ${cleanTitle}` : cleanArtist;

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
