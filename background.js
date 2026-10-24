importScripts('lib/layout.js');

const UNDO_LIMIT = 10;
// Layouts with more tabs than this load only their active tab per window; the
// other tabs are created but unloaded, and load when the user opens them.
const LAZY_TAB_THRESHOLD = 10;

// Every read-modify-write of presets, undo log and shortcut slots goes through
// this queue. Without it, messages that arrive together overwrite each other
// (verified in docs/ROAST.md, round 1).
let storeQueue = Promise.resolve();

function serialized(task) {
  const run = storeQueue.then(task);
  storeQueue = run.catch(() => {});
  return run;
}

// Runs `mutate` on the presets. When the mutation succeeds and returns an
// undoLabel, a snapshot of the previous presets is pushed on the undo log.
function updatePresetStore(mutate) {
  return serialized(async () => {
    const data = await chrome.storage.local.get(['presets', 'undoLog']);
    const presets = data.presets || {};
    const before = JSON.parse(JSON.stringify(presets));
    const result = mutate(presets, Date.now());
    if (!result.ok) return result;

    let log = Array.isArray(data.undoLog) ? data.undoLog : [];
    if (result.undoLabel) {
      log = [{ label: result.undoLabel, at: Date.now(), presets: before }, ...log];
    }
    // The log is capped by size, not only by count. If the newest snapshot does
    // not fit, the log is emptied: keeping only older snapshots would let Undo
    // silently revert this change as well.
    const presetsBytes = JSON.stringify(presets).length;
    log = WLM.trimUndoLog(log, WLM.undoBudget(presetsBytes), UNDO_LIMIT);
    if (result.undoLabel && log.length === 0) {
      result.message += ' This change is too large to undo.';
    }

    try {
      await chrome.storage.local.set({ presets, undoLog: log });
    } catch (error) {
      // Out of space: the edit matters more than its history. Retry without it.
      try {
        await chrome.storage.local.set({ presets, undoLog: [] });
        result.message += ' Undo history was cleared because storage is nearly full.';
      } catch (retryError) {
        return { ok: false, message: 'Storage is full. Export and delete some presets, then try again.' };
      }
    }
    return result;
  });
}

function undoable(label, result) {
  return result.ok ? { ...result, undoLabel: label } : result;
}

function asResponse(result) {
  return { success: result.ok, message: result.message };
}

// ---- Capture ------------------------------------------------------------

async function captureCurrentWindowLayout(excludeWindowId) {
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const displays = await chrome.system.display.getInfo();
    if (!displays || displays.length === 0) {
      return { error: 'No display information available.' };
    }
    const sanitizedDisplays = displays.map(d => ({
      id: d.id, isPrimary: d.isPrimary, bounds: d.bounds, workArea: d.workArea,
    }));

    const layoutWindows = windows
      .filter(win => win.state !== 'minimized' && win.id !== excludeWindowId)
      .map(win => ({
        left: win.left,
        top: win.top,
        width: win.width,
        height: win.height,
        state: win.state,
        focused: win.focused,
        displayId: WLM.getDisplayForWindow(win, displays),
        tabs: (win.tabs || []).map(tab => ({
          url: tab.url,
          title: tab.title || '',
          active: tab.active === true,
          pinned: tab.pinned === true,
        })),
      }));

    return { windows: layoutWindows, displays: sanitizedDisplays };
  } catch (error) {
    console.error('Error in captureCurrentWindowLayout:', error.message);
    return { error: `Failed to capture layout: ${error.message}` };
  }
}

// ---- Settings -----------------------------------------------------------

const DEFAULT_SETTINGS = { presetBehavior: 'close_all', fitToScreens: true, lazyTabs: true, behaviorConfirmed: false };

