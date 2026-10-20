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
      { url: 'https://a.test/', title: 'A', pinned: true, active: false },
      { url: 'file:///secret', title: 'S', pinned: false, active: true },
      { url: 'https://b.test/', title: 'B', pinned: false, active: true },
    ],
  }]));
  assert.ok(out);
  assert.deepEqual(out.windows[0].tabs, [
    { url: 'https://a.test/', title: 'A', active: false, pinned: true },
    { url: 'https://b.test/', title: 'B', active: true, pinned: false },
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

test('planPlacement scales a window proportionally when the work area changed', () => {
  // Saved on a 1920x1040 screen; now the same screen is 3840x2080 (2x).
  const saved = [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }];
  const now = [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 3840, height: 2080 } }];
  const plan = WLM.planPlacement({ displayId: '1', left: 960, top: 520, width: 480, height: 260 }, now, saved, { fit: true });
  assert.deepEqual([plan.left, plan.top, plan.width, plan.height], [1920, 1040, 960, 520]);
});

test('planPlacement without fit keeps absolute pixels', () => {
  const saved = [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }];
  const now = [{ id: '1', isPrimary: true, workArea: { left: 0, top: 0, width: 3840, height: 2080 } }];
  const plan = WLM.planPlacement({ displayId: '1', left: 960, top: 520, width: 480, height: 260 }, now, saved, { fit: false });
  assert.deepEqual([plan.left, plan.top, plan.width, plan.height], [960, 520, 480, 260]);
});

test('planPlacement fits a reference-screen library preset onto a smaller screen', () => {
  const reference = [{ id: 'ref', isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }];
  const small = [{ id: '9', isPrimary: true, workArea: { left: 0, top: 0, width: 1280, height: 800 } }];
  const plan = WLM.planPlacement({ displayId: 'ref', left: 0, top: 0, width: 960, height: 1040 }, small, reference, { fit: true });
  assert.deepEqual([plan.left, plan.top, plan.width, plan.height], [0, 0, 640, 800]);
});

test('displaySignature changes when the screen setup changes', () => {
  const a = [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1920, height: 1080 } }];
  const b = [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 2560, height: 1440 } }];
  assert.equal(WLM.displaySignature(a), WLM.displaySignature([...a]));
  assert.notEqual(WLM.displaySignature(a), WLM.displaySignature(b));
});

test('updatePreset keeps the previous version and revertPreset restores it', () => {
  const presets = {};
  WLM.addPreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://v1.test/' }] }]), 1000);
  WLM.updatePreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://v2.test/' }] }]), 2000);
  assert.equal(presets.Work.history.length, 1);
  assert.equal(presets.Work.windows[0].tabs[0].url, 'https://v2.test/');
  const reverted = WLM.revertPreset(presets, 'Work', 3000);
  assert.equal(reverted.ok, true);
  assert.equal(presets.Work.windows[0].tabs[0].url, 'https://v1.test/');
  // The swap keeps the replaced version, so reverting again goes back to v2.
  assert.equal(presets.Work.history.length, 1);
  WLM.revertPreset(presets, 'Work', 4000);
  assert.equal(presets.Work.windows[0].tabs[0].url, 'https://v2.test/');
  assert.equal(WLM.revertPreset({ Solo: WLM.normalizeStoredEntry(layoutWith([{ tabs: [{ url: 'https://s.test/' }] }]), 1) }, 'Solo', 5).ok, false, 'no earlier version');
});

test('history is capped', () => {
  const presets = {};
  WLM.addPreset(presets, 'W', layoutWith([{ tabs: [{ url: 'https://0.test/' }] }]), 0);
  for (let i = 1; i <= 6; i++) {
    WLM.updatePreset(presets, 'W', layoutWith([{ tabs: [{ url: `https://${i}.test/` }] }]), i);
  }
  assert.equal(presets.W.history.length, WLM.MAX_HISTORY);
});

test('renamePreset refuses a taken name and keeps history', () => {
  const presets = {};
  WLM.addPreset(presets, 'A', layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]), 1);
  WLM.addPreset(presets, 'B', layoutWith([{ tabs: [{ url: 'https://b.test/' }] }]), 1);
  assert.equal(WLM.renamePreset(presets, 'A', 'B').ok, false);
  assert.equal(WLM.renamePreset(presets, 'A', 'C').ok, true);
  assert.ok(!presets.A && presets.C);
});

test('duplicatePreset creates a unique copy without history', () => {
  const presets = {};
  WLM.addPreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]), 1);
  WLM.updatePreset(presets, 'Work', layoutWith([{ tabs: [{ url: 'https://b.test/' }] }]), 2);
  const first = WLM.duplicatePreset(presets, 'Work', 3);
  const second = WLM.duplicatePreset(presets, 'Work', 4);
  assert.equal(first.name, 'Work (copy)');
  assert.equal(second.name, 'Work (copy) 2');
  assert.deepEqual(presets[first.name].history, []);
  assert.equal(presets[first.name].windows[0].tabs[0].url, 'https://b.test/');
});

test('normalizeStoredEntry upgrades the flat v1 shape', () => {
  const v1 = layoutWith([{ tabs: [{ url: 'https://old.test/' }] }]);
  const entry = WLM.normalizeStoredEntry(v1, 42);
  assert.equal(entry.version, 2);
  assert.equal(entry.savedAt, 42);
  assert.deepEqual(entry.history, []);
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

test('library installs are marked as reference layouts and survive normalization', () => {
  const presets = {};
  const result = WLM.installPreset(presets, 'Code review', layoutWith([{ tabs: [{ url: 'https://a.test/' }] }]), 5);
  assert.equal(result.ok, true);
  assert.equal(presets[result.name].reference, true);
  assert.equal(WLM.normalizeStoredEntry(presets[result.name], 0).reference, true);
  // A user edit turns it into an ordinary preset.
  WLM.updatePreset(presets, result.name, layoutWith([{ tabs: [{ url: 'https://b.test/' }] }]), 6);
  assert.equal(presets[result.name].reference, undefined);
});
