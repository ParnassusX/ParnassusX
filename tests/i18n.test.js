const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18N = require('../lib/i18n.js');
require('../locales/it.js');
const WLM = require('../lib/layout.js');
const { allKeys } = require('../tools/list-strings.js');

const root = path.join(__dirname, '..');
const italian = I18N.dictionaries.it;
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(',');

test('every string in the code and the pages has an Italian translation', () => {
  const missing = allKeys().filter(key => !(key in italian));
  assert.deepEqual(missing, [], 'add these to locales/it.js');
});

test('the Italian dictionary has no entries the code no longer uses', () => {
  const used = new Set(allKeys());
  assert.deepEqual(Object.keys(italian).filter(key => !used.has(key)), []);
});

test('a translation keeps the same placeholders as the English text', () => {
  for (const [english, translated] of Object.entries(italian)) {
    assert.equal(placeholders(translated), placeholders(english), `placeholders differ for: ${english}`);
    assert.ok(translated.trim().length > 0, `empty translation for: ${english}`);
  }
});

test('t() formats placeholders, falls back to English and never throws on a missing one', () => {
  I18N.select('en');
  assert.equal(I18N.t('Preset "{name}" saved.', { name: 'Work' }), 'Preset "Work" saved.');
  assert.equal(I18N.t('A string nobody translated {x}', { x: 1 }), 'A string nobody translated 1');
  assert.equal(I18N.t('Hello {missing}'), 'Hello {missing}');
  I18N.select('it');
  assert.equal(I18N.t('Save'), 'Salva');
  assert.equal(I18N.t('A string nobody translated'), 'A string nobody translated', 'falls back to English');
  I18N.select('en');
});

test('counts are inflected per language', () => {
  I18N.select('it');
  assert.equal(I18N.count(1, 'window'), '1 finestra');
  assert.equal(I18N.count(3, 'window'), '3 finestre');
  assert.equal(I18N.count(2, 'tab'), '2 tab');
  I18N.select('en');
  assert.equal(I18N.count(1, 'window'), '1 window');
  assert.equal(I18N.count(3, 'window'), '3 windows');
});

test('messages produced by the layout logic follow the language', () => {
  const layout = { windows: [{ tabs: [{ url: 'https://a.test/' }] }], displays: [] };
  I18N.select('it');
  const presets = {};
  assert.equal(WLM.addPreset(presets, 'Lavoro', layout, 1).message, 'Preset "Lavoro" salvato.');
  assert.match(WLM.addPreset(presets, 'Lavoro', layout, 2).message, /esiste già/);
  assert.equal(WLM.compactSummary({ windows: [{ tabs: [{}, {}] }] }), '1 finestra · 2 tab');
  I18N.select('en');
  assert.equal(WLM.addPreset({}, 'Work', layout, 1).message, 'Preset "Work" saved.');
});

test('the language follows the browser UI language, and an unknown one falls back to English', () => {
  I18N.select('it-IT');
  assert.equal(I18N.language(), 'it');
  I18N.select('de');
  assert.equal(I18N.t('Save'), 'Save');
  I18N.select('en');
});

test('library entries carry an Italian name, category and description', () => {
  const library = JSON.parse(fs.readFileSync(path.join(root, 'library', 'presets.json'), 'utf8'));
  for (const item of library.presets) {
    const it = item.translations && item.translations.it;
    assert.ok(it && it.name && it.category && it.description, `${item.id} lacks an Italian translation`);
  }
});

test('every message key the manifest uses exists in both locales', () => {
  const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  const keys = [...manifest.matchAll(/__MSG_(\w+)__/g)].map(m => m[1]);
  assert.ok(keys.length >= 4);
  for (const locale of ['en', 'it']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
    for (const key of keys) assert.ok(messages[key] && messages[key].message, `${locale} lacks ${key}`);
  }
  assert.equal(JSON.parse(manifest).default_locale, 'en');
});
