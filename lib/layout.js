// Pure helpers for layouts and presets. No chrome.* calls here, so the
// logic can be unit tested with `node --test`. Loaded by background.js via
// importScripts() and by tests via require().
const WLM = (() => {
  const ALLOWED_PROTOCOLS = ['http:', 'https:'];
  const WINDOW_STATES = ['normal', 'maximized', 'fullscreen', 'minimized'];
  const MAX_NAME_LENGTH = 100;
  const RESERVED_NAMES = ['__proto__', 'constructor', 'prototype'];

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  // Only web URLs are restored. Imported files are untrusted, so file:,
  // chrome:, javascript: and the rest are dropped.
  function sanitizeUrl(value) {
    if (typeof value !== 'string' || value.length === 0) return null;
    try {
      return ALLOWED_PROTOCOLS.includes(new URL(value).protocol) ? value : null;
    } catch (e) {
      return null;
    }
  }

  function validatePresetName(name) {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return null;
    if (RESERVED_NAMES.includes(trimmed)) return null;
    return trimmed;
  }

  // Returns a cleaned copy of a layout, or null when nothing usable remains.
  // Tab flags stay aligned with the tabs that survive sanitizing.
  function sanitizeLayout(layout) {
    if (!layout || typeof layout !== 'object') return null;
    if (!Array.isArray(layout.windows) || !Array.isArray(layout.displays)) return null;

    const windows = [];
    for (const win of layout.windows) {
      if (!win || typeof win !== 'object' || !Array.isArray(win.tabs)) continue;
      const tabs = win.tabs
        .map(tab => ({
          url: sanitizeUrl(tab && tab.url),
          active: !!(tab && tab.active),
          pinned: !!(tab && tab.pinned),
        }))
        .filter(tab => tab.url !== null);
      if (tabs.length === 0) continue;

      windows.push({
        left: isFiniteNumber(win.left) ? win.left : undefined,
        top: isFiniteNumber(win.top) ? win.top : undefined,
        width: isFiniteNumber(win.width) ? win.width : undefined,
        height: isFiniteNumber(win.height) ? win.height : undefined,
        state: WINDOW_STATES.includes(win.state) ? win.state : 'normal',
        focused: win.focused === true,
        displayId: (typeof win.displayId === 'string' || typeof win.displayId === 'number')
          ? String(win.displayId) : undefined,
        tabs,
      });
    }
    if (windows.length === 0) return null;

    const displays = layout.displays
      .filter(d => d && typeof d === 'object')
      .map(d => ({ id: String(d.id), isPrimary: d.isPrimary === true, bounds: d.bounds, workArea: d.workArea }));

    return { windows, displays };
  }

  // Which display contains the window centre. A left/top of 0 is valid,
  // so the check is numeric rather than truthy.
  function getDisplayForWindow(win, displays) {
    const fallback = (displays.find(d => d.isPrimary) || displays[0] || {}).id ?? null;
    if (!win || !displays || displays.length === 0) return fallback;
    if (![win.left, win.top, win.width, win.height].every(isFiniteNumber)) return fallback;

    const centerX = win.left + win.width / 2;
    const centerY = win.top + win.height / 2;
    for (const display of displays) {
      const area = display.workArea || display.bounds;
      if (!area) continue;
      if (centerX >= area.left && centerX < area.left + area.width &&
          centerY >= area.top && centerY < area.top + area.height) {
        return display.id;
      }
    }
    return fallback;
  }

  // Decides where a saved window goes on the current screens. Falls back to
  // the primary display when the original one is gone, and keeps the window
  // on screen.
  function planPlacement(saved, currentDisplays) {
    const primary = currentDisplays.find(d => d.isPrimary) || currentDisplays[0];
    if (!primary) return null;

    const original = saved.displayId === undefined
      ? undefined
      : currentDisplays.find(d => d.id === saved.displayId);
    const target = original || primary;
    const area = target.workArea || target.bounds;
    if (!area) return null;

    const width = Math.min(Math.max(100, isFiniteNumber(saved.width) ? saved.width : 800), area.width);
    const height = Math.min(Math.max(100, isFiniteNumber(saved.height) ? saved.height : 600), area.height);
    const wantedLeft = isFiniteNumber(saved.left) ? saved.left : 100;
    const wantedTop = isFiniteNumber(saved.top) ? saved.top : 100;
    const left = Math.max(area.left, Math.min(wantedLeft, area.left + area.width - width));
    const top = Math.max(area.top, Math.min(wantedTop, area.top + area.height - height));

    const sameDisplay = target === original;
    const state = (!sameDisplay || saved.state === 'minimized') ? 'normal' : saved.state;

    return {
      displayId: target.id,
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      state,
      sameDisplay,
    };
  }

  // Each function mutates `presets` only when it returns ok: true.
  function addPreset(presets, rawName, rawLayout) {
    const name = validatePresetName(rawName);
    if (!name) return { ok: false, message: 'Invalid preset name.' };
    const layout = sanitizeLayout(rawLayout);
    if (!layout) return { ok: false, message: 'The layout has no windows with web (http/https) tabs to save.' };
    if (Object.prototype.hasOwnProperty.call(presets, name)) {
      return { ok: false, message: `Preset "${name}" already exists. Use Update to overwrite it, or pick another name.` };
    }
    presets[name] = layout;
    return { ok: true, message: `Preset "${name}" saved.` };
  }

  function updatePreset(presets, rawName, rawLayout) {
    const name = validatePresetName(rawName);
    if (!name) return { ok: false, message: 'Invalid preset name.' };
    const layout = sanitizeLayout(rawLayout);
    if (!layout) return { ok: false, message: 'The layout has no windows with web (http/https) tabs to save.' };
    if (!Object.prototype.hasOwnProperty.call(presets, name)) {
      return { ok: false, message: `Preset "${name}" not found.` };
    }
    presets[name] = layout;
    return { ok: true, message: `Preset "${name}" updated.` };
  }

  function mergeImport(presets, incoming) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, imported: 0, skipped: 0 };
    }
    let imported = 0;
    let skipped = 0;
    for (const key of Object.keys(incoming)) {
      const name = validatePresetName(key);
      const layout = name && sanitizeLayout(incoming[key]);
      if (!layout) {
        skipped++;
        continue;
      }
      presets[name] = layout;
      imported++;
    }
    return { ok: true, imported, skipped };
  }

  return {
    sanitizeUrl,
    validatePresetName,
    sanitizeLayout,
    getDisplayForWindow,
    planPlacement,
    addPreset,
    updatePreset,
    mergeImport,
  };
})();

if (typeof module !== 'undefined') module.exports = WLM;
