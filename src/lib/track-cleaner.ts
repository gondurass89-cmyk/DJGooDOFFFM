// =====================================================
// Очистка названий треков от технического мусора
// Перенесено из nowplaying-worker.js (Cloudflare Worker)
// =====================================================

// Слова, которые остаются с маленькой буквы (кроме первого слова)
const LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'vs', 'vs.', 'x', '&'
])

// =====================================================
// TITLE CASE ФОРМАТИРОВАНИЕ
// =====================================================

export function toTitleCase(text: string): string {
  if (!text) return text
  return formatTitle(text)
}

function formatTitle(text: string): string {
  const parts = text.split(' - ')
  return parts.map((part, i) => formatPart(part, i === 0)).join(' - ')
}

function formatPart(text: string, isFirstPart: boolean): string {
  let result = ''
  let i = 0
  let wordStart = 0
  let inBrackets = false

  while (i <= text.length) {
    const char = text[i]
    if (char === '(' || char === '[' || char === '{') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0)
      result += char
      wordStart = i + 1
      inBrackets = true
    } else if (char === ')' || char === ']' || char === '}') {
      if (i > wordStart) result += formatWord(text.slice(wordStart, i), true)
      result += char
      wordStart = i + 1
      inBrackets = false
    } else if (char === ' ') {
      if (i > wordStart) {
        const isStart = inBrackets || (isFirstPart && wordStart === 0)
        result += formatWord(text.slice(wordStart, i), isStart)
      }
      result += char
      wordStart = i + 1
      isFirstPart = false
    } else if (i === text.length && i > wordStart) {
      result += formatWord(text.slice(wordStart, i), isFirstPart && wordStart === 0)
    }
    i++
  }
  return result
}

function formatWord(word: string, isFirstWord: boolean): string {
  if (!word) return word
  const lowerWord = word.toLowerCase()

  // Музыкальные термины — первыми! (до римских цифр)
  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro']
  if (musicTerms.includes(lowerWord)) {
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1)
  }

  // Римские цифры
  if (/^[IVXLCDM]+$/.test(word) && word.length <= 5 && !musicTerms.includes(lowerWord)) {
    return word.toUpperCase()
  }

  // Аббревиатуры
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc', 'vip', 'lp', 'ep'].includes(lowerWord)
  if (isAbbr) return word.toUpperCase()

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) return lowerWord
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1)
}

// =====================================================
// ОЧИСТКА ИСПОЛНИТЕЛЯ
// =====================================================

/**
 * Очищает artist от технического мусора в начале
 * Например: "4A - Energy 7 - Mechanical Pressure" -> "Mechanical Pressure"
 */
export function cleanArtistName(artist: string): string {
  if (!artist) return ''
  let cleaned = artist.trim()

  // Удаляем паттерн "11A - Energy 7 - " в начале
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '')

  // Удаляем только Camelot key в начале
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*/i, '')
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s+/i, '')

  // Удаляем "Energy N - " в начале
  cleaned = cleaned.replace(/^Energy\s*\d{1,2}\s*-\s*/i, '')

  // Удаляем "Energy N" если осталось только это
  if (/^Energy\s*\d{1,2}$/i.test(cleaned)) {
    cleaned = ''
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

// =====================================================
// ОЧИСТКА ЧАСТИ НАЗВАНИЯ
// =====================================================

function cleanPart(part: string): string {
  if (!part) return ''
  let cleaned = part.trim()

  cleaned = cleaned.replace(/_/g, ' ')
  cleaned = cleaned.replace(/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}\s*-\s*/i, '')
  cleaned = cleaned.replace(/\s*-\s*\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i, '')
  cleaned = cleaned.replace(/^\d{7,}_?/g, '')
  cleaned = cleaned.replace(/\s*\(WCM\)/gi, '')
  cleaned = cleaned.replace(/\s*vk\.com\/[^\s]*/gi, '')
  cleaned = cleaned.replace(/\s+\d{4}\s*$/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

// =====================================================
// ОПРЕДЕЛЕНИЕ ТЕХНИЧЕСКОГО МУСОРА
// =====================================================

function isTechnicalGarbage(part: string): boolean {
  if (!part) return true
  const p = part.trim()

  if (/^\d{1,2}[ABab]$/i.test(p)) return true
  if (/^Energy\s*\d{1,2}$/i.test(p)) return true
  if (/^\d{1,2}[ABab]\s*-\s*Energy\s*\d{1,2}$/i.test(p)) return true
  if (/^\d{3}$/.test(p) && parseInt(p) >= 100 && parseInt(p) <= 200) return true
  if (/^\d{7,}$/.test(p)) return true
  if (/^www\.|^https?:\/\//i.test(p)) return true
  if (/^\[[^\]]*\.[^\]]*\]$/.test(p)) return true
  if (/^\([^)]*\.[^)]*\)$/.test(p)) return true
  if (/^vk\.com\//i.test(p)) return true

  return false
}

// =====================================================
// ЗАЩИТА ДЕФИСОВ В СКОБКАХ
// =====================================================

function protectHyphensInBrackets(text: string): string {
  let result = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if ((char === '-' || char === '\u2013' || char === '\u2014') && depth > 0) {
      result += '\x00HYPHEN\x00'
      continue
    }
    result += char
  }
  return result
}

