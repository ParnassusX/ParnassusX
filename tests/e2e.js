// End-to-end checks in real Chromium. Needs Playwright and a display:
//   npm i --no-save playwright && xvfb-run -a npm run test:e2e
// Set CHROME_BIN to use a specific Chrome/Chromium binary. Screenshots go to
// SCREENSHOT_DIR when it is set.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const SHOTS = process.env.SCREENSHOT_DIR;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ' :: ' + JSON.stringify(detail)}`);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>${req.url}</title>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'wlm-e2e-')), {
    headless: false,
    executablePath: process.env.CHROME_BIN || undefined,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, '--no-first-run'],
    viewport: null,
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    check('service worker starts', !!sw);

    // Host pages live in popup-type windows so closing normal windows during
    // apply does not close the page driving the test.
    const openHost = async (file, width, height) => {
      await sw.evaluate(([u, w, h]) => chrome.windows.create({ url: u, type: 'popup', width: w, height: h }),
        [`chrome-extension://${extId}/${file}`, width, height]);
      await wait(800);
      return ctx.pages().find(p => p.url() === `chrome-extension://${extId}/${file}`);
    };
    const popup = await openHost('popup.html', 380, 560);
    const panel = await openHost('sidepanel.html', 400, 760);
    const errors = [];
    for (const p of [popup, panel]) p.on('pageerror', e => errors.push(String(e)));

    const send = (page, msg) => page.evaluate(m => new Promise(r => chrome.runtime.sendMessage(m, r)), msg);
    const fresh = () => sw.evaluate(() => chrome.storage.local.clear());
    const normalWindows = () => sw.evaluate(() => chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
      .then(ws => ws.map(w => ({ tabs: w.tabs.map(t => ({ url: t.url, pinned: t.pinned })) }))));
    const allUrls = async () => (await normalWindows()).flatMap(w => w.tabs.map(t => t.url));

    await fresh();
    await sw.evaluate(async b => {
      const w = await chrome.windows.create({ url: b + '/a' });
      await chrome.tabs.update(w.tabs[0].id, { pinned: true });
      await chrome.tabs.create({ windowId: w.id, url: b + '/b', active: true });
      await chrome.windows.create({ url: b + '/c' });
    }, base);
    await wait(600);

    // ---- Save, capture, duplicate protection ----
    const saved = await send(popup, { action: 'saveCurrentLayout', presetName: 'Work' });
    check('save current layout succeeds', saved.status === 'success' && saved.success === true, saved);
    const dup = await send(popup, { action: 'saveCurrentLayout', presetName: 'Work' });
    check('saving an existing name is refused with an error status', dup.status === 'error' && dup.success === false, dup);

    // ---- Safe by default: until a choice is made, nothing is closed ----
    await sw.evaluate(() => chrome.storage.sync.clear());
    const windowsBefore = (await normalWindows()).length;
    const safeApply = await send(popup, { action: 'applyPreset', presetName: 'Work' });
    await wait(1200);
    const windowsAfterSafe = (await normalWindows()).length;
    check('before a choice is made, apply closes nothing', safeApply.status === 'success' && windowsAfterSafe >= windowsBefore, { windowsBefore, windowsAfterSafe });
    check('and leaves nothing to undo', (await send(panel, { action: 'getLastSession' })).session === null);
    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true }));

    // ---- Apply restores URLs and the pinned flag ----
    const applied = await send(popup, { action: 'applyPreset', presetName: 'Work' });
    check('apply succeeds', applied.status === 'success', applied);
    await wait(1500);
    const urls = await allUrls();
    check('restored windows contain every saved URL', ['/a', '/b', '/c'].every(p => urls.some(u => u && u.endsWith(p))), urls);
    const first = (await normalWindows()).flatMap(w => w.tabs).find(t => t.url && t.url.endsWith('/a'));
    check('pinned flag survives on the restored first tab', !!(first && first.pinned), first);

    // ---- Undo last apply ----
    const undoInfo = await send(panel, { action: 'getLastSession' });
    check('apply that closed windows is remembered for undo', !!undoInfo.session, undoInfo);
    const beforeUndo = (await normalWindows()).length;
    const undone = await send(panel, { action: 'undoLastApply' });
    check('undo last apply succeeds', undone.status === 'success', undone);
    await wait(1500);
    const afterUndo = await allUrls();
    check('undo brings the closed windows back', afterUndo.some(u => u && u.endsWith('/c')) && afterUndo.some(u => u && u.endsWith('/a')), { beforeUndo, afterUndo });
    check('undo clears the remembered session', (await send(panel, { action: 'getLastSession' })).session === null);

    // ---- Versions: update then restore previous ----
    await sw.evaluate(async b => { await chrome.tabs.create({ url: b + '/d' }); }, base);
    const upd = await send(panel, { action: 'updateCurrentLayout', presetName: 'Work' });
    check('update keeps the previous version', upd.success === true, upd);
    const reverted = await send(panel, { action: 'revertPreset', presetName: 'Work' });
    check('restore previous version succeeds', reverted.success === true, reverted);
    const stored = (await send(panel, { action: 'getPresets' })).presets.Work;
    check('restored version does not include the newer tab', !JSON.stringify(stored.windows).includes('/d'), stored.windows.map(w => w.tabs.length));

    // ---- Rename and duplicate ----
    const renamed = await send(panel, { action: 'renamePreset', presetName: 'Work', newName: 'Deep work' });
    check('rename succeeds', renamed.success === true, renamed);
    const copied = await send(panel, { action: 'duplicatePreset', presetName: 'Deep work' });
    check('duplicate creates a copy', copied.success === true, copied);
    const names = Object.keys((await send(panel, { action: 'getPresets' })).presets);
    check('names after rename and duplicate', names.includes('Deep work') && names.includes('Deep work (copy)'), names);

    // ---- Library: install and apply a built-in layout ----
    const lib = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'library', 'presets.json'), 'utf8')).presets;
    const installed = await send(panel, { action: 'installPreset', presetName: lib[0].name, layoutData: lib[0].layout });
    check('library preset installs', installed.success === true, installed);
    const again = await send(panel, { action: 'installPreset', presetName: lib[0].name, layoutData: lib[0].layout });
    check('installing the same library preset twice gets a unique name', again.success === true, again);

    // ---- Import rejects file: URLs, apply of stored file: presets is refused ----
    await sw.evaluate(() => chrome.storage.local.set({ presets: { Evil: { windows: [{ tabs: [{ url: 'file:///etc/hostname' }] }], displays: [] } } }));
    const evil = await send(panel, { action: 'applyPreset', presetName: 'Evil' });
    check('applying a stored file: preset is refused', evil.status === 'error', evil);
    await wait(1200);
    const tabUrls = await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.map(t => t.url)));
    check('no file: tab is opened', !tabUrls.some(u => u && u.startsWith('file:')), tabUrls);

    // ---- Big layouts: only the front tab of each window loads ----
    const manyTabs = { windows: [{ left: 10, top: 10, width: 900, height: 700, displayId: '1',
      tabs: Array.from({ length: 14 }, (_, i) => ({ url: `${base}/lazy${i}`, title: `lazy ${i}`, active: i === 0 })) }],
      displays: [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1920, height: 1080 } }] };
    await fresh();
    await send(panel, { action: 'savePreset', presetName: 'Many tabs', layoutData: manyTabs });
    const lazyState = () => sw.evaluate((b) => chrome.tabs.query({}).then(ts => ts.filter(t => t.url && t.url.startsWith(b + '/lazy'))
      .map(t => ({ discarded: t.discarded }))), base);
    await sw.evaluate(() => chrome.storage.sync.set({ lazyTabs: true }));
    await send(panel, { action: 'applyPreset', presetName: 'Many tabs' });
    await wait(2000);
    const lazy = await lazyState();
    check('a 14-tab layout loads only the front tab', lazy.length === 14 && lazy.filter(t => t.discarded).length === 13, { total: lazy.length, discarded: lazy.filter(t => t.discarded).length });
    await sw.evaluate(() => chrome.storage.sync.set({ lazyTabs: false }));
    await send(panel, { action: 'applyPreset', presetName: 'Many tabs' });
    await wait(2000);
    const eager = await lazyState();
    check('with the setting off, every tab loads', eager.length === 14 && eager.filter(t => t.discarded).length === 0, { total: eager.length, discarded: eager.filter(t => t.discarded).length });
    await sw.evaluate(() => chrome.storage.sync.set({ lazyTabs: true }));
    check('the toolbar icon opens the popup, not the side panel',
      (await sw.evaluate(() => chrome.sidePanel.getPanelBehavior())).openPanelOnActionClick === false);

    // ---- A large library must never lock the extension (undo log is size-capped) ----
    const bigLayout = (i) => ({ windows: Array.from({ length: 4 }, (_, w) => ({ left: 10, top: 10, width: 900, height: 700, displayId: '1',
      tabs: Array.from({ length: 12 }, (_, t) => ({ url: `https://example.com/p${i}/${w}/${t}?q=${'x'.repeat(60)}`, title: `Document ${i} ${w} ${t} with a realistic long title`, active: t === 0 })) })),
      displays: [{ id: '1', isPrimary: true, bounds: { left: 0, top: 0, width: 1920, height: 1080 } }] });
    const bigData = {};
    for (let i = 0; i < 200; i++) bigData[`Big ${String(i).padStart(3, '0')}`] = bigLayout(i);
    await fresh();
    await send(panel, { action: 'importPresets', data: bigData });
    const presetsBytes = await sw.evaluate(() => new Promise(r => chrome.storage.local.getBytesInUse('presets', r)));
    let failures = 0;
    for (let k = 0; k < 12; k++) {
      const r = await send(panel, { action: 'renamePreset', presetName: `Big ${String(k).padStart(3, '0')}`, newName: `Renamed ${k}` });
      if (r.status !== 'success') failures++;
    }
    const totalBytes = await sw.evaluate(() => new Promise(r => chrome.storage.local.getBytesInUse(null, r)));
    check(`12 edits succeed on a ${(presetsBytes / 1048576).toFixed(1)} MB library`, failures === 0, { failures });
    check('storage stays under the 10 MB quota with margin', totalBytes < 9.5 * 1048576, (totalBytes / 1048576).toFixed(2));
    const del = await send(panel, { action: 'deletePreset', presetName: 'Renamed 11' });
    check('delete still works on a large library', del.success === true, del);
    await fresh();

    // ---- Screens info and settings ----
    const screens = await send(panel, { action: 'getDisplays' });
    check('display info is reported with a signature', screens.status === 'success' && typeof screens.signature === 'string', screens);

    // ---- Screenshots for visual review ----
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      // Realistic content for the screenshots (the Evil test above replaced storage).
      await fresh();
      for (const item of lib.slice(0, 4)) await send(panel, { action: 'installPreset', presetName: item.name, layoutData: item.layout });
      await send(panel, { action: 'saveCurrentLayout', presetName: 'Deep work' });
      await popup.reload(); await wait(500);
      await popup.screenshot({ path: path.join(SHOTS, 'popup.png') });
      await panel.reload(); await wait(700);
      await panel.screenshot({ path: path.join(SHOTS, 'sidepanel-presets.png') });
      await panel.click('#tab-library'); await wait(600);
      await panel.screenshot({ path: path.join(SHOTS, 'sidepanel-library.png') });
      await panel.click('#tab-settings'); await wait(400);
      await panel.screenshot({ path: path.join(SHOTS, 'sidepanel-settings.png') });
      await panel.emulateMedia({ colorScheme: 'dark' });
      await panel.click('#tab-presets'); await wait(500);
      await panel.screenshot({ path: path.join(SHOTS, 'sidepanel-presets-dark.png') });
      await panel.emulateMedia({ colorScheme: 'light' });
    }

    check('extension pages raised no uncaught errors', errors.length === 0, errors);
  } finally {
    await ctx.close();
    server.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E harness error:', e); process.exit(2); });
