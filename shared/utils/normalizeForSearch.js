function normalizeForSearch(value) {
  const manualMap = {
    '\u0142': 'l',
    '\u0141': 'l',
    '\u0111': 'd',
    '\u0110': 'd',
    '\u00F8': 'o',
    '\u00D8': 'o',
  };
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0142\u0141\u0111\u0110\u00F8\u00D8]/g, (char) => manualMap[char] ?? char)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

module.exports = {
  normalizeForSearch,
};
