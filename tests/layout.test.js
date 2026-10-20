const test = require('node:test');
const assert = require('node:assert/strict');
const WLM = require('../lib/layout.js');

const PRIMARY = { id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1920, height: 1080 }, workArea: { left: 0, top: 0, width: 1920, height: 1040 } };
const SECOND = { id: '2', isPrimary: false, bounds: { left: 1920, top: 0, width: 1280, height: 1024 }, workArea: { left: 1920, top: 0, width: 1280, height: 1024 } };
const LEFT_OF_PRIMARY = { id: '3', isPrimary: false, bounds: { left: -1280, top: 0, width: 1280, height: 1024 }, workArea: { left: -1280, top: 0, width: 1280, height: 1024 } };

function layoutWith(windows, displays = [PRIMARY]) {
  return { windows, displays };
}

test('sanitizeUrl keeps only http and https', () => {
  assert.equal(WLM.sanitizeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(WLM.sanitizeUrl('http://127.0.0.1:8765/x'), 'http://127.0.0.1:8765/x');
  for (const bad of ['file:///etc/hostname', 'javascript:alert(1)', 'chrome://settings', 'about:blank', 'data:text/html,x', 'not a url', '', null, 42]) {
    assert.equal(WLM.sanitizeUrl(bad), null, `should reject ${String(bad)}`);
  }
});

test('sanitizeLayout drops non-web tabs and keeps tab flags aligned with the surviving tabs', () => {
  const out = WLM.sanitizeLayout(layoutWith([{
    left: 10, top: 10, width: 800, height: 600, state: 'normal', focused: true, displayId: '1',
    tabs: [
      { url: 'chrome://newtab/', pinned: true, active: false },
      { url: 'https://a.test/', pinned: true, active: false },
      { url: 'file:///secret', pinned: false, active: true },
      { url: 'https://b.test/', pinned: false, active: true },
    ],
  }]));
  assert.ok(out);
  assert.deepEqual(out.windows[0].tabs, [
    { url: 'https://a.test/', active: false, pinned: true },
    { url: 'https://b.test/', active: true, pinned: false },
  ]);
});

test('sanitizeLayout rejects a layout that has no web tabs at all', () => {
  assert.equal(WLM.sanitizeLayout(layoutWith([{ tabs: [{ url: 'file:///x' }] }])), null);
  assert.equal(WLM.sanitizeLayout(layoutWith([])), null);
  assert.equal(WLM.sanitizeLayout({ windows: [] }), null);
  assert.equal(WLM.sanitizeLayout(null), null);
});

test('sanitizeLayout coerces unknown window states to normal and drops non-numeric geometry', () => {
  const out = WLM.sanitizeLayout(layoutWith([{ state: 'exploded', left: 'x', top: NaN, width: 500, height: 300, tabs: [{ url: 'https://a.test/' }] }]));
  assert.equal(out.windows[0].state, 'normal');
  assert.equal(out.windows[0].left, undefined);
  assert.equal(out.windows[0].top, undefined);
  assert.equal(out.windows[0].width, 500);
});

test('getDisplayForWindow treats left=0 and top=0 as valid positions', () => {
  // A window whose centre is on the secondary display, positioned at x=0 of the
  // primary, must not fall back to the primary display just because left is 0.
  // The old truthy check sent this window to the primary display; it is on the
  // display stacked below, which starts at x=0.
  const BELOW = { id: '4', isPrimary: false, bounds: { left: 0, top: 1100, width: 1920, height: 1080 }, workArea: { left: 0, top: 1100, width: 1920, height: 1080 } };
  const win = { left: 0, top: 1200, width: 600, height: 400 };
  assert.equal(WLM.getDisplayForWindow(win, [PRIMARY, BELOW]), '4');
  const atOrigin = { left: 0, top: 0, width: 600, height: 400 };
  assert.equal(WLM.getDisplayForWindow(atOrigin, [PRIMARY, SECOND]), '1');
  const onSecond = { left: 1920, top: 0, width: 400, height: 300 };
  assert.equal(WLM.getDisplayForWindow(onSecond, [PRIMARY, SECOND]), '2');
  const leftScreen = { left: -1000, top: 100, width: 400, height: 300 };
  assert.equal(WLM.getDisplayForWindow(leftScreen, [PRIMARY, LEFT_OF_PRIMARY]), '3');
});

test('getDisplayForWindow falls back to the primary display for missing geometry', () => {
  assert.equal(WLM.getDisplayForWindow({ width: 100 }, [SECOND, PRIMARY]), '1');
  assert.equal(WLM.getDisplayForWindow(undefined, [PRIMARY]), '1');
  assert.equal(WLM.getDisplayForWindow({ left: 0, top: 0, width: 1, height: 1 }, []), null);
});

test('planPlacement keeps the window on its original display when it still exists', () => {
  const plan = WLM.planPlacement({ displayId: '2', left: 2000, top: 50, width: 700, height: 500, state: 'maximized' }, [PRIMARY, SECOND]);
  assert.equal(plan.displayId, '2');
  assert.equal(plan.sameDisplay, true);
  assert.equal(plan.state, 'maximized');
  assert.equal(plan.left, 2000);
});

test('planPlacement falls back to the primary display when the original is gone', () => {
  const plan = WLM.planPlacement({ displayId: '2', left: 2000, top: 50, width: 700, height: 500, state: 'maximized' }, [PRIMARY]);
  assert.equal(plan.displayId, '1');
  assert.equal(plan.sameDisplay, false);
  assert.equal(plan.state, 'normal', 'state is reset when the window moves display');
});

test('planPlacement pulls off-screen windows back inside the work area', () => {
  const plan = WLM.planPlacement({ displayId: '1', left: 5000, top: -300, width: 800, height: 600 }, [PRIMARY]);
  assert.equal(plan.left, 1920 - 800);
  assert.equal(plan.top, 0);
});

test('planPlacement enforces the minimum size and never exceeds the display', () => {
  const tiny = WLM.planPlacement({ displayId: '1', width: 10, height: 10 }, [PRIMARY]);
  assert.equal(tiny.width, 100);
  assert.equal(tiny.height, 100);
  const huge = WLM.planPlacement({ displayId: '1', width: 9000, height: 9000 }, [PRIMARY]);
  assert.equal(huge.width, 1920);
  assert.equal(huge.height, 1040);
});

test('planPlacement turns minimized into normal', () => {
  assert.equal(WLM.planPlacement({ displayId: '1', state: 'minimized' }, [PRIMARY]).state, 'normal');
});

test('addPreset refuses to overwrite an existing name', () => {
  const presets = {};
  const layout = layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]);
  assert.equal(WLM.addPreset(presets, 'Work', layout).ok, true);
  const second = WLM.addPreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://other.test/' }] }]));
  assert.equal(second.ok, false);
  assert.match(second.message, /already exists/);
  assert.equal(presets.Work.windows[0].tabs[0].url, 'https://a.test/', 'original preset untouched');
});

