// Click-driven checks in real Chromium: every button and dialog path that a user
// reaches, not just the message API. Run with the same setup as tests/e2e.js:
//   xvfb-run -a npm run test:e2e:ui    (CHROME_BIN picks the binary, SCREENSHOT_DIR saves shots)
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
  // A page's title becomes the tab title, so /two gets a title the search can find.
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<title>${req.url === '/two' ? 'Design review notes' : req.url}</title>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'wlm-ui-')), {
    headless: false, executablePath: process.env.CHROME_BIN || undefined,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, '--no-first-run'], viewport: null,
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    const openHost = async (file, w, h) => {
      await sw.evaluate(([u, ww, hh]) => chrome.windows.create({ url: u, type: 'popup', width: ww, height: hh }), [`chrome-extension://${extId}/${file}`, w, h]);
      await wait(800);
      return ctx.pages().find(p => p.url() === `chrome-extension://${extId}/${file}`);
    };
    let popup = await openHost('popup.html', 380, 600);
    const panel = await openHost('sidepanel.html', 400, 780);
    const errors = [];
    for (const p of [popup, panel]) p.on('pageerror', e => errors.push(String(e)));
    const send = (page, msg) => page.evaluate(m => new Promise(r => chrome.runtime.sendMessage(m, r)), msg);
    const storedNames = () => sw.evaluate(() => chrome.storage.local.get('presets')).then(d => Object.keys(d.presets || {}).sort());

    await sw.evaluate(() => chrome.storage.local.clear());
    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true }));
    await sw.evaluate(async (b) => {
      const w = await chrome.windows.create({ url: b + '/a' });
      await chrome.tabs.update(w.tabs[0].id, { pinned: true });
      await chrome.tabs.create({ windowId: w.id, url: b + '/two' });
      await chrome.windows.create({ url: b + '/c' });
    }, base);
    await wait(500);

    // ---- Popup: save, inline errors, full list ----
    await popup.fill('#name', 'Alpha');
    await popup.click('#save-form button[type=submit]');
    await wait(500);
    check('popup saves a new name from the form', (await storedNames()).includes('Alpha'), await storedNames());

    await popup.fill('#name', 'Alpha');
    await popup.click('#save-form button[type=submit]');
    await wait(300);
    const popupErr = await popup.locator('#name-error').textContent();
    check('popup shows the duplicate-name error inline', /already exists/.test(popupErr), popupErr);
    check('popup keeps the typed name after an error', (await popup.inputValue('#name')) === 'Alpha');

    for (const n of ['Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']) {
      await popup.fill('#name', n);
      await popup.click('#save-form button[type=submit]');
      await wait(250);
    }
    await popup.reload(); await wait(500);
    check('popup lists every preset, not only three', (await popup.locator('#quick .quick-item').count()) === 7, await popup.locator('#quick .quick-item').count());

    // ---- Side panel: capture dialog keeps the text on conflict ----
    await panel.click('#tab-presets');
    await panel.click('#capture');
    await wait(300);
    await panel.fill('dialog input', 'Alpha');
    await panel.press('dialog input', 'Enter');
    await wait(300);
    const dialogOpen = await panel.locator('dialog[open]').count();
    const dialogErr = await panel.locator('dialog .field-error').textContent();
    check('capture dialog stays open on a taken name', dialogOpen === 1, dialogOpen);
    check('capture dialog explains the conflict', /already used/.test(dialogErr), dialogErr);
    check('capture dialog keeps the typed name', (await panel.inputValue('dialog input')) === 'Alpha');
    await panel.fill('dialog input', 'Hotel');
    await panel.press('dialog input', 'Enter');
    await wait(600);
    check('capture dialog saves once the name is free', (await storedNames()).includes('Hotel'), await storedNames());

    // ---- Menu: Escape and outside click ----
    const alphaMenu = panel.locator('.preset[data-name="Alpha"] details.menu summary');
    await alphaMenu.click(); await wait(150);
    check('menu opens on click', (await panel.locator('details.menu[open]').count()) === 1);
    await panel.keyboard.press('Escape'); await wait(150);
    check('Escape closes the menu', (await panel.locator('details.menu[open]').count()) === 0);
    check('focus returns to the menu trigger after Escape',
      await panel.evaluate(() => document.activeElement && document.activeElement.tagName === 'SUMMARY'));
    await alphaMenu.click(); await wait(150);
    await panel.mouse.click(10, 760); await wait(150);
    check('an outside click closes the menu', (await panel.locator('details.menu[open]').count()) === 0);

    // ---- Delete is immediate and reversible ----
    await panel.locator('.preset[data-name="Hotel"] details.menu summary').click(); await wait(150);
    await panel.locator('.preset[data-name="Hotel"] .menu-panel [role=menuitem]:has-text("Delete")').click();
    await wait(600);
    check('delete removes the preset (no dialog in the way)', !(await storedNames()).includes('Hotel') && (await panel.locator('dialog[open]').count()) === 0, await storedNames());
    const changeText = await panel.locator('#change-banner p').textContent();
    check('delete offers an undo banner naming the change', /Deleted "Hotel"/.test(changeText), changeText);
    await panel.locator('#change-banner button:has-text("Undo")').click();
    await wait(700);
    check('undo brings the deleted preset back', (await storedNames()).includes('Hotel'), await storedNames());

    // ---- Search over tab titles and URLs ----
    // All eight presets were captured from the same open windows, so they all
    // share the "Design review notes" tab. The search must find every one of them.
    const cardNames = async () => panel.locator('.preset').evaluateAll(els => els.map(e => e.dataset.name));
    await panel.fill('#search', 'design review');
    await wait(300);
    check('search finds presets by a tab title', (await cardNames()).length === 8, await cardNames());
    await panel.fill('#search', '/two');
    await wait(300);
    check('search finds presets by a tab URL', (await cardNames()).length === 8, await cardNames());
    await panel.fill('#search', 'hotel');
    await wait(300);
    check('search by name narrows to one preset', JSON.stringify(await cardNames()) === '["Hotel"]', await cardNames());
    await panel.fill('#search', 'no-such-thing-xyz');
    await wait(300);
    check('search with no match shows a message, not a stale list', (await cardNames()).length === 0 && (await panel.locator('#preset-list').textContent()).includes('Nothing matches'));
    await panel.fill('#search', '');
    await wait(300);

    // ---- Shortcut slot via menu ----
    await panel.locator('.preset[data-name="Charlie"] details.menu summary').click(); await wait(150);
    await panel.locator('.preset[data-name="Charlie"] .menu-panel [role=menuitem]:has-text("Shortcut 2")').click();
    await wait(700);
    check('assigning a shortcut shows a badge on the card', (await panel.locator('.preset[data-name="Charlie"] .badge').textContent()) === 'Shortcut 2');
    const shortcutResult = await sw.evaluate(() => runShortcut(1));
    check('shortcut 2 applies the assigned preset, not the second alphabetical one',
      shortcutResult.success && /"Charlie"/.test(shortcutResult.message), shortcutResult);

    // ---- Remove one tab, then undo ----
    const before = (await send(panel, { action: 'getPresets' })).presets.Alpha;
    const tabsBefore = before.windows.reduce((n, w) => n + w.tabs.length, 0);
    await panel.locator('.preset[data-name="Alpha"] details.tab-details summary').click();
    await panel.locator('.preset[data-name="Alpha"] .tab-remove').first().click();
    await wait(700);
    const after = (await send(panel, { action: 'getPresets' })).presets.Alpha;
    const tabsAfter = after.windows.reduce((n, w) => n + w.tabs.length, 0);
    check('removing a tab removes exactly one tab', tabsAfter === tabsBefore - 1, { tabsBefore, tabsAfter });
    await panel.locator('#change-banner button:has-text("Undo")').click();
    await wait(700);
    const restored = (await send(panel, { action: 'getPresets' })).presets.Alpha;
    check('undo restores the removed tab', restored.windows.reduce((n, w) => n + w.tabs.length, 0) === tabsBefore);

    // ---- Keep-window: the window the request came from stays open ----
    const keepId = await sw.evaluate(() => chrome.windows.create({ url: 'about:blank' }).then(w => w.id));
    await send(panel, { action: 'applyPreset', presetName: 'Bravo', keepWindowId: keepId });
    await wait(800);
    const stillOpen = await sw.evaluate((id) => chrome.windows.get(id).then(w => !!w, () => false), keepId);
    check('the kept window survives an apply that closes others', stillOpen);

    // ---- Import replaces, and the change can be undone ----
    const exportData = { Imported: { windows: [{ tabs: [{ url: 'https://imp.test/' }] }], displays: [] } };
    await send(panel, { action: 'importPresets', data: exportData });
    await panel.reload(); await wait(600);
    check('import adds the preset', (await storedNames()).includes('Imported'));
    const importBanner = await panel.locator('#change-banner p').textContent();
    check('import is announced as an undoable change', /Imported/.test(importBanner), importBanner);
    await panel.locator('#change-banner button:has-text("Undo")').click(); await wait(700);
    check('undoing the import removes it again', !(await storedNames()).includes('Imported'));

    // ---- Library add offers a View action ----
    await panel.click('#tab-library'); await wait(300);
    await panel.locator('.library-card button').first().click(); await wait(700);
    const toastAction = await panel.locator('#toast .toast-action').count();
    check('library add shows a View action', toastAction === 1, toastAction);
    await panel.locator('#toast .toast-action').click(); await wait(300);
    check('View action returns to the Presets tab', await panel.locator('#panel-presets').isVisible());

    // ---- Settings: no toast on every change ----
    await panel.click('#tab-settings'); await wait(200);
    await panel.click('label:has(input[value="merge"])'); await wait(400);
    const toastAfterSetting = await panel.locator('#toast').evaluate(el => el.className);
    check('changing a setting does not show a toast', /hidden/.test(toastAfterSetting), toastAfterSetting);
    await panel.click('label:has(input[value="close_all"])'); await wait(200);

    // ---- Smart popup: a name suggestion and a match with the saved preset ----
    await sw.evaluate(async (b) => { await chrome.tabs.create({ url: b + '/fresh-tab' }); }, base);
    await wait(500);
    await popup.reload(); await wait(900);
    const matchText = (await popup.locator('#match-text').textContent()) || '';
    check('popup notices the windows drifted from a saved preset', /Looks like/.test(matchText) && /1 new/.test(matchText), matchText);
    check('popup offers to update that preset', await popup.locator('#match-update').isVisible());
    await popup.locator('#match-update').click(); await wait(700);
    check('updating from the popup matches again afterwards', /match/.test((await popup.locator('#match-text').textContent()) || ''), await popup.locator('#match-text').textContent());
    await sw.evaluate(() => chrome.storage.local.set({ presets: {} }));
    await popup.reload(); await wait(900);
    const chip = (await popup.locator('#suggest').textContent()) || '';
    check('popup suggests a name from the open sites', /Name it "127\.0\.0\.1"/.test(chip), chip);
    await popup.locator('#suggest').click();
    check('the suggestion fills the name field', (await popup.inputValue('#name')) === '127.0.0.1');
    await popup.fill('#name', '');

    // ---- First apply asks how to treat open windows ----
    await send(popup, { action: 'saveCurrentLayout', presetName: 'Alpha' });
    await sw.evaluate(() => chrome.storage.sync.clear());
    await popup.reload(); await wait(700);
    await popup.locator('#quick .quick-item button:has-text("Apply")').first().click(); await wait(500);
    check('the first apply asks how layouts should be applied', (await popup.locator('dialog[open] input[type=radio]').count()) === 3);
    await popup.locator('dialog[open] input[value="merge"]').check();
    await popup.locator('dialog[open] .btn-primary').click();
    for (let i = 0; i < 30 && !popup.isClosed(); i++) await wait(150); // closes itself ~700 ms after a successful apply
    const choice = await sw.evaluate(() => chrome.storage.sync.get(['presetBehavior', 'behaviorConfirmed']));
    check('the choice is saved and confirmed', choice.presetBehavior === 'merge' && choice.behaviorConfirmed === true, choice);
    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true }));
    // The popup closes itself after a successful apply, as it should. Open a new one.
    check('the popup closes itself after applying', popup.isClosed());
    popup = await openHost('popup.html', 380, 600);
    popup.on('pageerror', e => errors.push(String(e)));
    await send(popup, { action: 'deletePreset', presetName: 'Alpha' });
    await sw.evaluate(() => chrome.storage.local.remove(['undoLog', 'lastSession']));

    // ---- Welcome page ----
    const welcome = await ctx.newPage();
    await welcome.goto(`chrome-extension://${extId}/welcome.html`);
    await sw.evaluate(() => chrome.storage.sync.clear());
    await welcome.reload(); await wait(400);
    check('welcome page shows the three choices', (await welcome.locator('input[name=behavior]').count()) === 3);
    await welcome.locator('input[value="smart_close_pinned"]').check();
    await welcome.click('#finish'); await wait(400);
    const welcomeSaved = await sw.evaluate(() => chrome.storage.sync.get(['presetBehavior', 'behaviorConfirmed']));
    check('welcome page saves the choice', welcomeSaved.presetBehavior === 'smart_close_pinned' && welcomeSaved.behaviorConfirmed === true, welcomeSaved);
    await welcome.close();
    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true }));

    // ---- Put back the presets the screenshots use ----
    await sw.evaluate(() => chrome.storage.local.clear());
    for (const n of ['Alpha', 'Bravo', 'Charlie']) await send(popup, { action: 'saveCurrentLayout', presetName: n });

    // ---- Long lists render in pages ----
    const manyData = {};
    for (let i = 0; i < 120; i++) manyData[`Many ${String(i).padStart(3, '0')}`] = { windows: [{ tabs: [{ url: `https://m.test/${i}` }] }], displays: [] };
    await send(panel, { action: 'importPresets', data: manyData });
    await panel.reload(); await wait(900);
    const firstPage = await panel.locator('#preset-list .preset').count();
    check('a long list shows one page at first', firstPage === 50, firstPage);
    await panel.locator('#preset-list > button:has-text("Show")').click(); await wait(400);
    check('"Show more" reveals the next page', (await panel.locator('#preset-list .preset').count()) === 100);
    await panel.fill('#search', 'Many 119'); await wait(300);
    check('search still reaches presets beyond the first page', (await panel.locator('#preset-list .preset').count()) === 1);
    await panel.fill('#search', '');
    await sw.evaluate(async () => {
      const { presets } = await chrome.storage.local.get('presets');
      for (const key of Object.keys(presets)) if (key.startsWith('Many ')) delete presets[key];
      await chrome.storage.local.set({ presets });
    });

    // ---- Screenshots for review ----
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await popup.reload(); await wait(500);
      await popup.screenshot({ path: path.join(SHOTS, 'ui-popup.png') });
      await panel.reload(); await wait(600);
      await panel.click('#tab-presets'); await wait(300);
      await panel.locator('.preset[data-name="Alpha"] details.menu summary').click(); await wait(200);
      await panel.screenshot({ path: path.join(SHOTS, 'ui-panel-menu.png') });
      await panel.keyboard.press('Escape');
      await panel.emulateMedia({ colorScheme: 'dark' }); await wait(400);
      await panel.screenshot({ path: path.join(SHOTS, 'ui-panel-dark.png') });
      await popup.emulateMedia({ colorScheme: 'dark' }); await wait(300);
      await popup.screenshot({ path: path.join(SHOTS, 'ui-popup-dark.png') });
      await popup.emulateMedia({ colorScheme: 'light' });

      const welcomeShot = await ctx.newPage();
      await welcomeShot.setViewportSize({ width: 1000, height: 1000 });
      await welcomeShot.goto(`chrome-extension://${extId}/welcome.html`); await wait(700);
      await welcomeShot.screenshot({ path: path.join(SHOTS, 'ui-welcome.png') });
      await welcomeShot.emulateMedia({ colorScheme: 'dark' }); await wait(300);
      await welcomeShot.screenshot({ path: path.join(SHOTS, 'ui-welcome-dark.png') });
      await welcomeShot.close();

      await sw.evaluate(() => chrome.storage.local.clear());
      await popup.reload(); await panel.reload(); await wait(800);
      await popup.screenshot({ path: path.join(SHOTS, 'ui-popup-empty.png') });
      await panel.emulateMedia({ colorScheme: 'light' });
      await panel.screenshot({ path: path.join(SHOTS, 'ui-panel-empty.png') });
    }

    check('extension pages raised no uncaught errors', errors.length === 0, errors);
  } finally {
    await ctx.close();
    server.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} UI checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('UI harness error:', e); process.exit(2); });
