// Pure helpers for layouts and presets. No chrome.* calls here, so the
// logic can be unit tested with `node --test`. Loaded by background.js via
// importScripts() and by tests via require().
const WLM = (() => {
  const ALLOWED_PROTOCOLS = ['http:', 'https:'];
  const WINDOW_STATES = ['normal', 'maximized', 'fullscreen', 'minimized'];
  const MAX_NAME_LENGTH = 100;
  const MAX_TITLE_LENGTH = 200;
  const MAX_HISTORY = 3;
  const RESERVED_NAMES = ['__proto__', 'constructor', 'prototype'];
  const MIN_WINDOW_SIZE = 100;

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

  function sanitizeRect(rect) {
    if (!rect || typeof rect !== 'object') return undefined;
    const { left, top, width, height } = rect;
    if (![left, top, width, height].every(isFiniteNumber) || width <= 0 || height <= 0) return undefined;
    return { left, top, width, height };
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
          title: tab && typeof tab.title === 'string' ? tab.title.slice(0, MAX_TITLE_LENGTH) : '',
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
      .map(d => ({
        id: String(d.id),
        isPrimary: d.isPrimary === true,
        bounds: sanitizeRect(d.bounds),
        workArea: sanitizeRect(d.workArea),
      }));

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

  // Stable fingerprint of the screen setup. Stored with each preset so the UI
  // can tell when the screens have changed since it was saved.
  function displaySignature(displays) {
    return displays
      .map(d => {
        const b = d.workArea || d.bounds || {};
        return `${d.id}:${b.left},${b.top},${b.width},${b.height}`;
      })
      .sort()
      .join('|');
  }

  function sameRect(a, b) {
    return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
  }

  function sourceAreaFor(displayId, savedDisplays) {
    const display = savedDisplays.find(d => d.id === displayId)
      || savedDisplays.find(d => d.isPrimary)
      || savedDisplays[0];
    return display ? (display.workArea || display.bounds) || null : null;
  }

  // Maps a rectangle from one work area to another, keeping its relative
  // position and size. Used when the screens differ from the saved ones.
  function scaleRect(rect, from, to) {
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    return {
      left: to.left + (rect.left - from.left) * sx,
      top: to.top + (rect.top - from.top) * sy,
      width: rect.width * sx,
      height: rect.height * sy,
    };
  }

  // Decides where a saved window goes on the current screens.
  //  - target: the saved display if it still exists, else the primary one.
  //  - fit: when true and the work area differs from the saved one, the window
  //    is scaled proportionally instead of keeping its absolute pixels.
  //  - the result is always clamped inside the target work area.
  function planPlacement(saved, currentDisplays, savedDisplays = [], options = {}) {
    const primary = currentDisplays.find(d => d.isPrimary) || currentDisplays[0];
    if (!primary) return null;

    const original = saved.displayId === undefined
      ? undefined
      : currentDisplays.find(d => d.id === saved.displayId);
    const target = original || primary;
    const area = target.workArea || target.bounds;
    if (!area) return null;

    let rect = {
      left: isFiniteNumber(saved.left) ? saved.left : 100,
      top: isFiniteNumber(saved.top) ? saved.top : 100,
      width: isFiniteNumber(saved.width) ? saved.width : 800,
      height: isFiniteNumber(saved.height) ? saved.height : 600,
    };

    const source = sourceAreaFor(saved.displayId, savedDisplays);
    if (options.fit && source && !sameRect(source, area)) {
      rect = scaleRect(rect, source, area);
    }

    const width = Math.min(Math.max(MIN_WINDOW_SIZE, rect.width), area.width);
    const height = Math.min(Math.max(MIN_WINDOW_SIZE, rect.height), area.height);
    const clampedLeft = Math.max(area.left, Math.min(rect.left, area.left + area.width - width));
    const clampedTop = Math.max(area.top, Math.min(rect.top, area.top + area.height - height));

    // Round the two edges, not the origin and size separately, so rounding
    // never pushes the far edge past the work area.
    const x1 = Math.round(clampedLeft);
    const y1 = Math.round(clampedTop);
    const x2 = Math.min(Math.round(clampedLeft + width), area.left + area.width);
    const y2 = Math.min(Math.round(clampedTop + height), area.top + area.height);

    const sameDisplay = target === original;
    const state = (!sameDisplay || saved.state === 'minimized') ? 'normal' : saved.state;

    return {
      displayId: target.id,
      left: x1,
      top: y1,
      width: x2 - x1,
      height: y2 - y1,
      state,
      sameDisplay,
    };
  }

  // ---- Stored preset entries (schema version 2) -------------------------
  //
  // { version: 2, windows, displays, savedAt, updatedAt, history: [{savedAt, windows, displays}] }
  // history holds the previous versions, newest first, capped at MAX_HISTORY.

  function makeEntry(layout, now) {
    return { version: 2, windows: layout.windows, displays: layout.displays, savedAt: now, updatedAt: now, history: [] };
  }


  // Accepts both the v2 entry and the flat v1 shape that the first version stored.
  function normalizeStoredEntry(raw, now = 0) {
    const layout = sanitizeLayout(raw);
    if (!layout) return null;
    const savedAt = isFiniteNumber(raw.savedAt) ? raw.savedAt : now;
    const updatedAt = isFiniteNumber(raw.updatedAt) ? raw.updatedAt : savedAt;
    const history = Array.isArray(raw.history)
      ? raw.history.map(h => sanitizeLayout(h) && { savedAt: h.savedAt, ...sanitizeLayout(h) }).filter(Boolean).slice(0, MAX_HISTORY)
      : [];
    const entry = { version: 2, windows: layout.windows, displays: layout.displays, savedAt, updatedAt, history };
    // Library layouts are drawn for a reference screen on purpose; they are
    // scaled to whatever screen they are applied on and never flagged as changed.
    if (raw.reference === true) entry.reference = true;
    return entry;
  }

  function summarize(entry) {
    return {
      windows: entry.windows.length,
      tabs: entry.windows.reduce((n, w) => n + w.tabs.length, 0),
      screens: entry.displays.length,
      signature: displaySignature(entry.displays),
    };
  }

  function uniqueName(presets, base) {
    if (!Object.prototype.hasOwnProperty.call(presets, base)) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}`;
      if (!Object.prototype.hasOwnProperty.call(presets, candidate)) return candidate;
    }
    return null;
  }

  // Each function mutates `presets` only when it returns ok: true.
  function addPreset(presets, rawName, rawLayout, now = Date.now()) {
    const name = validatePresetName(rawName);
    if (!name) return { ok: false, message: 'Invalid preset name.' };
    const layout = sanitizeLayout(rawLayout);
    if (!layout) return { ok: false, message: 'The layout has no windows with web (http/https) tabs to save.' };
    if (Object.prototype.hasOwnProperty.call(presets, name)) {
      return { ok: false, message: `Preset "${name}" already exists. Use Update to overwrite it, or pick another name.` };
    }
    presets[name] = makeEntry(layout, now);
    return { ok: true, message: `Preset "${name}" saved.` };
  }

  function updatePreset(presets, rawName, rawLayout, now = Date.now()) {
    const name = validatePresetName(rawName);
    if (!name) return { ok: false, message: 'Invalid preset name.' };
    const layout = sanitizeLayout(rawLayout);
    if (!layout) return { ok: false, message: 'The layout has no windows with web (http/https) tabs to save.' };
    const existing = presets[name] && normalizeStoredEntry(presets[name], now);
    if (!existing) return { ok: false, message: `Preset "${name}" not found.` };

    const previous = { savedAt: existing.updatedAt, windows: existing.windows, displays: existing.displays };
    presets[name] = {
      version: 2,
      windows: layout.windows,
      displays: layout.displays,
      savedAt: existing.savedAt,
      updatedAt: now,
      history: [previous, ...existing.history].slice(0, MAX_HISTORY),
    };
    return { ok: true, message: `Preset "${name}" updated. The previous version can be restored.` };
  }

  function revertPreset(presets, name, now = Date.now()) {
    const existing = presets[name] && normalizeStoredEntry(presets[name], now);
    if (!existing) return { ok: false, message: `Preset "${name}" not found.` };
    if (existing.history.length === 0) return { ok: false, message: `Preset "${name}" has no earlier version.` };
    // Swap: the current version becomes the earlier one, so the action can be undone.
    const [previous, ...rest] = existing.history;
    const current = { savedAt: existing.updatedAt, windows: existing.windows, displays: existing.displays };
    presets[name] = {
      version: 2,
      windows: previous.windows,
      displays: previous.displays,
      savedAt: existing.savedAt,
      updatedAt: now,
      history: [current, ...rest].slice(0, MAX_HISTORY),
    };
    return { ok: true, message: `Preset "${name}" restored to its earlier version.` };
  }

  function renamePreset(presets, from, rawTo, now = Date.now()) {
    const to = validatePresetName(rawTo);
    if (!to) return { ok: false, message: 'Invalid new name.' };
    if (!Object.prototype.hasOwnProperty.call(presets, from)) return { ok: false, message: `Preset "${from}" not found.` };
    if (to === from) return { ok: true, message: 'Name unchanged.' };
    if (Object.prototype.hasOwnProperty.call(presets, to)) return { ok: false, message: `A preset named "${to}" already exists.` };
    presets[to] = { ...presets[from], updatedAt: now };
    delete presets[from];
    return { ok: true, message: `Renamed to "${to}".` };
  }

  function duplicatePreset(presets, from, now = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(presets, from)) return { ok: false, message: `Preset "${from}" not found.` };
    const name = uniqueName(presets, `${from} (copy)`);
    if (!name) return { ok: false, message: 'Too many copies of this preset.' };
    const existing = normalizeStoredEntry(presets[from], now);
    presets[name] = { ...makeEntry(existing, now), version: 2 };
    return { ok: true, message: `Created "${name}".`, name };
  }

  // Adds a library preset under a unique name, so installing twice never fails.
  function installPreset(presets, rawName, rawLayout, now = Date.now()) {
    const base = validatePresetName(rawName);
    if (!base) return { ok: false, message: 'Invalid preset name.' };
    const name = uniqueName(presets, base);
    if (!name) return { ok: false, message: 'Too many presets with this name.' };
    const result = addPreset(presets, name, rawLayout, now);
    if (result.ok) presets[name].reference = true;
    return { ...result, name };
  }

  function mergeImport(presets, incoming, now = Date.now()) {
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
      presets[name] = makeEntry(layout, now);
      imported++;
    }
    return { ok: true, imported, skipped };
  }

  return {
    MAX_HISTORY,
    sanitizeUrl,
    validatePresetName,
    sanitizeLayout,
    getDisplayForWindow,
    displaySignature,
    planPlacement,
    normalizeStoredEntry,
    summarize,
    addPreset,
    updatePreset,
    revertPreset,
    renamePreset,
    duplicatePreset,
    installPreset,
    mergeImport,
  };
})();

if (typeof module !== 'undefined') module.exports = WLM;
