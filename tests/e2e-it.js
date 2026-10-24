// Italian run in real Chromium (--lang=it): the pages must show Italian, and
// no static English string that has a translation may be left on screen.
//   xvfb-run -a npm run test:e2e:it    (SCREENSHOT_DIR saves screenshots)
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

// Every text node and label on the page, excluding scripts.
const visibleStrings = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.nodeValue.trim();
    const tag = walker.currentNode.parentNode.nodeName;
    if (text && tag !== 'SCRIPT' && tag !== 'STYLE') out.push(text);
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const attr of ['placeholder', 'title', 'aria-label']) if (el.getAttribute(attr)) out.push(el.getAttribute(attr));
  }
  return out;
};

async function main() {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'wlm-it-')), {
    headless: false, executablePath: process.env.CHROME_BIN || undefined, locale: 'it-IT',
    // On Linux Chrome takes its UI language from LANGUAGE; this makes the service worker Italian too.
    env: { ...process.env, LANGUAGE: 'it', LC_ALL: 'it_IT.UTF-8', LANG: 'it_IT.UTF-8' },
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, '--no-first-run', '--lang=it'], viewport: null,
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    const lang = await sw.evaluate(() => chrome.i18n.getUILanguage());
    check('the browser reports an Italian UI language', lang.startsWith('it'), lang);

    const openHost = async (file, w, h) => {
      await sw.evaluate(([u, ww, hh]) => chrome.windows.create({ url: u, type: 'popup', width: ww, height: hh }), [`chrome-extension://${extId}/${file}`, w, h]);
      await wait(800);
      return ctx.pages().find(p => p.url() === `chrome-extension://${extId}/${file}`);
    };
    const popup = await openHost('popup.html', 380, 640);
    const panel = await openHost('sidepanel.html', 400, 780);
    const errors = [];
    for (const p of [popup, panel]) p.on('pageerror', e => errors.push(String(e)));
    const send = (page, msg) => page.evaluate(m => new Promise(r => chrome.runtime.sendMessage(m, r)), msg);

    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true }));
    await sw.evaluate(() => chrome.storage.local.clear());
    await sw.evaluate(async () => {
      await chrome.windows.create({ url: 'http://127.0.0.1:1/a' });
    });
    await wait(300);

    // ---- Static text and the messages the background produces ----
    const saved = await send(popup, { action: 'saveCurrentLayout', presetName: 'Lavoro' });
    check('the background answers in Italian', /salvato/.test(saved.message), saved.message);
    const dup = await send(popup, { action: 'saveCurrentLayout', presetName: 'Lavoro' });
    check('errors are Italian too', /esiste già/.test(dup.message), dup.message);
    await popup.reload(); await panel.reload(); await wait(900);

    const popupText = await popup.evaluate(visibleStrings);
    check('popup: save button and card titles are Italian', popupText.includes('Salva') && popupText.includes('Salva questo layout') && popupText.includes('Preset'), popupText);
    check('popup: counts are inflected', popupText.some(s => /1 finestra · 1 tab/.test(s)), popupText);

    // Text that must not stay in English: any static string that has a different Italian translation.
    const leftovers = async (page) => page.evaluate((fn) => {
      const dict = I18N.dictionaries.it;
      const strings = (new Function('return ' + fn))()();
      return strings.filter(s => dict[s] && dict[s] !== s);
    }, visibleStrings.toString());
    const leftPopup = await leftovers(popup);
    check('popup: no translatable English text is left', leftPopup.length === 0, leftPopup);

    for (const tab of ['presets', 'library', 'settings', 'data']) {
      await panel.click(`#tab-${tab}`); await wait(500);
      const left = await leftovers(panel);
      check(`side panel (${tab}): no translatable English text is left`, left.length === 0, left);
    }
    const tabNames = await panel.locator('.tab').allTextContents();
    check('side panel tabs are Italian', JSON.stringify(tabNames) === JSON.stringify(['Preset', 'Libreria', 'Impostazioni', 'Dati']), tabNames);

    // ---- The library uses the Italian names and can be installed under them ----
    await panel.click('#tab-library'); await wait(500);
    const libraryNames = await panel.locator('.library-card .preset-name').allTextContents();
    check('library entries are translated', libraryNames.includes('Revisione del codice') && libraryNames.includes('Riunione'), libraryNames);
    await panel.locator('.library-card button').first().click(); await wait(800);
    await panel.click('#tab-presets'); await wait(400);
    const names = await panel.locator('#preset-list .preset-name').allTextContents();
    check('a library preset is installed under its Italian name', names.includes('Revisione del codice'), names);
    const toastText = await panel.locator('#toast').textContent();
    check('the confirmation names the Italian preset', /Revisione del codice/.test(toastText), toastText);

    // ---- Delete and undo banner ----
    await panel.locator('.preset[data-name="Lavoro"] details.menu summary').click(); await wait(200);
    await panel.locator('.preset[data-name="Lavoro"] .menu-panel [role=menuitem]:has-text("Elimina")').click(); await wait(600);
    const banner = await panel.locator('#change-banner p').textContent();
    check('the undo banner is Italian', /Eliminato "Lavoro"/.test(banner), banner);

    // ---- Welcome page ----
    const welcome = await ctx.newPage();
    await welcome.goto(`chrome-extension://${extId}/welcome.html`); await wait(700);
    const welcomeText = await welcome.evaluate(visibleStrings);
    check('welcome page headline is Italian', welcomeText.includes('Le tue finestre, esattamente come le avevi lasciate.'), welcomeText.slice(0, 5));
    const leftWelcome = await leftovers(welcome);
    check('welcome page: no translatable English text is left', leftWelcome.length === 0, leftWelcome);
    check('the document language is set', (await welcome.evaluate(() => document.documentElement.lang)) === 'it');

    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await popup.screenshot({ path: path.join(SHOTS, 'it-popup.png') });
      await panel.screenshot({ path: path.join(SHOTS, 'it-panel.png') });
      await welcome.setViewportSize({ width: 1000, height: 1000 });
      await welcome.screenshot({ path: path.join(SHOTS, 'it-welcome.png') });
      // Every string on screen, for a manual read for anything left in English.
      fs.writeFileSync(path.join(SHOTS, 'it-strings.txt'), [...new Set([...popupText, ...welcomeText, ...await panel.evaluate(visibleStrings)])].join('\n'));
    }
    check('extension pages raised no uncaught errors', errors.length === 0, errors);
  } finally {
    await ctx.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} Italian checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Italian harness error:', e); process.exit(2); });