// Until the user has chosen how layouts are applied, nothing is ever closed:
// the layout opens alongside the current windows. The choice is asked for on
// the first apply and on the welcome page.
async function readSettings() {
  let settings;
  try {
    settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('readSettings failed, using defaults:', error.message);
    settings = { ...DEFAULT_SETTINGS };
  }
  if (settings.behaviorConfirmed !== true) settings.presetBehavior = 'merge';
  return settings;
}

// ---- Presets ------------------------------------------------------------

async function getPresets() {
  const data = await chrome.storage.local.get('presets');
  const raw = data.presets || {};
  const normalized = {};
  for (const name of Object.keys(raw)) {
    const entry = WLM.normalizeStoredEntry(raw[name], 0);
    if (entry) normalized[name] = entry;
  }
  return normalized;
}

async function getShortcutSlots() {
  const data = await chrome.storage.local.get('shortcutSlots');
  return data.shortcutSlots || {};
}

async function getDisplays() {
  const displays = await chrome.system.display.getInfo();
  return {
    displays: displays.map(d => ({ id: d.id, isPrimary: d.isPrimary, bounds: d.bounds, workArea: d.workArea })),
    signature: WLM.displaySignature(displays),
  };
}

// ---- Applying layouts ---------------------------------------------------

// keepWindowId is the window the request came from (the side panel's window,
// or the last focused window for the popup). It stays open, so the UI that
// triggered the change does not disappear with the windows it closes.
async function closeWindowsForBehavior(presetBehavior, keepWindowId) {
  const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
  for (const win of currentWindows) {
    if (!win.id || win.id === keepWindowId) continue;
    if (presetBehavior === 'smart_close_pinned') {
      const tabsInWindow = await chrome.tabs.query({ windowId: win.id });
      if (tabsInWindow.some(tab => tab.pinned)) continue;
    }
    await chrome.windows.remove(win.id);
  }
}

// Undo support for applying: before windows are closed, the current layout is
// stored so the last apply can be reverted with one click.
async function rememberLayoutBeforeClosing(keepWindowId) {
  const captured = await captureCurrentWindowLayout(keepWindowId);
  if (captured.error) return;
  const windows = captured.windows.filter(w => w.tabs.length > 0);
  await chrome.storage.local.set({ lastSession: { savedAt: Date.now(), layout: { ...captured, windows } } });
}

// Unloads every tab of a window except the one in front, so a layout with many
// tabs does not load them all at once. Tabs keep their address and title.
async function unloadBackgroundTabs(windowId) {
  const tabsInWindow = await chrome.tabs.query({ windowId });
  for (const tab of tabsInWindow) {
    if (!tab.active) await chrome.tabs.discard(tab.id).catch(() => {});
  }
}

