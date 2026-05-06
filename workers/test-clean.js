// =====================================================
// ТЕСТЫ ОЧИСТКИ НАЗВАНИЙ ТРЕКОВ
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

  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro'];
  if (musicTerms.includes(lowerWord)) {
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
  }

  if (/^[IVXLCDM]+$/.test(word) && word.length <= 5 && !musicTerms.includes(lowerWord)) {
    return word.toUpperCase();
  }

  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

// =====================================================
// ОЧИСТКА
// =====================================================

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

function isTechnicalGarbage(part) {
  if (!part) return true;
  const p = part.trim();
  
  if (/^\d{1,2}[ABab]$/i.test(p)) return true;
  if (/^Energy\s*\d{1,2}$/i.test(p)) return true;
  if (/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i.test(p)) return true;
  if (/^\d{3}$/.test(p) && parseInt(p) >= 100 && parseInt(p) <= 200) return true;
  if (/^\d{7,}$/.test(p)) return true;
  if (/^www\.|^https?:\/\//i.test(p)) return true;
  if (/^\[[^\]]*\.[^\]]*\]$/.test(p)) return true;
  if (/^\([^)]*\.[^)]*\)$/.test(p)) return true;
  if (/^vk\.com\//i.test(p)) return true;
  
  return false;
}

/**
 * Защищает дефисы внутри скобок от превращения в разделители
 */
function protectHyphensInBrackets(text) {
  let result = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if ((char === '-' || char === '–' || char === '—') && depth > 0) {
      result += '\x00HYPHEN\x00';
      continue;
    }
    result += char;
  }
  return result;
}

function restoreHyphensInBrackets(text) {
  return text.replace(/\x00HYPHEN\x00/g, '-');
}

/**
 * Удаляет дубликаты артистов
 */
function removeDuplicateArtists(parts) {
  if (parts.length < 2) return parts;
  
  const result = [];
  let i = 0;
  
  while (i < parts.length) {
    const current = parts[i];
    const next = parts[i + 1];
    
    if (next && next.toLowerCase().startsWith(current.toLowerCase())) {
      result.push(next);
      i += 2;
    } else if (next && current.toLowerCase().startsWith(next.toLowerCase())) {
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

  // 0. Заменяем underscores на пробелы
  title = title.replace(/_/g, ' ');

  // 1. Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // 2. Удаляем расширения файлов
  title = title.replace(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i, '');

  // 3. Удаляем URL
  title = title.replace(/\s*www\.[^\s]+/gi, '');
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '');

  // 4. Удаляем теги в квадратных скобках
  title = title.replace(/\s*\[[^\]]*\]/g, '');

  // 5. Удаляем URL внутри круглых скобок
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');
  
  // 6. Удаляем vk.com внутри скобок
  title = title.replace(/\s*\([^)]*vk\.com[^)]*\)/gi, '');

  // 7. Удаляем watermark (WCM)
  title = title.replace(/\s*\(WCM\)/gi, '');

  // 8. Удаляем технический мусор в скобках в конце (ДО защиты дефисов!)
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  // Варианты без закрывающей скобки
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*$/i, '');
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '');

  // 9. Удаляем год в скобках в конце
  title = title.replace(/\s*\(\d{4}\)\s*$/g, '');
  
  // 10. Удаляем просто год в конце
  title = title.replace(/\s+\d{4}\s*$/g, '');

  // 11. Защищаем дефисы внутри скобок
  title = protectHyphensInBrackets(title);

  // 12. Нормализуем разделители
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // 13. Восстанавливаем дефисы в скобках
  title = restoreHyphensInBrackets(title);

  // 14. Убираем множественные пробелы
  title = title.replace(/\s+/g, ' ').trim();

  // 15. Разбиваем на части
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p);

  // 16. Удаляем технический мусор
  parts = parts.filter(p => !isTechnicalGarbage(p));

  // 17. Очищаем каждую часть
  parts = parts.map(p => cleanPart(p)).filter(p => p);

  // 18. Удаляем дубликаты артистов
  parts = removeDuplicateArtists(parts);

  if (parts.length === 0) return returnNull ? null : 'DJ GooD OFF FM';
  if (parts.length === 1) return toTitleCase(parts[0]);

  const mixPattern = /\((Original|Extended|Radio|Club|Remix|Mix|Edit|Version|Dub|Instrumental|Acoustic|Live|Remastered)/i;
  
  const firstHasMix = mixPattern.test(parts[0]);
  const lastHasMix = mixPattern.test(parts[parts.length - 1]);

  let artist, trackTitle;

  if (firstHasMix && !lastHasMix) {
    artist = parts[parts.length - 1];
    trackTitle = parts.slice(0, -1).join(' - ');
  } else if (!firstHasMix && lastHasMix) {
    artist = parts[0];
    trackTitle = parts.slice(1).join(' - ');
  } else {
    artist = parts[0];
    trackTitle = parts.slice(1).join(' - ');
  }

  artist = artist.replace(/\s+/g, ' ').trim();
  trackTitle = trackTitle.replace(/\s+/g, ' ').trim();

  if (!artist || !trackTitle) {
    return toTitleCase(parts.join(' - '));
  }

  return `${toTitleCase(artist)} - ${toTitleCase(trackTitle)}`;
}

