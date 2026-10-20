// Rasterizes icons/*.svg into the PNG sizes the manifest uses.
// Needs Playwright and a Chromium binary:  CHROME_BIN=... node tools/render-icons.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const jobs = [
  { svg: 'icons/icon.svg', sizes: [16, 48, 128], prefix: 'icons/icon' },
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined });
  const page = await browser.newPage();
  for (const job of jobs) {
    const svg = fs.readFileSync(path.join(root, job.svg), 'utf8');
    for (const size of job.sizes) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
      await page.screenshot({ path: path.join(root, `${job.prefix}${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      console.log('wrote', `${job.prefix}${size}.png`);
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
