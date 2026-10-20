// Schematic thumbnail of a layout as an inline SVG string. Only finite numbers
// from a sanitized layout reach the markup, so the string is safe to insert.
const WLM_PREVIEW = (() => {
  function renderPreviewSvg(layout, { width = 160, height = 100 } = {}) {
    const screens = layout.displays.map(d => d.workArea || d.bounds).filter(Boolean);
    const windows = layout.windows.filter(w => [w.left, w.top, w.width, w.height].every(v => typeof v === 'number'));
    if (screens.length === 0 && windows.length === 0) {
      return `<svg viewBox="0 0 ${width} ${height}" class="preview" role="img" aria-label="No preview"></svg>`;
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
    const windowRects = windows.map((w, i) =>
      `<rect class="win${w.focused ? ' focused' : ''}" x="${tx(w).toFixed(1)}" y="${ty(w).toFixed(1)}" width="${Math.max(3, w.width * scale).toFixed(1)}" height="${Math.max(3, w.height * scale).toFixed(1)}" rx="2" data-i="${i}"/>`);

    return `<svg viewBox="0 0 ${width} ${height}" class="preview" role="img" aria-label="Layout preview: ${windows.length} windows">${screenRects.join('')}${windowRects.join('')}</svg>`;
  }

  return { renderPreviewSvg };
})();

if (typeof module !== 'undefined') module.exports = WLM_PREVIEW;
