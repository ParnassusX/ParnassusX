importScripts('lib/layout.js');

// Every write to the presets key goes through this queue. Without it, two
// messages that arrive together both read the old map and the last write
// wins, which silently drops the other preset (verified in docs/ROAST.md).
let presetQueue = Promise.resolve();

function updatePresetStore(mutate) {
  const run = presetQueue.then(async () => {
    const data = await chrome.storage.local.get('presets');
    const presets = data.presets || {};
    const result = mutate(presets);
    if (result.ok) {
      await chrome.storage.local.set({ presets });
    }
    return result;
  });
  presetQueue = run.catch(() => {});
  return run;
}

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

    const layoutWindows = windows.map(win => ({
      left: win.left,
      top: win.top,
      width: win.width,
      height: win.height,
      state: win.state,
      focused: win.focused,
      displayId: WLM.getDisplayForWindow(win, displays),
      tabs: (win.tabs || []).map(tab => ({
        url: tab.url,
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

async function savePreset(presetName, layoutData) {
  try {
    const result = await updatePresetStore(presets => WLM.addPreset(presets, presetName, layoutData));
    return { success: result.ok, message: result.message };
  } catch (error) {
    console.error(`Error saving preset "${presetName}":`, error.message);
    return { success: false, message: `Error saving preset: ${error.message}` };
  }
}

async function updatePreset(presetName, layoutData) {
  try {
    const result = await updatePresetStore(presets => WLM.updatePreset(presets, presetName, layoutData));
    return { success: result.ok, message: result.message };
  } catch (error) {
    console.error(`Error updating preset "${presetName}":`, error.message);
    return { success: false, message: `Error updating preset: ${error.message}` };
  }
}

async function getPresets() {
  const data = await chrome.storage.local.get('presets');
  return data.presets || {};
}

async function importPresets(importedPresetsData) {
  try {
    let counts = null;
    const result = await updatePresetStore(presets => {
      const merged = WLM.mergeImport(presets, importedPresetsData);
      counts = merged;
      return merged;
    });
    if (!result.ok) {
      return { success: false, message: 'Invalid import data: expected a JSON object of presets.' };
    }
    let message = `${counts.imported} preset(s) imported/updated.`;
    if (counts.skipped > 0) {
      message += ` ${counts.skipped} preset(s) skipped (invalid structure or non-web URLs only).`;
    }
    return { success: true, message };
  } catch (error) {
    console.error('Error importing presets:', error.message);
    return { success: false, message: `Error importing presets: ${error.message}` };
  }
}

async function deletePreset(presetName) {
  try {
    const result = await updatePresetStore(presets => {
      if (!Object.prototype.hasOwnProperty.call(presets, presetName)) {
        return { ok: false, message: `Preset "${presetName}" not found.` };
      }
      delete presets[presetName];
      return { ok: true, message: `Preset "${presetName}" deleted.` };
    });
    return { success: result.ok, message: result.message };
  } catch (error) {
    console.error(`Error deleting preset "${presetName}":`, error.message);
    return { success: false, message: `Error deleting preset: ${error.message}` };
  }
}

async function closeWindowsForPreset(presetBehavior) {
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

async function applyPreset(presetName) {
  let presetBehavior = 'close_all';
  try {
    const items = await chrome.storage.sync.get({ presetBehavior: 'close_all' });
    presetBehavior = items.presetBehavior;
  } catch (error) {
    console.error('applyPreset: could not read settings, using close_all:', error.message);
  }

  let allPresets;
  try {
    allPresets = await getPresets();
  } catch (error) {
    return { success: false, message: `Failed to retrieve presets: ${error.message}` };
  }
  if (!Object.prototype.hasOwnProperty.call(allPresets, presetName)) {
    return { success: false, message: `Preset "${presetName}" not found.` };
  }

  // Stored data is re-sanitized on the way out, so older presets saved before
  // URL filtering existed cannot open file: or other non-web URLs.
  const presetLayout = WLM.sanitizeLayout(allPresets[presetName]);
  if (!presetLayout) {
    return { success: false, message: `Preset "${presetName}" data is corrupted or has no web tabs.` };
  }

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
      await closeWindowsForPreset(presetBehavior);
    } catch (error) {
      console.error('applyPreset: error while closing windows:', error.message);
    }
  }

  for (const windowData of presetLayout.windows) {
    try {
      const plan = WLM.planPlacement(windowData, currentDisplays);
      if (!plan) {
        console.error('applyPreset: target display has no bounds, skipping a window.');
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
        console.error('applyPreset: failed to create a window.');
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
          await chrome.tabs.create({
            windowId: newWindow.id,
            url: tab.url,
            active: tab.active,
            pinned: tab.pinned,
          });
        } catch (tabError) {
          console.error(`applyPreset: could not open a tab in window ${newWindow.id}:`, tabError.message);
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
      console.error('applyPreset: error processing a saved window:', windowError.message);
    }
  }

  return { success: true, message: `Preset "${presetName}" applied.` };
}

// Side Panel Setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting side panel behavior:', error));
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request.action;
  let promise;

  switch (action) {
    case 'captureLayout':
      promise = captureCurrentWindowLayout().then(layout => {
        if (layout && layout.error) return { status: 'error', message: layout.error };
        return { status: 'success', layout };
      });
      break;
    case 'savePreset':
      promise = savePreset(request.presetName, request.layoutData);
      break;
    case 'updatePreset':
      promise = updatePreset(request.presetName, request.layoutData);
      break;
    case 'getPresets':
      promise = getPresets().then(presets => ({ status: 'success', presets }));
      break;
    case 'importPresets':
      promise = importPresets(request.data);
      break;
    case 'applyPreset':
      promise = applyPreset(request.presetName);
      break;
    case 'deletePreset':
      promise = deletePreset(request.presetName);
      break;
    default:
      sendResponse({ status: 'error', message: `Unknown action: ${action}` });
      return false;
  }

  promise.then(response => {
    // popup.js and sidepanel.js branch on `status`; a bare {success: false}
    // would fall through to their "unexpected response" path.
    const normalized = { ...response };
    if (normalized.status === undefined) {
      normalized.status = normalized.success === false ? 'error' : 'success';
    }
    sendResponse(normalized);
  }).catch(error => {
    console.error(`Error processing action "${action}":`, error.message);
    sendResponse({ status: 'error', message: `Internal error processing ${action}: ${error.message}` });
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