async function restoreLayout(layout, savedDisplays, { presetBehavior, fit, keepWindowId, lazyTabs = false }) {
  const totalTabs = layout.windows.reduce((n, w) => n + w.tabs.length, 0);
  const unloadTabs = lazyTabs && totalTabs > LAZY_TAB_THRESHOLD;
  let currentDisplays;
  try {
    currentDisplays = await chrome.system.display.getInfo();
  } catch (error) {
    return { success: false, message: `Failed to get current display information: ${error.message}` };
  }
  if (!currentDisplays || currentDisplays.length === 0) {
    return { success: false, message: 'No display information available.' };
  }

  if (presetBehavior === 'close_all' || presetBehavior === 'smart_close_pinned') {
    try {
      await rememberLayoutBeforeClosing(keepWindowId);
      await closeWindowsForBehavior(presetBehavior, keepWindowId);
    } catch (error) {
      console.error('restoreLayout: error while closing windows:', error.message);
    }
  }

  for (const windowData of layout.windows) {
    try {
      const plan = WLM.planPlacement(windowData, currentDisplays, savedDisplays, { fit });
      if (!plan) {
        console.error('restoreLayout: target display has no bounds, skipping a window.');
        continue;
      }

      const [firstTab, ...otherTabs] = windowData.tabs;
      // Created with state 'normal'; maximized/fullscreen is applied after
      // creation, and only when the window is back on its original display.
      const newWindow = await chrome.windows.create({
        url: firstTab.url,
        left: plan.left,
        top: plan.top,
        width: plan.width,
        height: plan.height,
        focused: false,
        state: 'normal',
      });
      if (!newWindow || newWindow.id === undefined) {
        console.error('restoreLayout: failed to create a window.');
        continue;
      }

      if (firstTab.pinned) {
        // windows.create cannot pin a tab, so pin the first tab afterwards.
        const [created] = await chrome.tabs.query({ windowId: newWindow.id, index: 0 });
        if (created) {
          await chrome.tabs.update(created.id, { pinned: true }).catch(e => console.warn('pin failed:', e.message));
        }
      }

      for (const tab of otherTabs) {
        try {
          await chrome.tabs.create({ windowId: newWindow.id, url: tab.url, active: tab.active, pinned: tab.pinned });
        } catch (tabError) {
          console.error(`restoreLayout: could not open a tab in window ${newWindow.id}:`, tabError.message);
        }
      }

      if (unloadTabs && windowData.tabs.length > 1) {
        await unloadBackgroundTabs(newWindow.id);
      }

      if ((plan.state === 'maximized' || plan.state === 'fullscreen') && plan.sameDisplay) {
        await chrome.windows.update(newWindow.id, { state: plan.state })
          .catch(e => console.warn('state update failed:', e.message));
      }
      if (windowData.focused) {
        await chrome.windows.update(newWindow.id, { focused: true })
          .catch(e => console.warn('focus failed:', e.message));
      }
    } catch (windowError) {
      console.error('restoreLayout: error processing a saved window:', windowError.message);
    }
  }
  return { success: true };
}

async function applyPreset(presetName, keepWindowId) {
  let allPresets;
  try {
    allPresets = await getPresets();
  } catch (error) {
    return { status: 'error', success: false, message: `Failed to retrieve presets: ${error.message}` };
  }
  if (!Object.prototype.hasOwnProperty.call(allPresets, presetName)) {
    return { status: 'error', success: false, message: `Preset "${presetName}" not found.` };
  }
  // Stored data is re-sanitized on the way out, so presets saved before URL
  // filtering existed cannot open file: or other non-web URLs.
  const entry = allPresets[presetName];
  const layout = WLM.sanitizeLayout(entry);
  if (!layout) {
    return { status: 'error', success: false, message: `Preset "${presetName}" has no web tabs to restore.` };
  }

  const settings = await readSettings();
  const result = await restoreLayout(layout, layout.displays, {
    presetBehavior: settings.presetBehavior,
    fit: settings.fitToScreens,
    lazyTabs: settings.lazyTabs,
    keepWindowId,
  });
  if (!result.success) return { status: 'error', success: false, message: result.message };

  updatePresetStore(p => WLM.markUsed(p, presetName, Date.now())).catch(() => {});
  return { status: 'success', success: true, message: `Preset "${presetName}" applied.` };
}

async function undoLastApply(keepWindowId) {
  const data = await chrome.storage.local.get('lastSession');
  const session = data.lastSession;
  if (!session || !session.layout) {
    return { status: 'error', success: false, message: 'Nothing to undo.' };
  }
  // Put the windows back without closing anything else.
  const result = await restoreLayout(session.layout, session.layout.displays, {
    presetBehavior: 'merge',
    fit: true,
    keepWindowId,
  });
  if (!result.success) return { status: 'error', success: false, message: result.message };
  await chrome.storage.local.remove('lastSession');
  return { status: 'success', success: true, message: 'Previous layout restored.' };
}

async function getLastSession() {
  const data = await chrome.storage.local.get('lastSession');
  const session = data.lastSession;
  if (!session || !session.layout) return { status: 'success', session: null };
  return { status: 'success', session: { savedAt: session.savedAt, windows: session.layout.windows.length } };
}

