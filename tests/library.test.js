const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WLM = require('../lib/layout.js');
const PREVIEW = require('../lib/preview.js');

const library = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'library', 'presets.json'), 'utf8'));
const SCREENS = {
  reference: [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1920, height: 1080 }, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }],
  laptop: [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1280, height: 800 }, workArea: { left: 0, top: 0, width: 1280, height: 760 } }],
  portrait: [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1080, height: 1920 }, workArea: { left: 0, top: 0, width: 1080, height: 1880 } }],
};

test('library file has unique ids, names and categories', () => {
  assert.ok(library.presets.length >= 5);
  const ids = library.presets.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of library.presets) {
    assert.ok(p.name && p.category && p.description, `${p.id} has text fields`);
  }
});

test('every library layout is valid and uses only web URLs', () => {
  for (const p of library.presets) {
    const clean = WLM.sanitizeLayout(p.layout);
    assert.ok(clean, `${p.id} sanitizes to a usable layout`);
    const total = p.layout.windows.reduce((n, w) => n + w.tabs.length, 0);
    const kept = clean.windows.reduce((n, w) => n + w.tabs.length, 0);
    assert.equal(kept, total, `${p.id} has no dropped tabs`);
  }
});

test('library layouts fit inside any of the reference screen shapes', () => {
  for (const [label, screens] of Object.entries(SCREENS)) {
    for (const p of library.presets) {
      const clean = WLM.sanitizeLayout(p.layout);
      for (const win of clean.windows) {
        const plan = WLM.planPlacement(win, screens, clean.displays, { fit: true });
        const area = screens[0].workArea;
        assert.ok(plan.left >= area.left && plan.top >= area.top, `${p.id} on ${label} starts on screen`);
        assert.ok(plan.left + plan.width <= area.left + area.width, `${p.id} on ${label} stays within width`);
        assert.ok(plan.top + plan.height <= area.top + area.height, `${p.id} on ${label} stays within height`);
      }
    }
  }
});

test('library previews render one window rect per layout window', () => {
  for (const p of library.presets) {
    const stored = WLM.normalizeStoredEntry(p.layout, 0);
    const svg = PREVIEW.renderPreviewSvg(stored);
    assert.equal((svg.match(/class="win/g) || []).length, stored.windows.length, p.id);
  }
});
