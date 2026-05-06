// =====================================================
// CLOUDFLARE WORKER: NOW PLAYING
// Получение текущего трека из AzuraCast API
// =====================================================

const AZURACAST_API = 'https://stream.volfrings.ru/api/nowplaying/djgoodofffm';

// =====================================================
// TITLE CASE ФОРМАТИРОВАНИЕ
// =====================================================
// Слова, которые остаются строчными (предлоги, союзы)
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
      isFirstPart = true; // Внутри скобок первое слово тоже с заглавной
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

  // Римские цифры
  if (/^[ivxlcdm]+$/i.test(word) && word.length <= 5) return word.toUpperCase();

  // Аббревиатуры (DJ, MC, TV и т.д.)
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();

  // Слова-исключения (строчные, кроме первого)
  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;

  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

// =====================================================
// УДАЛЕНИЕ ДУБЛИКАТОВ
// =====================================================
function removeDuplicates(text) {
  const parts = text.split(' - ');
  if (parts.length < 2) return text;

  const uniqueParts = [];
  let prevLower = '';

  for (const part of parts) {
    // Убираем текст в скобках для сравнения
    const partWithoutBrackets = part.replace(/\s*[\(\[].*$/, '').toLowerCase().trim();
    
    if (partWithoutBrackets !== prevLower) {
      uniqueParts.push(part);
      prevLower = partWithoutBrackets;
    }
  }
  return uniqueParts.join(' - ');
}

// =====================================================
// ОЧИСТКА НАЗВАНИЯ ТРЕКА
// =====================================================
function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';
  let title = text.trim();

  // Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // Удаляем Camelot keys в начале: "1A - ", "12B - "
  title = title.replace(/^\d{1,2}[ABab]\s*[-–—]\s*/g, '');

  // Удаляем Energy levels в начале: "Energy 8 - ", "Energy 11 - "
  title = title.replace(/^Energy\s*\d{1,2}\s*[-–—]\s*/gi, '');

  // Удаляем Camelot keys в любом месте
  title = title.replace(/\s*\d{1,2}[ABab]\s*[-–—]\s*/g, ' - ');

  // Удаляем Energy levels в любом месте
  title = title.replace(/\s*Energy\s*\d{1,2}(\s*[-–—]\s*)?/gi, '');

  // Удаляем сайты в скобках
  title = title.replace(/\s*\[[^\]]*\.[^\]]*\]/g, '');
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');
  title = title.replace(/\s*\[[^\]]*(www\.|https?:\/\/)[^\]]*\]/gi, '');
  title = title.replace(/\s*\([^)]*(www\.|https?:\/\/)[^)]*\)/gi, '');

  // Удаляем год в конце: " 2019", " (2019)"
  title = title.replace(/\s*\(?\d{4}\)?\s*$/g, '');

  // Удаляем лишние разделители в начале/конце
  title = title.replace(/^[\s\-–—:]+/, '');
  title = title.replace(/[\s\-–—:]+$/, '');

  // Нормализуем разделители
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // Удаляем лишние пробелы
  title = title.replace(/\s+/g, ' ').trim();

  if (!title || title.length < 2) return returnNull ? null : 'DJ GooD OFF FM';

  // Удаляем дублирующиеся части
  title = removeDuplicates(title);

  // Форматируем в Title Case
  return toTitleCase(title);
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
