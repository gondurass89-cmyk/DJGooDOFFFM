// =====================================================
// ТЕСТ ОЧИСТКИ НАЗВАНИЙ ТРЕКОВ
// Запуск: node test-cleaning.js
// =====================================================

// === ТОЧНАЯ КОПИЯ ФУНКЦИЙ ИЗ WORKER'А ===

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

  // Музыкальные термины - ПЕРВЫМИ! (до римских цифр, т.к. "mix" = m+i+x все римские)
  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro'];
  if (musicTerms.includes(lowerWord)) {
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
  }

  // Римские цифры (но не "mix", "dub", "live" и т.д.)
  if (/^[IVXLCDM]+$/.test(word) && word.length <= 5 && !musicTerms.includes(lowerWord)) {
    return word.toUpperCase();
  }

  // Аббревиатуры (DJ, MC, TV и т.д.)
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

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

function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';
  let title = text.trim();

  // 1. Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');

  // 2. Удаляем голые URL (www.site.com, https://site.com)
  title = title.replace(/\s*www\.[^\s]+/gi, '');
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '');

  // 3. Удаляем ЛЮБЫЕ теги в квадратных скобках
  title = title.replace(/\s*\[[^\]]*\]/g, '');

  // 4. Удаляем URL внутри круглых скобок
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');
  
  // 5. Удаляем vk.com/... внутри круглых скобок
  title = title.replace(/\s*\([^)]*vk\.com[^)]*\)/gi, '');

  // 6. Удаляем watermark (WCM)
  title = title.replace(/\s*\(WCM\)/gi, '');

  // 7. Удаляем год в скобках в конце
  title = title.replace(/\s*\(\d{4}\)\s*$/g, '');
  
  // 8. Удаляем просто год в конце
  title = title.replace(/\s+\d{4}\s*$/g, '');

  // 9. Нормализуем разделители
  title = title.replace(/\s*[-–—]\s*/g, ' - ');

  // 10. Убираем множественные пробелы
  title = title.replace(/\s+/g, ' ').trim();

  // 11. Разбиваем на части по " - "
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p);

  // 12. Удаляем технический мусор из списка частей
  parts = parts.filter(p => !isTechnicalGarbage(p));

  // 13. Очищаем каждую часть от встроенного мусора
  parts = parts.map(p => cleanPart(p)).filter(p => p);

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

  if (!artist || !trackTitle) return toTitleCase(parts.join(' - '));
  return `${toTitleCase(artist)} - ${toTitleCase(trackTitle)}`;
}

// =====================================================
// ТЕСТОВЫЕ ПРИМЕРЫ
// =====================================================
const testCases = [
  // БАЗОВЫЕ: без мусора
  ['Bassjackers - Ape Szn (Extended Mix)', 'Bassjackers - Ape Szn (Extended Mix)'],
  ['Don Diablo - Eyes Closed (Extended Mix)', 'Don Diablo - Eyes Closed (Extended Mix)'],
  
  // Camelot Key + Energy в Artist
  ['11A - Energy 7 - 50 Cent - Ayo Technology feat. Justin Ti', '50 Cent - Ayo Technology Feat. Justin Ti'],
  
  // Camelot + Energy без Artist
  ['4A - Energy 6 - 219 Boys - Haters (Original Mix)', '219 Boys - Haters (Original Mix)'],
  
  // URL в названии
  ["Aryue & Asox - Don't Talk (Extended Mix) www.livingelectro.com", "Aryue & Asox - Don't Talk (Extended Mix)"],
  
  // Теги в квадратных скобках
  ['Basto - Kung Fu (Extended Mix) [by DragoN_Sky]', 'Basto - Kung Fu (Extended Mix)'],
  ['Britney Spears - Toxic (Rakurs Remix) [vk.com/bassplace]', 'Britney Spears - Toxic (Rakurs Remix)'],
  
  // Watermark (WCM)
  ['Dropeflow - I Like To Move (WCM)', 'Dropeflow - I Like to Move'],
  
  // Год в названии
  ['Alejandro - Farra (Extended Mix) 2020', 'Alejandro - Farra (Extended Mix)'],
  
  // Числовой ID в начале filename
  ['12768025_Resonant_Breakdown_Original_Mix', 'Resonant Breakdown Original Mix'],
  
  // Camelot + Energy в конце
  ['Brohug - Night Rider (Original Mix) - 7A - Energy 7', 'Brohug - Night Rider (Original Mix)'],
  
  // Camelot + Energy + BPM
  ['Digital Koala - Grizzly - 7A - 128', 'Digital Koala - Grizzly'],
  
  // Artist содержит Camelot + Energy
  ['9A - Energy 6 - Komka, Nina Mess - Resonant Breakdown (Original Mix)', 'Komka, Nina Mess - Resonant Breakdown (Original Mix)'],
  
  // Пустой/мусорный Artist
  ['4A - Energy 7 - Abrox - Night', 'Abrox - Night'],
];

console.log('='.repeat(80));
console.log('ТЕСТ ОЧИСТКИ НАЗВАНИЙ ТРЕКОВ');
console.log('='.repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach(([input, expected], index) => {
  const result = cleanTrackTitle(input);
  const ok = result === expected;
  
  if (ok) {
    console.log(`✅ Тест ${index + 1}: PASSED`);
    passed++;
  } else {
    console.log(`❌ Тест ${index + 1}: FAILED`);
    console.log(`   Вход:      "${input}"`);
    console.log(`   Ожидалось: "${expected}"`);
    console.log(`   Получено:  "${result}"`);
    failed++;
  }
});

console.log();
console.log('='.repeat(80));
console.log(`РЕЗУЛЬТАТ: ${passed}/${testCases.length} тестов пройдено`);
if (failed > 0) {
  console.log(`❌ ${failed} тестов не пройдено`);
} else {
  console.log('✅ Все тесты пройдены успешно!');
}
console.log('='.repeat(80));
