const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.join(__dirname, '..', 'site');
function pages(dir = site) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'img' ? [] : pages(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

test('the site has the four pages', () => {
  const names = pages().map(p => path.relative(site, p)).sort();
  assert.deepEqual(names, ['index.html', 'it/index.html', 'it/privacy.html', 'privacy.html']);
});

test('every local link and image resolves to a file', () => {
  for (const page of pages()) {
    const html = fs.readFileSync(page, 'utf8');
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const file = path.resolve(path.dirname(page), target.split('#')[0] || '.');
      const resolved = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
      assert.ok(fs.existsSync(resolved), `${path.relative(site, page)} links to a missing file: ${target}`);
    }
  }
});

test('the pages load nothing from outside, run no scripts and set a language', () => {
  for (const page of pages()) {
    const html = fs.readFileSync(page, 'utf8');
    const name = path.relative(site, page);
    assert.equal(/<script/i.test(html), false, `${name} has a script`);
    // The store URL, when configured, is a link the user clicks, not a resource.
    const loaded = [...html.matchAll(/\b(?:src|href)="(https?:[^"]+)"/g)].filter(m => !/chromewebstore/.test(m[1]));
    assert.deepEqual(loaded.map(m => m[1]), [], `${name} loads an external resource`);
    assert.match(html, /<html lang="(en|it)">/, `${name} lacks a language`);
    assert.match(html, /<title>[^<]{10,}<\/title>/, `${name} lacks a title`);
    assert.match(html, /<meta name="description" content="[^"]{40,}"/, `${name} lacks a description`);
  }
});

test('every image has alt text (decorative ones use an empty alt)', () => {
  for (const page of pages()) {
    const html = fs.readFileSync(page, 'utf8');
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\balt="/, `${path.relative(site, page)} has an image without alt: ${img.slice(0, 60)}`);
    }
  }
});

test('the privacy policy says what is stored and what is not sent', () => {
  const en = fs.readFileSync(path.join(site, 'privacy.html'), 'utf8');
  assert.match(en, /does not send any data/i);
  assert.match(en, /URL/);
  const it = fs.readFileSync(path.join(site, 'it', 'privacy.html'), 'utf8');
  assert.match(it, /Non invia alcun dato/);
});

test('the store images exist at the sizes the Chrome Web Store asks for', () => {
  const size = file => { const b = fs.readFileSync(file); let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } return null; };
  for (const lang of ['en', 'it']) {
    const dir = path.join(__dirname, '..', 'store', lang);
    for (let n = 1; n <= 5; n++) assert.deepEqual(size(path.join(dir, `screenshot-${n}.jpg`)), [1280, 800], `${lang} screenshot ${n}`);
    assert.deepEqual(size(path.join(dir, 'promo-small.jpg')), [440, 280]);
    assert.deepEqual(size(path.join(dir, 'promo-marquee.jpg')), [1400, 560]);
  }
});
