// End-to-end checks in real Chromium. Needs Playwright and a display:
//   npm i --no-save playwright && xvfb-run -a npm run test:e2e
// Set CHROME_BIN to use a specific Chrome/Chromium binary.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const EXT_DIR = path.resolve(__dirname, '..');
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ' :: ' + JSON.stringify(detail)}`);
};

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

    // The popup runs in a popup-type window so that closing normal windows
    // during apply does not close the page that drives the test.
    await sw.evaluate(u => chrome.windows.create({ url: u, type: 'popup', width: 380, height: 600 }), `chrome-extension://${extId}/popup.html`);
    await new Promise(r => setTimeout(r, 800));
    const page = ctx.pages().find(p => p.url().startsWith(`chrome-extension://${extId}/popup.html`));
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    const send = msg => page.evaluate(m => new Promise(r => chrome.runtime.sendMessage(m, r)), msg);
    const fresh = () => sw.evaluate(() => chrome.storage.local.clear());
    const normalWindows = () => sw.evaluate(() => chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
      .then(ws => ws.map(w => ({ tabs: w.tabs.map(t => ({ url: t.url, pinned: t.pinned })) }))));

    // Scenario: two windows, the first with a pinned first tab.
    await fresh();
    await sw.evaluate(async base => {
      const w = await chrome.windows.create({ url: base + '/a' });
      await chrome.tabs.update(w.tabs[0].id, { pinned: true });
      await chrome.tabs.create({ windowId: w.id, url: base + '/b', active: true });
      await chrome.windows.create({ url: base + '/c' });
    }, base);
    await new Promise(r => setTimeout(r, 600));

    const cap = await send({ action: 'captureLayout' });
    check('capture succeeds', cap.status === 'success', cap);
    const saved = await send({ action: 'savePreset', presetName: 'Work', layoutData: cap.layout });
    check('save succeeds', saved.status === 'success' && saved.success === true, saved);

    const dup = await send({ action: 'savePreset', presetName: 'Work', layoutData: cap.layout });
    check('saving an existing name is refused with an error status', dup.status === 'error' && dup.success === false, dup);

    const applied = await send({ action: 'applyPreset', presetName: 'Work' });
    check('apply succeeds', applied.status === 'success', applied);
    await new Promise(r => setTimeout(r, 1500));
    const after = await normalWindows();
    const urls = after.flatMap(w => w.tabs.map(t => t.url));
    check('restored windows contain every saved URL', ['/a', '/b', '/c'].every(p => urls.some(u => u && u.endsWith(p))), urls);
    const restoredFirst = after.flatMap(w => w.tabs).find(t => t.url && t.url.endsWith('/a'));
    check('pinned flag survives on the restored first tab', !!(restoredFirst && restoredFirst.pinned), restoredFirst);

    // Concurrent writes must not drop each other.
    await fresh();
    await page.evaluate((layout) => Promise.all(Array.from({ length: 8 }, (_, i) => new Promise(r =>
      chrome.runtime.sendMessage({ action: 'savePreset', presetName: 'P' + i, layoutData: layout }, r)))), cap.layout);
    const stored = await sw.evaluate(() => chrome.storage.local.get('presets')).then(d => Object.keys(d.presets || {}).length);
    check('8 concurrent saves all persist', stored === 8, { stored });

    // Imported presets with non-web URLs are dropped, and applying opens nothing local.
    await fresh();
    const imp = await send({ action: 'importPresets', data: { Evil: { windows: [{ tabs: [{ url: 'file:///etc/hostname' }] }], displays: [] } } });
    check('import with only file: URLs is not stored', imp.success === false || !(await send({ action: 'getPresets' })).presets.Evil, imp);
    await sw.evaluate(() => chrome.storage.local.set({ presets: { Evil: { windows: [{ tabs: [{ url: 'file:///etc/hostname' }] }], displays: [] } } }));
    const evilApply = await send({ action: 'applyPreset', presetName: 'Evil' });
    check('applying a stored file: preset is refused', evilApply.status === 'error', evilApply);
    await new Promise(r => setTimeout(r, 1500));
    const tabUrls = await sw.evaluate(() => chrome.tabs.query({}).then(ts => ts.map(t => t.url)));
    check('no file: tab is opened', !tabUrls.some(u => u && u.startsWith('file:')), tabUrls);

    check('popup page raised no uncaught errors', pageErrors.length === 0, pageErrors);
  } finally {
    await ctx.close();
    server.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E harness error:', e); process.exit(2); });
