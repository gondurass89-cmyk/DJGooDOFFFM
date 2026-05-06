// Debug formatWord
const LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'vs', 'vs.', 'x', '&'
]);

function formatWord(word, isFirstWord) {
  if (!word) return word;
  const lowerWord = word.toLowerCase();
  console.log(`formatWord("${word}", ${isFirstWord})`);

  // Римские цифры
  if (/^[ivxlcdm]+$/i.test(word) && word.length <= 5) {
    console.log('  -> Римская цифра');
    return word.toUpperCase();
  }

  // Музыкальные термины - ДО проверки аббревиатур!
  const musicTerms = ['mix', 'remix', 'edit', 'dub', 'club', 'radio', 'version', 'original', 'extended', 'acoustic', 'instrumental', 'remastered', 'live', 'bootleg', 'vip', 'intro', 'outro'];
  if (musicTerms.includes(lowerWord)) {
    console.log('  -> Музыкальный термин, результат:', lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1));
    return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
  }

  // Аббревиатуры (DJ, MC, TV и т.д.)
  const isAbbr = /^[A-Z]{2,}$/.test(word) || ['dj', 'mc', 'tv', 'uk', 'usa', 'nyc', 'la', 'dc'].includes(lowerWord);
  if (isAbbr) {
    console.log('  -> Аббревиатура');
    return word.toUpperCase();
  }

  if (!isFirstWord && LOWERCASE_WORDS.has(lowerWord)) {
    console.log('  -> lowercase word');
    return lowerWord;
  }
  console.log('  -> capitalize');
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

console.log('Direct test:');
console.log('MIX ->', formatWord('MIX', true));
console.log('---');
console.log('Mix ->', formatWord('Mix', true));
console.log('---');
console.log('mix ->', formatWord('mix', true));