test('addPreset validates names', () => {
  const layout = layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]);
  assert.equal(WLM.addPreset({}, '   ', layout).ok, false);
  assert.equal(WLM.addPreset({}, 'x'.repeat(101), layout).ok, false);
  assert.equal(WLM.addPreset({}, '__proto__', layout).ok, false);
  assert.equal(WLM.addPreset({}, 42, layout).ok, false);
  const named = {};
  WLM.addPreset(named, '  Trimmed  ', layout);
  assert.ok(Object.prototype.hasOwnProperty.call(named, 'Trimmed'));
});

test('addPreset does not store a layout that has no web tabs', () => {
  const presets = {};
  assert.equal(WLM.addPreset(presets, 'Bad', layoutWith([{ tabs: [{ url: 'file:///x' }] }])).ok, false);
  assert.deepEqual(presets, {});
});

test('updatePreset requires an existing preset', () => {
  const presets = {};
  const layout = layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]);
  assert.equal(WLM.updatePreset(presets, 'Missing', layout).ok, false);
  WLM.addPreset(presets, 'Work', layout);
  const updated = WLM.updatePreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://b.test/' }] }]));
  assert.equal(updated.ok, true);
  assert.equal(presets.Work.windows[0].tabs[0].url, 'https://b.test/');
});

test('mergeImport keeps valid presets, skips bad ones, and never stores file: URLs', () => {
  const presets = { Existing: layoutWith([{ tabs: [{ url: 'https://keep.test/' }] }]) };
  const incoming = {
    Good: layoutWith([{ tabs: [{ url: 'https://good.test/' }] }]),
    Hostile: layoutWith([{ tabs: [{ url: 'file:///etc/hostname' }, { url: 'javascript:alert(1)' }] }]),
    Broken: { windows: 'nope' },
    '': layoutWith([{ tabs: [{ url: 'https://x.test/' }] }]),
  };
  const result = WLM.mergeImport(presets, incoming);
  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 3);
  assert.deepEqual(Object.keys(presets).sort(), ['Existing', 'Good']);
  assert.equal(JSON.stringify(presets).includes('file:'), false);
});

test('mergeImport rejects non-object input', () => {
  assert.equal(WLM.mergeImport({}, []).ok, false);
  assert.equal(WLM.mergeImport({}, null).ok, false);
  assert.equal(WLM.mergeImport({}, 'text').ok, false);
});