// ---- Change history (undo for preset edits) -----------------------------

async function getUndoInfo() {
  const data = await chrome.storage.local.get('undoLog');
  const top = (data.undoLog || [])[0];
  return { status: 'success', undo: top ? { label: top.label, at: top.at } : null };
}

function undoPresetChange() {
  return serialized(async () => {
    const data = await chrome.storage.local.get('undoLog');
    const log = Array.isArray(data.undoLog) ? data.undoLog : [];
    if (log.length === 0) return { status: 'error', success: false, message: 'Nothing to undo.' };
    const [top, ...rest] = log;
    await chrome.storage.local.set({ presets: top.presets, undoLog: rest });
    return { status: 'success', success: true, message: `Undone: ${top.label}.` };
  });
}

// ---- Shortcut slots -----------------------------------------------------

function setShortcutSlot(index, presetName) {
  return serialized(async () => {
    const data = await chrome.storage.local.get(['presets', 'shortcutSlots']);
    const presets = data.presets || {};
    if (presetName !== null && !Object.prototype.hasOwnProperty.call(presets, presetName)) {
      return { status: 'error', success: false, message: `Preset "${presetName}" not found.` };
    }
    const slots = WLM.assignSlot(data.shortcutSlots || {}, index, presetName);
    await chrome.storage.local.set({ shortcutSlots: slots });
    return { status: 'success', success: true, message: presetName ? `Shortcut ${index} now applies "${presetName}".` : `Shortcut ${index} cleared.` };
  });
}

async function runShortcut(index) {
  const presets = await getPresets();
  const slots = await getShortcutSlots();
  const target = WLM.shortcutTargets(presets, slots)[index];
  if (!target) return { status: 'error', success: false, message: 'No preset is assigned to this shortcut.' };
  return applyPreset(target);
}

// ---- Message routing ----------------------------------------------------

