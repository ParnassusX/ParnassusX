// Prints every English string that the Italian dictionary must cover:
//   node tools/list-strings.js          all keys, one per line
// Used by tests/i18n.test.js. Strings are read from t('...') calls in the
// scripts and from the static text and attributes of the HTML pages.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SCRIPTS = ['background.js', 'popup.js', 'sidepanel.js', 'welcome.js', 'lib/ui.js', 'lib/layout.js', 'lib/preview.js'];
const PAGES = ['popup.html', 'sidepanel.html', 'welcome.html'];

function unescape(raw) {
  return raw.replace(/\\(["'\\])/g, '$1');
}

function scriptKeys() {
  const keys = new Set();
  // t('text' ...) with single-quoted text that may contain escaped quotes.
  const call = /(?<![\w.])t\(\s*'((?:[^'\\\n]|\\.)*)'/g;
  for (const file of SCRIPTS) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(call)) keys.add(unescape(match[1]));
  }
  return keys;
}

function pageKeys() {
  const keys = new Set();
  for (const file of PAGES) {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    for (const match of html.matchAll(/>([^<>]*[A-Za-z][^<>]*)</g)) {
      const text = match[1].trim();
      if (text) keys.add(text);
    }
    for (const match of html.matchAll(/\b(?:placeholder|title|aria-label)="([^"]*[A-Za-z][^"]*)"/g)) keys.add(match[1]);
  }
  return keys;
}

// Words built at run time: counts, and the window states shown in the tab list.
const DYNAMIC = [];
for (const word of ['window', 'tab', 'screen', 'preset']) DYNAMIC.push(`{n} ${word}`, `{n} ${word}s`);
DYNAMIC.push('maximized', 'fullscreen');

function allKeys() {
  return [...new Set([...scriptKeys(), ...pageKeys(), ...DYNAMIC])].sort();
}

if (require.main === module) {
  for (const key of allKeys()) console.log(key);
}
module.exports = { allKeys, scriptKeys, pageKeys };
