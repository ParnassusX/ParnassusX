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

test('preview ignores windows without geometry and never injects markup', () => {
  const svg = PREVIEW.renderPreviewSvg({
    displays: [],
    windows: [{ tabs: [{ url: 'https://a.test/' }] }, { left: 0, top: 0, width: 10, height: 10, tabs: [], focused: true }],
  });
  assert.equal((svg.match(/class="win/g) || []).length, 1);
  assert.equal(svg.includes('<script'), false);
});