function dispatch(request) {
  switch (request.action) {
    case 'captureLayout':
      return captureCurrentWindowLayout().then(layout => {
        if (layout && layout.error) return { status: 'error', message: layout.error };
        return { status: 'success', layout };
      });
    case 'saveCurrentLayout':
      return captureCurrentWindowLayout().then(layout => {
        if (layout.error) return { status: 'error', success: false, message: layout.error };
        return updatePresetStore((p, now) => {
          const name = WLM.validatePresetName(request.presetName);
          return undoable(`Saved "${name}"`, WLM.addPreset(p, request.presetName, layout, now));
        }).then(asResponse);
      });
    case 'updateCurrentLayout':
      return captureCurrentWindowLayout().then(layout => {
        if (layout.error) return { status: 'error', success: false, message: layout.error };
        return updatePresetStore((p, now) =>
          undoable(`Updated "${request.presetName}"`, WLM.updatePreset(p, request.presetName, layout, now))).then(asResponse);
      });
    case 'savePreset':
      return updatePresetStore((p, now) =>
        undoable(`Saved "${request.presetName}"`, WLM.addPreset(p, request.presetName, request.layoutData, now))).then(asResponse);
    case 'updatePreset':
      return updatePresetStore((p, now) =>
        undoable(`Updated "${request.presetName}"`, WLM.updatePreset(p, request.presetName, request.layoutData, now))).then(asResponse);
    case 'renamePreset':
      return updatePresetStore((p, now) =>
        undoable(`Renamed "${request.presetName}"`, WLM.renamePreset(p, request.presetName, request.newName, now)))
        .then(async (result) => {
          if (result.ok) {
            const data = await chrome.storage.local.get('shortcutSlots');
            await chrome.storage.local.set({ shortcutSlots: WLM.renameInSlots(data.shortcutSlots || {}, request.presetName, request.newName.trim()) });
          }
          return asResponse(result);
        });
    case 'duplicatePreset':
      return updatePresetStore((p, now) => undoable(`Duplicated "${request.presetName}"`, WLM.duplicatePreset(p, request.presetName, now))).then(asResponse);
    case 'revertPreset':
      return updatePresetStore((p, now) =>
        undoable(`Restored an earlier version of "${request.presetName}"`, WLM.revertPreset(p, request.presetName, now))).then(asResponse);
    case 'removeTab':
      return updatePresetStore((p, now) =>
        undoable(`Removed a tab from "${request.presetName}"`, WLM.removeTab(p, request.presetName, request.windowIndex, request.tabIndex, now))).then(asResponse);
    case 'installPreset':
      return updatePresetStore((p, now) => {
        const result = WLM.installPreset(p, request.presetName, request.layoutData, now);
        return result.ok ? undoable(`Added "${result.name}" from the library`, result) : result;
      }).then(asResponse);
    case 'deletePreset':
      return updatePresetStore((p) => {
        if (!Object.prototype.hasOwnProperty.call(p, request.presetName)) {
          return { ok: false, message: `Preset "${request.presetName}" not found.` };
        }
        delete p[request.presetName];
        return undoable(`Deleted "${request.presetName}"`, { ok: true, message: `Preset "${request.presetName}" deleted.` });
      }).then(asResponse);
    case 'getPresets':
      return getPresets().then(presets => ({ status: 'success', presets }));
    case 'importPresets':
      return updatePresetStore((p, now) => {
        const result = WLM.mergeImport(p, request.data, now);
        if (!result.ok) return result;
        return undoable(`Imported ${result.imported} preset(s)`, { ...result, ok: true });
      }).then(result => {
        if (!result.ok) return { success: false, message: 'Invalid import data: expected a JSON object of presets.' };
        return {
          success: true,
          message: `${result.imported} preset(s) imported/updated.` +
            (result.skipped > 0 ? ` ${result.skipped} skipped (invalid structure or non-web URLs only).` : ''),
        };
      });
    case 'applyPreset':
      return applyPreset(request.presetName, request.keepWindowId);
    case 'undoLastApply':
      return undoLastApply(request.keepWindowId);
    case 'getLastSession':
      return getLastSession();
    case 'undoPresetChange':
      return undoPresetChange();
    case 'getUndoInfo':
      return getUndoInfo();
    case 'getShortcutSlots':
      return getShortcutSlots().then(slots => ({ status: 'success', slots }));
    case 'setShortcutSlot':
      return setShortcutSlot(request.index, request.presetName);
    case 'getDisplays':
      return getDisplays().then(info => ({ status: 'success', ...info }));
    default:
      return Promise.resolve({ status: 'error', message: `Unknown action: ${request.action}` });
  }
}

// The toolbar icon opens the popup (save and apply in two clicks); the side
// panel is for managing presets and is opened from the popup. Set on every
// start so the behaviour never depends on when onInstalled last ran.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error('Error setting side panel behavior:', error));

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  dispatch(request).then(response => {
    // popup and side panel branch on `status`; a bare {success: false} would
    // fall through to their "unexpected response" path.
    const normalized = { ...response };
    if (normalized.status === undefined) {
      normalized.status = normalized.success === false ? 'error' : 'success';
    }
    sendResponse(normalized);
  }).catch(error => {
    console.error(`Error processing action "${request.action}":`, error.message);
    sendResponse({ status: 'error', message: `Internal error: ${error.message}` });
  });
  return true;
});

// Keyboard shortcuts: the slot's preset, or alphabetical order when unassigned.
const SHORTCUT_INDEX = { 'apply-preset-1': 0, 'apply-preset-2': 1, 'apply-preset-3': 2 };

chrome.commands.onCommand.addListener((command) => {
  const index = SHORTCUT_INDEX[command];
  if (index === undefined) return;
  runShortcut(index).then(result => {
    if (!result.success) console.error(`Shortcut failed: ${result.message}`);
  }).catch(error => console.error(`Error handling command "${command}":`, error.message));
});
