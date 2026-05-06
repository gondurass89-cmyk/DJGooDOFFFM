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
  let inBrackets = false;
  
  while (i <= text.length) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0);
      result += char;
      wordStart = i + 1;
      inBrackets = true;
    } else if (char === ')' || char === ']' || char === '}') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), true);
      result += char;
      wordStart = i + 1;
      inBrackets = false;
    } else if (char === ' ') {
      if (i > wordStart) {
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

  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro'];
  if (musicTerms.includes(lowerWord)) {
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
  }

  if (/^[IVXLCDM]+$/.test(word) && word.length <= 5 && !musicTerms.includes(lowerWord)) {
    return word.toUpperCase();
  }

  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc', 'vip', 'lp', 'ep'].includes(lowerWord);
  if (isAbbr) return word.toUpperCase();

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord;
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

function cleanArtistName(artist) {
  if (!artist) return '';
  let cleaned = artist.trim();
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '');
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*/i, '');
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s+/i, '');
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/i, '');
  // Удаляем "Energy N" если осталось только это (это мусор, не артист)
  if (/^Energy\s*\d{1,2}$/i.test(cleaned)) {
    cleaned = '';
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function cleanPart(part) {
  if (!part) return '';
  let cleaned = part.trim();
  cleaned = cleaned.replace(/_/g, ' ');
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '');
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i, '');
  cleaned = cleaned.replace(/^\d{7,}_?/g, '');
  cleaned = cleaned.replace(/\s*\(WCM\)/gi, '');
  cleaned = cleaned.replace(/\s*vk\.com\/[^\s]*/gi, '');
  cleaned = cleaned.replace(/\s+\d{4}\s*$/g, '');
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

function cleanTrackTitle(text, returnNull = false) {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM';
  let title = text.trim();

  title = title.replace(/_/g, ' ');
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '');
  title = title.replace(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i, '');
  title = title.replace(/\s*www\.[^\s]+/gi, '');
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '');
  title = title.replace(/\s*\[[^\]]*\]/g, '');
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '');
  title = title.replace(/\s*\([^)]*vk\.com[^)]*\)/gi, '');
  title = title.replace(/\s*\(WCM\)/gi, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '');
  title = title.replace(/\s*\(\d{4}\)\s*$/g, '');
  title = title.replace(/\s+\d{4}\s*$/g, '');
  
  title = protectHyphensInBrackets(title);
  title = title.replace(/\s*[-–—]\s*/g, ' - ');
  title = restoreHyphensInBrackets(title);
  title = title.replace(/\s+/g, ' ').trim();
  
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p);
  parts = parts.filter(p => !isTechnicalGarbage(p));
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
// НОВАЯ ФУНКЦИЯ: Использование отдельных полей artist/title
// =====================================================
function processTrackWithSeparateFields(songArtist, songTitle, songText) {
  let cleanArtist = '';
  let cleanTitle = '';
  
  if (songArtist && songTitle) {
    cleanArtist = cleanArtistName(songArtist);
    cleanTitle = songTitle.trim();
    
    if (!cleanArtist) {
      cleanArtist = toTitleCase(cleanTitle);
      cleanTitle = '';
    }
  }
  
  // Fallback: если отдельные поля пустые, парсим song.text
  if (!cleanArtist && !cleanTitle) {
    const cleanText = cleanTrackTitle(songText || '');
    const parts = cleanText.split(' - ');
    if (parts.length >= 2) {
      cleanArtist = parts[0].trim();
      cleanTitle = parts.slice(1).join(' - ').trim();
    } else {
      cleanArtist = cleanText;
      cleanTitle = '';
    }
  }
  
  cleanArtist = toTitleCase(cleanArtist);
  cleanTitle = toTitleCase(cleanTitle);
  
  return cleanTitle ? `${cleanArtist} - ${cleanTitle}` : cleanArtist;
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

// Тесты с отдельными полями (новая логика!)
const separateFieldsTests = [
  // Реальный случай пользователя
  {
    artist: '4A - Energy 7 - Mechanical Pressure',
    title: 'Red Line (Quadrat Beat Remix)',
    text: '4A - Energy 7 - Mechanical Pressure - Contact Remixed LP - Red Line (Quadrat Beat Remix)',
    expected: 'Mechanical Pressure - Red Line (Quadrat Beat Remix)'
  },
  // Другой случай из API
  {
    artist: '10A - Energy 6',
    title: 'Мумий Тролль - Утекай (DJ ILYA LAVROV remix)',
    text: '10A - Energy 6 - Мумий Тролль - Утекай (DJ ILYA LAVROV remix)',
    expected: 'Мумий Тролль - Утекай (DJ ILYA LAVROV Remix)'
  }
];

console.log('='.repeat(80));
console.log('ТЕСТ ОЧИСТКИ НАЗВАНИЙ ТРЕКОВ');
console.log('='.repeat(80));
console.log();

// Тестируем старый метод (song.text)
console.log('ЧАСТЬ 1: Тестирование cleanTrackTitle (старый метод через song.text)');
console.log('-'.repeat(80));

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
console.log('ЧАСТЬ 2: Тестирование processTrackWithSeparateFields (новый метод)');
console.log('-'.repeat(80));

separateFieldsTests.forEach((test, index) => {
  const result = processTrackWithSeparateFields(test.artist, test.title, test.text);
  const ok = result === test.expected;
  
  if (ok) {
    console.log(`✅ Тест ${index + 1}: PASSED`);
    console.log(`   Artist: "${test.artist}"`);
    console.log(`   Title:  "${test.title}"`);
    console.log(`   Result: "${result}"`);
    passed++;
  } else {
    console.log(`❌ Тест ${index + 1}: FAILED`);
    console.log(`   Artist:    "${test.artist}"`);
    console.log(`   Title:     "${test.title}"`);
    console.log(`   Ожидалось: "${test.expected}"`);
    console.log(`   Получено:  "${result}"`);
    failed++;
  }
});

console.log();
console.log('='.repeat(80));
console.log(`РЕЗУЛЬТАТ: ${passed}/${testCases.length + separateFieldsTests.length} тестов пройдено`);
if (failed > 0) {
  console.log(`❌ ${failed} тестов не пройдено`);
} else {
  console.log('✅ Все тесты пройдены успешно!');
}
console.log('='.repeat(80));
