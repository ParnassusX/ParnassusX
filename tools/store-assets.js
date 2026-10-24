// Generates the Chrome Web Store images from the real extension UI:
//   five 1280x800 screenshots, a 440x280 small promo tile and a 1400x560 marquee.
//   LANG_CODE=en|it  CHROME_BIN=...  xvfb-run -a node tools/store-assets.js
// Needs Playwright. Output: store/<lang>/*.jpg
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const LANG = process.env.LANG_CODE || 'en';
const OUT = path.join(root, 'store', LANG);
const wait = ms => new Promise(r => setTimeout(r, ms));

const COPY = {
  en: {
    tagline: 'Your windows, exactly how you left them.',
    shots: [
      ['Save a layout.<br>Bring it back in one click.', 'Windows, tabs, positions and screens.'],
      ['Ready-made layouts for the way you work', 'Code review, writing, planning, meetings and more.'],
      ['Adapts to any screen', 'New monitor? Smaller laptop? Windows scale to fit.'],
      ['Undo anything', 'Delete, rename, import, replace. One click brings it back.'],
      ['Private. Light or dark.', 'Everything stays on your device. No account, no tracking.'],
    ],
    promoSub: 'Save and restore window layouts',
  },
  it: {
    tagline: 'Le tue finestre, esattamente come le avevi lasciate.',
    shots: [
      ['Salva un layout.<br>Ripristinalo con un clic.', 'Finestre, tab, posizioni e schermi.'],
      ['Layout pronti per come lavori', 'Revisione, scrittura, pianificazione, riunioni e altro.'],
      ['Si adatta a qualsiasi schermo', 'Nuovo monitor? Portatile più piccolo? Le finestre si adattano.'],
      ['Annulla qualsiasi cosa', 'Elimina, rinomina, importa, sostituisci. Un clic e torna tutto.'],
      ['Privato. Chiaro o scuro.', 'Tutto resta sul tuo dispositivo. Nessun account, nessun tracciamento.'],
    ],
    promoSub: 'Salva e ripristina i layout delle finestre',
  },
}[LANG];

const FRAME_CSS = `
  *{box-sizing:border-box;margin:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;overflow:hidden}
  .bg{position:absolute;inset:0;background:radial-gradient(120% 140% at 10% 0%,#6366f1 0%,#4338ca 52%,#2e2a8a 100%)}
  .brand{position:absolute;display:flex;align-items:center;gap:12px;font-weight:650;font-size:20px;letter-spacing:-.01em}
  .brand img{width:40px;height:40px;border-radius:10px;box-shadow:0 6px 16px rgba(0,0,0,.3)}
  h2{font-weight:750;letter-spacing:-.025em;line-height:1.08;text-wrap:balance}
  p.sub{color:#e0e7ff;line-height:1.35;text-wrap:balance}
  .shot{position:absolute;border-radius:14px;box-shadow:0 24px 60px rgba(8,6,50,.55),0 0 0 1px rgba(255,255,255,.12);background:#fff;overflow:hidden}
  .shot img{display:block;width:100%;height:100%}
  .amber{position:absolute;border-radius:14px;background:#fbbf24;opacity:.95}
`;