function restoreHyphensInBrackets(text: string): string {
  return text.replace(/\x00HYPHEN\x00/g, '-')
}

// =====================================================
// УДАЛЕНИЕ ДУБЛИКАТОВ АРТИСТОВ
// =====================================================

function removeDuplicateArtists(parts: string[]): string[] {
  if (parts.length < 2) return parts

  const result: string[] = []
  let i = 0

  while (i < parts.length) {
    const current = parts[i]
    const next = parts[i + 1]

    if (next && next.toLowerCase().startsWith(current.toLowerCase())) {
      result.push(next)
      i += 2
    } else if (next && current.toLowerCase().startsWith(next.toLowerCase())) {
      result.push(current)
      i += 2
    } else {
      result.push(current)
      i++
    }
  }

  return result
}

// =====================================================
// ГЛАВНАЯ ФУНКЦИЯ ОЧИСТКИ НАЗВАНИЯ ТРЕКА
// =====================================================

export function cleanTrackTitle(text: string, returnNull = false): string | null {
  if (!text) return returnNull ? null : 'DJ GooD OFF FM'
  let title = text.trim()

  // 0. Заменяем underscores на пробелы
  title = title.replace(/_/g, ' ')

  // 1. Удаляем BOM и невидимые символы
  title = title.replace(/^[\uFEFF\u200B\u200C\u200D]/g, '')

  // 2. Удаляем расширения файлов
  title = title.replace(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i, '')

  // 3. Удаляем голые URL
  title = title.replace(/\s*www\.[^\s]+/gi, '')
  title = title.replace(/\s*https?:\/\/[^\s]+/gi, '')

  // 4. Удаляем теги в квадратных скобках
  title = title.replace(/\s*\[[^\]]*\]/g, '')

  // 5. Удаляем URL внутри круглых скобок
  title = title.replace(/\s*\([^)]*\.[^)]*\)/g, '')

  // 6. Удаляем vk.com/... внутри круглых скобок
  title = title.replace(/\s*\([^)]*vk\.com[^)]*\)/gi, '')

  // 7. Удаляем watermark (WCM)
  title = title.replace(/\s*\(WCM\)/gi, '')

  // 8. Удаляем технический мусор в скобках в конце
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '')
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '')
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*\)\s*$/i, '')
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*\)\s*$/i, '')
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*\)\s*$/i, '')
  // Варианты без закрывающей скобки
  title = title.replace(/\s*\(\s*v\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '')
  title = title.replace(/\s*\(\s*-\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '')
  title = title.replace(/\s*\(\s*v\s*-\s*\d{2,4}\s*$/i, '')
  title = title.replace(/\s*\(\s*-\s*\d{2,4}\s*$/i, '')
  title = title.replace(/\s*\(\s*\d{1,2}[ABab]\s*-\s*\d{2,4}\s*$/i, '')

  // 9. Удаляем год в скобках в конце
  title = title.replace(/\s*\(\d{4}\)\s*$/g, '')

  // 10. Удаляем просто год в конце
  title = title.replace(/\s+\d{4}\s*$/g, '')

  // 11. Защищаем дефисы внутри скобок
  title = protectHyphensInBrackets(title)

  // 12. Нормализуем разделители
  title = title.replace(/\s*[-\u2013\u2014]\s*/g, ' - ')

  // 13. Восстанавливаем дефисы в скобках
  title = restoreHyphensInBrackets(title)

  // 14. Убираем множественные пробелы
  title = title.replace(/\s+/g, ' ').trim()

  // 15. Разбиваем на части по " - "
  let parts = title.split(' - ').map(p => p.trim()).filter(p => p)

  // 16. Удаляем технический мусор
  parts = parts.filter(p => !isTechnicalGarbage(p))

  // 17. Очищаем каждую часть
  parts = parts.map(p => cleanPart(p)).filter(p => p)

  // 18. Удаляем дубликаты артистов
  parts = removeDuplicateArtists(parts)

  if (parts.length === 0) return returnNull ? null : 'DJ GooD OFF FM'

  if (parts.length === 1) {
    return toTitleCase(parts[0])
  }

  // Определяем порядок Artist - Title
  const mixPattern = /\((Original|Extended|Radio|Club|Remix|Mix|Edit|Version|Dub|Instrumental|Acoustic|Live|Remastered)/i

  const firstHasMix = mixPattern.test(parts[0])
  const lastHasMix = mixPattern.test(parts[parts.length - 1])

  let artist: string
  let trackTitle: string

  if (firstHasMix && !lastHasMix) {
    artist = parts[parts.length - 1]
    trackTitle = parts.slice(0, -1).join(' - ')
  } else {
    artist = parts[0]
    trackTitle = parts.slice(1).join(' - ')
  }

  artist = artist.replace(/\s+/g, ' ').trim()
  trackTitle = trackTitle.replace(/\s+/g, ' ').trim()

  if (!artist || !trackTitle) {
    return toTitleCase(parts.join(' - '))
  }

  return `${toTitleCase(artist)} - ${toTitleCase(trackTitle)}`
}
