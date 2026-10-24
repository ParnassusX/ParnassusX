const test = require('node:test');
const assert = require('node:assert/strict');
const PREVIEW = require('../lib/preview.js');

test('preview is an SVG with one rect per window and one per screen', () => {
  const svg = PREVIEW.renderPreviewSvg({
    displays: [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }],
    windows: [
      { left: 0, top: 0, width: 960, height: 1040, tabs: [{ url: 'https://a.test/' }] },
      { left: 960, top: 0, width: 960, height: 1040, tabs: [{ url: 'https://b.test/' }] },
    ],
  });
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/class="win/g) || []).length, 2);
  assert.equal((svg.match(/class="screen"/g) || []).length, 1);
});

test('the preview label counts windows with the right plural', () => {
  const one = PREVIEW.renderPreviewSvg({ displays: [], windows: [{ left: 0, top: 0, width: 10, height: 10, tabs: [] }] });
  assert.match(one, /aria-label="Layout preview: 1 window"/);
  const two = PREVIEW.renderPreviewSvg({ displays: [], windows: [{ left: 0, top: 0, width: 10, height: 10, tabs: [] }, { left: 20, top: 0, width: 10, height: 10, tabs: [] }] });
  assert.match(two, /aria-label="Layout preview: 2 windows"/);
});

test('preview ignores windows without geometry and never injects markup', () => {
  const svg = PREVIEW.renderPreviewSvg({
    displays: [],
    windows: [{ tabs: [{ url: 'https://a.test/' }] }, { left: 0, top: 0, width: 10, height: 10, tabs: [], focused: true }],
  });
  assert.equal((svg.match(/class="win/g) || []).length, 1);
  assert.equal(svg.includes('<script'), false);
});

test('each window is coloured by its site and carries the site initial', () => {
  global.WLM = require('../lib/layout.js');
  const svg = PREVIEW.renderPreviewSvg({
    displays: [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }],
    windows: [
      { left: 0, top: 0, width: 960, height: 1040, tabs: [{ url: 'https://github.com/x' }] },
      { left: 960, top: 0, width: 960, height: 1040, tabs: [{ url: 'https://docs.google.com/d' }] },
    ],
  });
  assert.match(svg, />G<\/text>/);
  assert.equal((svg.match(/win-letter/g) || []).length, 2);
  assert.equal(PREVIEW.hueFor('Github'), PREVIEW.hueFor('Github'), 'stable per site');
});

test('a site name is escaped before it reaches the markup', () => {
  global.WLM = { windowSite: () => '<script>alert(1)</script>' };
  const svg = PREVIEW.renderPreviewSvg({
    displays: [],
    windows: [{ left: 0, top: 0, width: 400, height: 300, tabs: [{ url: 'https://x.test/' }] }],
  });
  assert.equal(svg.includes('<script'), false);
  global.WLM = require('../lib/layout.js');
});
