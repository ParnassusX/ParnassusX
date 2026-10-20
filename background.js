importScripts('lib/layout.js');

// Every write to the presets key goes through this queue. Without it, two
// messages that arrive together both read the old map and the last write
// wins, which silently drops the other preset (verified in docs/ROAST.md).
let presetQueue = Promise.resolve();

function updatePresetStore(mutate) {
  const run = presetQueue.then(async () => {
    const data = await chrome.storage.local.get('presets');
    const presets = data.presets || {};
    const result = mutate(presets, Date.now());
    if (result.ok) {
      await chrome.storage.local.set({ presets });
    }
    return result;
  });
  presetQueue = run.catch(() => {});
  return run;
}

function asResponse(result) {
  return { success: result.ok, message: result.message };
}

// ---- Capture ------------------------------------------------------------

async function captureCurrentWindowLayout() {
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
      .filter(win => win.state !== 'minimized')
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

async function readSettings() {
  try {
    const items = await chrome.storage.sync.get({ presetBehavior: 'close_all', fitToScreens: true });
    return items;
  } catch (error) {
    console.error('readSettings failed, using defaults:', error.message);
    return { presetBehavior: 'close_all', fitToScreens: true };
  }
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

async function getDisplays() {
  const displays = await chrome.system.display.getInfo();
  return {
    displays: displays.map(d => ({ id: d.id, isPrimary: d.isPrimary, bounds: d.bounds, workArea: d.workArea })),
    signature: WLM.displaySignature(displays),
  };
}

// ---- Applying layouts ---------------------------------------------------

async function closeWindowsForBehavior(presetBehavior) {
  const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
  for (const win of currentWindows) {
    if (!win.id) continue;
    if (presetBehavior === 'smart_close_pinned') {
      const tabsInWindow = await chrome.tabs.query({ windowId: win.id });
      if (tabsInWindow.some(tab => tab.pinned)) continue;
    }
    await chrome.windows.remove(win.id);
  }
}

// Undo support: before windows are closed, the current layout is stored so the
// last apply can be reverted with one click.
async function rememberLayoutBeforeClosing() {
  const captured = await captureCurrentWindowLayout();
  if (captured.error) return;
  await chrome.storage.local.set({ lastSession: { savedAt: Date.now(), layout: captured } });
}

async function restoreLayout(layout, savedDisplays, { presetBehavior, fit }) {
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
      await rememberLayoutBeforeClosing();
      await closeWindowsForBehavior(presetBehavior);
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

async function applyPreset(presetName) {
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
  });
  if (!result.success) return { status: 'error', success: false, message: result.message };
  return { status: 'success', success: true, message: `Preset "${presetName}" applied.` };
}

async function undoLastApply() {
  const data = await chrome.storage.local.get('lastSession');
  const session = data.lastSession;
  if (!session || !session.layout) {
    return { status: 'error', success: false, message: 'Nothing to undo.' };
  }
  // Put the windows back without closing anything else.
  const result = await restoreLayout(session.layout, session.layout.displays, { presetBehavior: 'merge', fit: true });
  if (!result.success) return { status: 'error', success: false, message: result.message };
  await chrome.storage.local.remove('lastSession');
  return { status: 'success', success: true, message: 'Previous layout restored.' };
}

async function getLastSession() {
  const data = await chrome.storage.local.get('lastSession');
  const session = data.lastSession;
  if (!session || !session.layout) return { status: 'success', session: null };
  return {
    status: 'success',
    session: { savedAt: session.savedAt, windows: session.layout.windows.length },
  };
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
      // Capture and save in one step, so the saved layout is the one on screen now.
      return captureCurrentWindowLayout().then(layout => {
        if (layout.error) return { status: 'error', success: false, message: layout.error };
        return updatePresetStore((p, now) => WLM.addPreset(p, request.presetName, layout, now)).then(asResponse);
      });
    case 'updateCurrentLayout':
      return captureCurrentWindowLayout().then(layout => {
        if (layout.error) return { status: 'error', success: false, message: layout.error };
        return updatePresetStore((p, now) => WLM.updatePreset(p, request.presetName, layout, now)).then(asResponse);
      });
    case 'savePreset':
      return updatePresetStore((p, now) => WLM.addPreset(p, request.presetName, request.layoutData, now)).then(asResponse);
    case 'updatePreset':
      return updatePresetStore((p, now) => WLM.updatePreset(p, request.presetName, request.layoutData, now)).then(asResponse);
    case 'renamePreset':
      return updatePresetStore((p, now) => WLM.renamePreset(p, request.presetName, request.newName, now)).then(asResponse);
    case 'duplicatePreset':
      return updatePresetStore((p, now) => WLM.duplicatePreset(p, request.presetName, now)).then(asResponse);
    case 'revertPreset':
      return updatePresetStore((p, now) => WLM.revertPreset(p, request.presetName, now)).then(asResponse);
    case 'installPreset':
      return updatePresetStore((p, now) => WLM.installPreset(p, request.presetName, request.layoutData, now)).then(asResponse);
    case 'deletePreset':
      return updatePresetStore((p) => {
        if (!Object.prototype.hasOwnProperty.call(p, request.presetName)) {
          return { ok: false, message: `Preset "${request.presetName}" not found.` };
        }
        delete p[request.presetName];
        return { ok: true, message: `Preset "${request.presetName}" deleted.` };
      }).then(asResponse);
    case 'getPresets':
      return getPresets().then(presets => ({ status: 'success', presets }));
    case 'importPresets':
      return updatePresetStore((p, now) => WLM.mergeImport(p, request.data, now)).then(result => {
        if (!result.ok) return { success: false, message: 'Invalid import data: expected a JSON object of presets.' };
        return {
          success: true,
          message: `${result.imported} preset(s) imported/updated.` +
            (result.skipped > 0 ? ` ${result.skipped} skipped (invalid structure or non-web URLs only).` : ''),
        };
      });
    case 'applyPreset':
      return applyPreset(request.presetName);
    case 'undoLastApply':
      return undoLastApply();
    case 'getLastSession':
      return getLastSession();
    case 'getDisplays':
      return getDisplays().then(info => ({ status: 'success', ...info }));
    default:
      return Promise.resolve({ status: 'error', message: `Unknown action: ${request.action}` });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting side panel behavior:', error));
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

// Keyboard shortcuts apply the first three presets in alphabetical order.
const SHORTCUT_INDEX = { 'apply-preset-1': 0, 'apply-preset-2': 1, 'apply-preset-3': 2 };

chrome.commands.onCommand.addListener(async (command) => {
  const index = SHORTCUT_INDEX[command];
  if (index === undefined) return;
  try {
    const names = Object.keys(await getPresets()).sort();
    if (index >= names.length) return;
    const result = await applyPreset(names[index]);
    if (!result.success) console.error(`Shortcut failed: ${result.message}`);
  } catch (error) {
    console.error(`Error handling command "${command}":`, error.message);
  }
});