function page(width, height, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_CSS}html,body{width:${width}px;height:${height}px}</style></head><body><div class="bg"></div>${body}</body></html>`;
}
const uri = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'wlm-store-raw-'));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'wlm-store-')), {
    headless: false, executablePath: process.env.CHROME_BIN || undefined, locale: LANG === 'it' ? 'it-IT' : 'en-US', viewport: null,
    env: { ...process.env, LANGUAGE: LANG, LC_ALL: LANG === 'it' ? 'it_IT.UTF-8' : 'en_US.UTF-8' },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run', '--force-device-scale-factor=2'],
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    const open = async (file, w, h) => {
      await sw.evaluate(([u, ww, hh]) => chrome.windows.create({ url: u, type: 'popup', width: ww, height: hh }), [`chrome-extension://${extId}/${file}`, w, h]);
      for (let i = 0; i < 40; i++) {
        const found = ctx.pages().find(p => p.url() === `chrome-extension://${extId}/${file}`);
        if (found) { await wait(500); return found; }
        await wait(150);
      }
      throw new Error(`The page ${file} did not open`);
    };
    const popup = await open('popup.html', 380, 640);
    const panel = await open('sidepanel.html', 400, 780);
    const send = (page, m) => page.evaluate(x => new Promise(r => chrome.runtime.sendMessage(x, r)), m);

    // ---- Realistic content: library layouts, then one state per screenshot ----
    await sw.evaluate(() => chrome.storage.sync.set({ presetBehavior: 'close_all', behaviorConfirmed: true, theme: 'system' }));
    await sw.evaluate(() => chrome.storage.local.clear());
    const library = JSON.parse(fs.readFileSync(path.join(root, 'library', 'presets.json'), 'utf8')).presets;
    const nameOf = id => { const item = library.find(x => x.id === id); return (item.translations && item.translations[LANG] && item.translations[LANG].name) || item.name; };
    for (const id of ['code-review', 'writing-with-sources', 'daily-planning', 'presentation-prep', 'meeting-focus', 'reading-session']) {
      const item = library.find(x => x.id === id);
      await send(panel, { action: 'installPreset', presetName: nameOf(id), layoutData: item.layout });
    }
    await send(panel, { action: 'setShortcutSlot', index: 1, presetName: nameOf('code-review') });
    await send(panel, { action: 'setShortcutSlot', index: 2, presetName: nameOf('daily-planning') });
    await send(panel, { action: 'setShortcutSlot', index: 3, presetName: nameOf('meeting-focus') });
    const clearHistory = () => sw.evaluate(() => chrome.storage.local.remove(['undoLog', 'lastSession']));
    const search = async value => { await panel.fill('#search', value); await wait(450); };
    const dims = file => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
    const shot = async (page, file) => { await page.screenshot({ path: path.join(raw, file) }); return path.join(raw, file); };

    // 1, 2, 5: a clean library of presets, no banners
    await clearHistory(); await popup.reload(); await panel.reload(); await wait(1300);
    const popupShot = await shot(popup, 'popup.png');
    const panelShot = await shot(panel, 'panel.png');
    await panel.click('#tab-library'); await wait(800);
    const libraryShot = await shot(panel, 'library.png');
    await panel.click('#tab-presets'); await wait(500);
    await panel.emulateMedia({ colorScheme: 'dark' }); await wait(600);
    const darkShot = await shot(panel, 'dark.png');
    await panel.emulateMedia({ colorScheme: 'light' }); await wait(300);

    // 3: a preset saved on a larger screen, flagged and scaled
    const home = LANG === 'it' ? 'Studio a casa' : 'Home office';
    const wide = { id: 'wide', isPrimary: true, bounds: { left: 0, top: 0, width: 2560, height: 1440 }, workArea: { left: 0, top: 0, width: 2560, height: 1400 } };
    await send(panel, { action: 'importPresets', data: { [home]: { displays: [wide], windows: [
      { left: 0, top: 0, width: 1280, height: 1400, state: 'normal', displayId: 'wide', tabs: [{ url: 'https://github.com/pulls', title: 'Pull requests' }, { url: 'https://github.com/notifications', title: 'Notifications' }] },
      { left: 1280, top: 0, width: 1280, height: 700, state: 'normal', displayId: 'wide', tabs: [{ url: 'https://docs.google.com/document', title: 'Notes' }] },
      { left: 1280, top: 700, width: 1280, height: 700, state: 'normal', displayId: 'wide', tabs: [{ url: 'https://mail.google.com/', title: 'Inbox' }] },
    ] } } });
    await clearHistory(); await panel.reload(); await wait(1000);
    await search(LANG === 'it' ? 'casa' : 'home');
    const screensShot = await shot(panel, 'screens.png');
    await search('');

    // 4: a deletion, with its Undo banner
    await send(panel, { action: 'deletePreset', presetName: nameOf('reading-session') });
    await panel.reload(); await wait(1000);
    const undoShot = await shot(panel, 'undo.png');

    // Compose. Frame sizes come from the real image proportions.
    const compose = await ctx.newPage();
    const brandIcon = uri(path.join(root, 'icons', 'icon128.png'));
    const brand = (left, top) => `<div class="brand" style="left:${left}px;top:${top}px"><img src="${brandIcon}" alt=""><span>Window Layout Manager</span></div>`;
    const text = (h, sub, left, top, width, hSize = 54) => `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px"><h2 style="font-size:${hSize}px">${h}</h2><p class="sub" style="font-size:22px;margin-top:18px">${sub}</p></div>`;
    const frame = (src, left, top, height) => { const d = dims(src); const width = Math.round(height * d.w / d.h); return `<div class="shot" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"><img src="${uri(src)}" alt=""></div>`; };
    const render = async (file, w, h, html) => {
      await compose.setViewportSize({ width: w, height: h });
      await compose.setContent(page(w, h, html));
      await wait(250);
      await compose.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 94, scale: 'css' });
      console.log('wrote', path.join('store', LANG, file));
    };

    // Hero image for the website: the two windows alone, on a transparent background.
    // The canvas has room around them so their shadows are not cut off.
    {
      const hp = 520; const hn = 490; const ov = 36; const pad = 72;
      const wp = Math.round(hp * dims(popupShot).w / dims(popupShot).h);
      const wn = Math.round(hn * dims(panelShot).w / dims(panelShot).h);
      const total = wp + wn - ov + pad * 2;
      const height = 50 + Math.max(hp, hn) + pad * 2;
      await compose.setViewportSize({ width: total, height });
      await compose.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_CSS}html,body{width:${total}px;height:${height}px;background:transparent}</style></head><body>`
        + frame(popupShot, pad, pad, hp) + frame(panelShot, pad + wp - ov, pad + 50, hn) + '</body></html>');
      await wait(250);
      await compose.screenshot({ path: path.join(OUT, 'hero.png'), omitBackground: true, scale: 'css' });
      console.log('wrote', path.join('store', LANG, 'hero.png'));
    }

    const [c1, c2, c3, c4, c5] = COPY.shots;
    // Two overlapping windows, sized from their real proportions and kept inside the canvas.
    const widthAt = (file, height) => Math.round(height * dims(file).w / dims(file).h);
    let hPopup = 560;
    let hPanel = 520;
    const overlap = 36;
    while (widthAt(popupShot, hPopup) + widthAt(panelShot, hPanel) - overlap > 1280 - 24 - 560) { hPopup -= 10; hPanel -= 10; }
    const x0 = 1280 - 24 - (widthAt(popupShot, hPopup) + widthAt(panelShot, hPanel) - overlap);
    await render('screenshot-1.jpg', 1280, 800, brand(64, 56) + text(c1[0], c1[1], 64, 250, 470)
      + frame(popupShot, x0, 100, hPopup) + frame(panelShot, x0 + widthAt(popupShot, hPopup) - overlap, 190, hPanel));
    await render('screenshot-2.jpg', 1280, 800, brand(64, 56) + text(c2[0], c2[1], 64, 250, 470) + frame(libraryShot, 700, 50, 700));
    await render('screenshot-3.jpg', 1280, 800, brand(64, 56) + text(c3[0], c3[1], 64, 250, 470) + frame(screensShot, 660, 90, 620));
    await render('screenshot-4.jpg', 1280, 800, brand(64, 56) + text(c4[0], c4[1], 64, 250, 470) + frame(undoShot, 700, 50, 700));
    await render('screenshot-5.jpg', 1280, 800, brand(64, 56) + text(c5[0], c5[1], 64, 250, 470) + frame(darkShot, 700, 50, 700));
    // Small promo tile 440x280
    await render('promo-small.jpg', 440, 280, `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px"><img src="${brandIcon}" alt="" style="width:76px;height:76px;border-radius:19px;box-shadow:0 10px 28px rgba(0,0,0,.35)"><h2 style="font-size:28px;margin-top:14px">Window Layout Manager</h2><p class="sub" style="font-size:15px;margin-top:8px">${COPY.promoSub}</p></div>`);
    // Marquee 1400x560
    await render('promo-marquee.jpg', 1400, 560, `<div style="position:absolute;left:80px;top:150px;width:640px"><div class="brand" style="position:static;margin-bottom:22px"><img src="${brandIcon}" alt=""><span>Window Layout Manager</span></div><h2 style="font-size:54px">${COPY.tagline}</h2></div>` + frame(panelShot, 880, 40, 480));
  } finally {
    await ctx.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
