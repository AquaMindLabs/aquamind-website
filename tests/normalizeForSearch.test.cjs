const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeForSearch } = require('../shared/utils/normalizeForSearch.js');

test('normalizeForSearch removes Polish diacritics for search', () => {
  assert.equal(normalizeForSearch('Światło'), 'swiatlo');
  assert.equal(normalizeForSearch('Żelazo'), 'zelazo');
  assert.equal(normalizeForSearch('Rośliny'), 'rosliny');
  assert.equal(normalizeForSearch('Podmiana wody'), 'podmiana wody');
});
