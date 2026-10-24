// Schematic thumbnail of a layout as an inline SVG string. Only finite numbers
// and escaped text from a sanitized layout reach the markup, so the string is
// safe to insert. Each window is coloured by the site it is mostly about and
// carries that site's initial, so two layouts are easy to tell apart.
const WLM_PREVIEW = (() => {
  const i18n = typeof require === 'function' ? require('./i18n.js') : I18N;
  const t = i18n.t;
  // Eight hues that stay legible next to each other, picked by a hash of the site.
  const HUES = [221, 262, 172, 340, 24, 190, 142, 290];

  function hueFor(site) {
    let hash = 0;
    for (const ch of site) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return HUES[hash % HUES.length];
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function renderPreviewSvg(layout, { width = 160, height = 100 } = {}) {
    const screens = layout.displays.map(d => d.workArea || d.bounds).filter(Boolean);
    const windows = layout.windows.filter(w => [w.left, w.top, w.width, w.height].every(v => typeof v === 'number'));
    if (screens.length === 0 && windows.length === 0) {
      return `<svg viewBox="0 0 ${width} ${height}" class="preview" role="img" aria-label="${escapeText(t('No preview'))}"></svg>`;
    }

    const boxes = [...screens, ...windows.map(w => ({ left: w.left, top: w.top, width: w.width, height: w.height }))];
    const minX = Math.min(...boxes.map(b => b.left));
    const minY = Math.min(...boxes.map(b => b.top));
    const maxX = Math.max(...boxes.map(b => b.left + b.width));
    const maxY = Math.max(...boxes.map(b => b.top + b.height));
    const pad = 4;
    const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
    const offX = pad + ((width - pad * 2) - (maxX - minX) * scale) / 2;
    const offY = pad + ((height - pad * 2) - (maxY - minY) * scale) / 2;
    const tx = b => (b.left - minX) * scale + offX;
    const ty = b => (b.top - minY) * scale + offY;

    const screenRects = screens.map(s =>
      `<rect class="screen" x="${tx(s).toFixed(1)}" y="${ty(s).toFixed(1)}" width="${(s.width * scale).toFixed(1)}" height="${(s.height * scale).toFixed(1)}" rx="3"/>`);

    const windowShapes = windows.map((w, i) => {
      const site = typeof WLM !== 'undefined' ? WLM.windowSite(w) : '';
      const hue = hueFor(site || String(i));
      const x = tx(w);
      const y = ty(w);
      const ww = Math.max(3, w.width * scale);
      const wh = Math.max(3, w.height * scale);
      const rect = `<rect class="win${w.focused ? ' focused' : ''}" style="--h:${hue}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${wh.toFixed(1)}" rx="2" data-i="${i}"/>`;
      const showLetter = site && ww >= 16 && wh >= 14;
      const letter = showLetter
        ? `<text class="win-letter" x="${(x + ww / 2).toFixed(1)}" y="${(y + wh / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(14, Math.min(ww, wh) * 0.55).toFixed(1)}">${escapeText(site.charAt(0).toUpperCase())}</text>`
        : '';
      return rect + letter;
    });

    return `<svg viewBox="0 0 ${width} ${height}" class="preview" role="img" aria-label="${escapeText(t('Layout preview: {windows}', { windows: i18n.count(windows.length, 'window') }))}">${screenRects.join('')}${windowShapes.join('')}</svg>`;
  }

  return { renderPreviewSvg, hueFor };
})();

if (typeof module !== 'undefined') module.exports = WLM_PREVIEW;
