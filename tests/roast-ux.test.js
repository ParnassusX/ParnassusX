const test = require('node:test');
const assert = require('node:assert/strict');
const WLM = require('../lib/layout.js');

const layout = (urls, title = '') => ({ windows: [{ tabs: urls.map(u => ({ url: u, title: title || u })) }], displays: [] });
function sample() {
  const presets = {};
  WLM.addPreset(presets, 'Alpha', layout(['https://a.test/']), 1);
  WLM.addPreset(presets, 'Bravo', { windows: [
    { tabs: [{ url: 'https://b.test/one', title: 'Design review notes' }] },
    { tabs: [{ url: 'https://b.test/two', title: 'Two' }, { url: 'https://c.test/', title: 'Three' }] },
  ], displays: [] }, 1);
  WLM.addPreset(presets, 'Charlie', layout(['https://c.test/']), 1);
  return presets;
}

test('searchPresets matches names, tab titles and tab URLs', () => {
  const presets = sample();
  assert.deepEqual(WLM.searchPresets(presets, 'alp'), ['Alpha']);
  assert.deepEqual(WLM.searchPresets(presets, 'design'), ['Bravo'], 'matches a tab title');
  assert.deepEqual(WLM.searchPresets(presets, '/two'), ['Bravo'], 'matches a tab URL');
  assert.deepEqual(WLM.searchPresets(presets, 'C.TEST'), ['Bravo', 'Charlie'], 'case-insensitive');
  assert.deepEqual(WLM.searchPresets(presets, '   '), ['Alpha', 'Bravo', 'Charlie'], 'empty query lists everything');
});

test('sortPresetNames puts recently used first, then alphabetical', () => {
  const presets = sample();
  WLM.markUsed(presets, 'Charlie', 100);
  WLM.markUsed(presets, 'Alpha', 50);
  assert.deepEqual(WLM.sortPresetNames(presets), ['Charlie', 'Alpha', 'Bravo']);
});

test('shortcutTargets uses assigned slots and fills the rest alphabetically', () => {
  const presets = sample();
  assert.deepEqual(WLM.shortcutTargets(presets, {}), ['Alpha', 'Bravo', 'Charlie']);
  assert.deepEqual(WLM.shortcutTargets(presets, { 1: 'Charlie' }), ['Charlie', 'Alpha', 'Bravo']);
  assert.deepEqual(WLM.shortcutTargets(presets, { 2: 'Charlie', 1: 'Bravo' }), ['Bravo', 'Charlie', 'Alpha']);
});

test('shortcutTargets ignores slots that name a missing preset', () => {
  const presets = sample();
  assert.deepEqual(WLM.shortcutTargets(presets, { 1: 'Gone' }), ['Alpha', 'Bravo', 'Charlie']);
});

test('shortcutTargets returns null when there are fewer presets than slots', () => {
  const presets = {};
  WLM.addPreset(presets, 'Only', layout(['https://o.test/']), 1);
  assert.deepEqual(WLM.shortcutTargets(presets, {}), ['Only', null, null]);
});

test('assignSlot moves a preset from one slot to another and clears a slot', () => {
  let slots = WLM.assignSlot({}, 1, 'Alpha');
  slots = WLM.assignSlot(slots, 2, 'Bravo');
  assert.deepEqual(slots, { 1: 'Alpha', 2: 'Bravo' });
  slots = WLM.assignSlot(slots, 3, 'Alpha');
  assert.deepEqual(slots, { 2: 'Bravo', 3: 'Alpha' }, 'a preset occupies one slot at most');
  assert.deepEqual(WLM.assignSlot(slots, 3, null), { 2: 'Bravo' });
  assert.deepEqual(WLM.assignSlot(slots, 9, 'Bravo'), slots, 'out-of-range index is ignored');
});

test('renameInSlots follows a renamed preset', () => {
  assert.deepEqual(WLM.renameInSlots({ 1: 'Alpha', 2: 'Bravo' }, 'Alpha', 'Zulu'), { 1: 'Zulu', 2: 'Bravo' });
});

test('removeTab removes one tab, is reversible through history and keeps other windows', () => {
  const presets = sample();
  const result = WLM.removeTab(presets, 'Bravo', 1, 0, 5);
  assert.equal(result.ok, true);
  assert.deepEqual(presets.Bravo.windows[1].tabs.map(t => t.url), ['https://c.test/']);
  assert.equal(presets.Bravo.history.length, 1);
  assert.equal(WLM.revertPreset(presets, 'Bravo', 6).ok, true);
  assert.equal(presets.Bravo.windows[1].tabs.length, 2, 'undo restores the tab');
});

test('removeTab drops a window that becomes empty and refuses to empty the preset', () => {
  const presets = sample();
  assert.equal(WLM.removeTab(presets, 'Bravo', 0, 0, 5).ok, true);
  assert.equal(presets.Bravo.windows.length, 1, 'empty window removed');
  assert.equal(WLM.removeTab(presets, 'Charlie', 0, 0, 5).ok, false, 'last tab cannot be removed');
  assert.equal(WLM.removeTab(presets, 'Charlie', 3, 0, 5).ok, false, 'bad index is refused');
});

test('compactSummary is short and singular/plural correct', () => {
  assert.equal(WLM.compactSummary({ windows: [{ tabs: [{}] }] }), '1 window · 1 tab');
  assert.equal(WLM.compactSummary({ windows: [{ tabs: [{}, {}] }, { tabs: [{}] }] }), '2 windows · 3 tabs');
});

test('trimUndoLog keeps the newest entries that fit and never skips a change', () => {
  const entry = (n, size) => ({ label: `change ${n}`, presets: { blob: 'x'.repeat(size) } });
  const log = [entry(3, 100), entry(2, 100), entry(1, 100)];
  const each = JSON.stringify(log[0]).length;
  assert.equal(WLM.trimUndoLog(log, each * 10).length, 3);
  assert.deepEqual(WLM.trimUndoLog(log, each * 2 + 1).map(e => e.label), ['change 3', 'change 2']);
  assert.equal(WLM.trimUndoLog(log, each - 1).length, 0, 'newest does not fit: nothing is kept');
  // An oversized middle entry stops the log there, so a later undo cannot jump over it.
  const mixed = [entry(3, 100), entry(2, 100000), entry(1, 100)];
  assert.deepEqual(WLM.trimUndoLog(mixed, 5000).map(e => e.label), ['change 3']);
  assert.equal(WLM.trimUndoLog(log, each * 10, 2).length, 2, 'count limit applies too');
});

test('undoBudget shrinks as the presets grow and never goes negative', () => {
  const quota = 10 * 1024 * 1024;
  assert.equal(WLM.undoBudget(0), 4 * 1024 * 1024, 'capped at 4 MB');
  assert.equal(WLM.undoBudget(8 * 1024 * 1024), 1024 * 1024, 'what is left after the presets and a 1 MB margin');
  assert.equal(WLM.undoBudget(quota), 0);
  assert.equal(WLM.undoBudget(quota * 2), 0);
});