// =====================================================
// ТЕСТЫ
// =====================================================

console.log('='.repeat(70));
console.log('ТЕСТЫ ОЧИСТКИ НАЗВАНИЙ ТРЕКОВ');
console.log('='.repeat(70));

const tests = [
  // ОСНОВНОЙ ТЕСТ от пользователя
  {
    name: 'Ayo Technology - основной тест',
    input: '11A - Energy 7 - 50 Cent - 50 Cent feat. Justin Timberlake - Ayo Technology (Max-Wave & Jan Steen Remix) (v - 11A - 125.mp3',
    expected: '50 Cent Feat. Justin Timberlake - Ayo Technology (Max-wave & Jan Steen Remix)'
  },
  
  // Underscores
  {
    name: 'Underscore в названии',
    input: 'Artist_Name_-_Track_Title_(Remix)',
    expected: 'Artist Name - Track Title (Remix)'
  },
  
  // Camelot + Energy в начале
  {
    name: 'Camelot + Energy в начале artist',
    input: '11A - Energy 7 - 50 Cent - In Da Club',
    expected: '50 Cent - In Da Club'
  },
  
  // Технический мусор в скобках
  {
    name: 'Технический мусор (v - 11A - 125)',
    input: 'Artist - Track (Remix) (v - 11A - 125)',
    expected: 'Artist - Track (Remix)'
  },
  
  {
    name: 'Технический мусор (- 11A - 125)',
    input: 'Artist - Track (Remix) (- 11A - 125)',
    expected: 'Artist - Track (Remix)'
  },
  
  {
    name: 'Технический мусор (v - 125)',
    input: 'Artist - Track (v - 125)',
    expected: 'Artist - Track'
  },
  
  // Расширения файлов
  {
    name: 'Удаление .mp3',
    input: 'Artist - Track Name.mp3',
    expected: 'Artist - Track Name'
  },
  
  {
    name: 'Удаление .flac',
    input: 'Artist - Track Name (Remix).flac',
    expected: 'Artist - Track Name (Remix)'
  },
  
  // Watermarks
  {
    name: 'Watermark (WCM)',
    input: 'Artist - Track Name (WCM)',
    expected: 'Artist - Track Name'
  },
  
  // Квадратные скобки
  {
    name: 'Тег [by DragoN_Sky]',
    input: 'Artist - Track Name [by DragoN_Sky]',
    expected: 'Artist - Track Name'
  },
  
  {
    name: 'Тег [vk.com/bassplace]',
    input: 'Artist - Track Name (Remix) [vk.com/bassplace]',
    expected: 'Artist - Track Name (Remix)'
  },
  
  // URL
  {
    name: 'URL в названии',
    input: 'Artist - Track Name www.livingelectro.com',
    expected: 'Artist - Track Name'
  },
  
  // Год
  {
    name: 'Год в скобках',
    input: 'Artist - Track Name (2020)',
    expected: 'Artist - Track Name'
  },
  
  // Комбинированный тест
  {
    name: 'Комбо: мусор в начале и конце',
    input: '9A - Energy 6 - Some Artist - Track (Original Mix) (v - 9A - 128).mp3',
    expected: 'Some Artist - Track (Original Mix)'
  },
  
  // Ещё один с underscore
  {
    name: 'Множественные underscores',
    input: 'Best_Artist_-_Cool_Track_(Extended_Mix)_www.site.com.mp3',
    expected: 'Best Artist - Cool Track (Extended Mix)'
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test, i) => {
  const result = cleanTrackTitle(test.input);
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`\n${i + 1}. ${test.name}`);
  console.log(`   Вход:      ${test.input}`);
  console.log(`   Ожидается: ${test.expected}`);
  console.log(`   Результат: ${result}`);
  console.log(`   ${status}`);
});

console.log('\n' + '='.repeat(70));
console.log(`ИТОГО: ${passed} пройдено, ${failed} провалено`);
console.log('='.repeat(70));
