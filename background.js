//- --------------------------------------------------------------------
//- MAIN LOGIC
//- --------------------------------------------------------------------

console.log("Background service worker started.");

//- --------------------------------------------------------------------
//- HELPER FUNCTIONS
//- --------------------------------------------------------------------

/**
 * Safely gets a nested property from an object.
 * @param {object} obj The object to query.
 * @param {string} path The path of the property to retrieve.
 * @param {*} defaultValue The default value to return if the property is not found.
 * @returns {*} The value of the property or the default value.
 */
function safeGet(obj, path, defaultValue = null) {
  try {
    const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
    return typeof value !== 'undefined' && value !== null ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Finds the display that contains the center of a window.
 * @param {chrome.windows.Window} window The window to find the display for.
 * @param {chrome.system.display.DisplayUnitInfo[]} displays The list of available displays.
 * @returns {string|null} The ID of the display or null if not found.
 */
function getDisplayForWindow(window, displays) {
  if (!window || !safeGet(window, 'left') || !safeGet(window, 'top') || !safeGet(window, 'width') || !safeGet(window, 'height') || !displays || displays.length === 0) {
    console.warn("getDisplayForWindow: Invalid window or displays data.", { window, displays });
    return displays.find(d => d.isPrimary)?.id || displays[0]?.id || null;
  }
  const winCenterX = window.left + window.width / 2;
  const winCenterY = window.top + window.height / 2;

  for (const display of displays) {
    const dBounds = display.workArea || display.bounds;
    if (!dBounds || typeof dBounds.left !== 'number' || typeof dBounds.top !== 'number' || typeof dBounds.width !== 'number' || typeof dBounds.height !== 'number') {
      console.warn("getDisplayForWindow: Invalid display bounds in display object:", display);
      continue;
    }
    if (winCenterX >= dBounds.left && winCenterX < (dBounds.left + dBounds.width) &&
      winCenterY >= dBounds.top && winCenterY < (dBounds.top + dBounds.height)) {
      return display.id;
    }
  }
  return displays.find(d => d.isPrimary)?.id || displays[0]?.id;
}

//- --------------------------------------------------------------------
//- CORE FUNCTIONS
//- --------------------------------------------------------------------

/**
 * Gets the storage area to use based on the cloud sync setting.
 * @returns {Promise<chrome.storage.StorageArea>} A promise that resolves with the storage area.
 */
async function getStorageArea() {
  const data = await chrome.storage.sync.get({ cloudSync: false });
  return data.cloudSync ? chrome.storage.sync : chrome.storage.local;
}

/**
 * Captures the current window layout.
 * @returns {Promise<object>} A promise that resolves with the layout data or an error object.
 */
async function captureCurrentWindowLayout() {
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const displays = await chrome.system.display.getInfo();

    if (!displays || displays.length === 0) {
      return { error: "No display information available." };
    }

    const sanitizedWindows = windows.map(win => {
      const { alwaysOnTop, ...relevantWindowProps } = win;
      return {
        ...relevantWindowProps,
        displayId: getDisplayForWindow(win, displays),
        tabs: (win.tabs || [])
          .filter(tab => typeof tab.url === 'string' && tab.url.length > 0 && !tab.url.startsWith("chrome-extension://"))
          .map(tab => ({
            url: tab.url,
            active: tab.active || false,
            pinned: tab.pinned || false
          })),
      };
    });

    return { windows: sanitizedWindows, displays };
  } catch (error) {
    console.error("Error in captureCurrentWindowLayout:", error.message, error.stack);
    return { error: `Failed to capture layout: ${error.message}` };
  }
}

/**
 * Saves a preset to storage.
 * @param {string} presetName The name of the preset to save.
 * @param {object} layoutData The layout data to save.
 * @param {string} workspace The workspace to save the preset in.
 * @returns {Promise<object>} A promise that resolves with a success or error object.
 */
async function savePreset(presetName, layoutData, workspace) {
  if (!presetName || typeof presetName !== 'string' || presetName.trim() === "") {
    return { success: false, message: "Invalid preset name." };
  }
  if (!layoutData || !layoutData.windows || !layoutData.displays) {
    return { success: false, message: "Invalid layout data provided." };
  }
  try {
    const storage = await getStorageArea();
    const data = await storage.get('workspaces');
    const workspaces = data.workspaces || { 'default': {} };
    workspaces[workspace][presetName] = layoutData;
    await storage.set({ workspaces });
    return { success: true, message: `Preset "${presetName}" saved.` };
  } catch (error) {
    console.error(`Error saving preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error saving preset: ${error.message}` };
  }
}

/**
 * Updates a preset in storage.
 * @param {string} presetName The name of the preset to update.
 * @param {object} layoutData The new layout data.
 * @param {string} workspace The workspace to update the preset in.
 * @returns {Promise<object>} A promise that resolves with a success or error object.
 */
async function updatePreset(presetName, layoutData, workspace) {
  if (!presetName || typeof presetName !== 'string' || presetName.trim() === "") {
    return { success: false, message: "Invalid preset name for update." };
  }
  if (!layoutData || !layoutData.windows || !layoutData.displays) {
    return { success: false, message: "Invalid layout data provided for update." };
  }
  try {
    const storage = await getStorageArea();
    const data = await storage.get('workspaces');
    const workspaces = data.workspaces || { 'default': {} };
    workspaces[workspace][presetName] = layoutData;
    await storage.set({ workspaces });
    return { success: true, message: `Preset "${presetName}" updated.` };
  } catch (error) {
    console.error(`Error updating preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error updating preset: ${error.message}` };
  }
}

/**
 * Retrieves all presets from storage.
 * @param {string} workspace The workspace to get the presets from.
 * @returns {Promise<object>} A promise that resolves with the presets object.
 */
async function getPresets(workspace) {
  const storage = await getStorageArea();
  const data = await storage.get('workspaces');
  const workspaces = data.workspaces || { 'default': {} };
  return workspaces[workspace] || {};
}

/**
 * Deletes a preset from storage.
 * @param {string} presetName The name of the preset to delete.
 * @param {string} workspace The workspace to delete the preset from.
 * @returns {Promise<object>} A promise that resolves with a success or error object.
 */
async function deletePreset(presetName, workspace) {
  try {
    const storage = await getStorageArea();
    const data = await storage.get('workspaces');
    let workspaces = data.workspaces || { 'default': {} };
    if (workspaces[workspace] && workspaces[workspace][presetName]) {
      delete workspaces[workspace][presetName];
      await storage.set({ workspaces });
      return { success: true, message: `Preset "${presetName}" deleted.` };
    } else {
      return { success: false, message: `Preset "${presetName}" not found.` };
    }
  } catch (error) {
    console.error(`Error deleting preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error deleting preset: ${error.message}` };
  }
}

/**
 * Imports presets from a JSON object.
 * @param {object} importedPresetsData The presets data to import.
 * @param {string} workspace The workspace to import the presets into.
 * @returns {Promise<object>} A promise that resolves with a success or error object.
 */
async function importPresets(importedPresetsData, workspace) {
  if (typeof importedPresetsData !== 'object' || importedPresetsData === null) {
    return { success: false, message: "Invalid import data: Not an object." };
  }

  try {
    const storage = await getStorageArea();
    const data = await storage.get('workspaces');
    let workspaces = data.workspaces || { 'default': {} };
    let currentPresets = workspaces[workspace] || {};
    let importedCount = 0;
    let skippedCount = 0;

    for (const presetName in importedPresetsData) {
      if (Object.prototype.hasOwnProperty.call(importedPresetsData, presetName)) {
        const presetContent = importedPresetsData[presetName];
        if (presetContent && Array.isArray(presetContent.windows) && Array.isArray(presetContent.displays)) {
          currentPresets[presetName] = presetContent;
          importedCount++;
        } else {
          console.warn(`Skipping import for preset "${presetName}": invalid structure.`, presetContent);
          skippedCount++;
        }
      }
    }

    workspaces[workspace] = currentPresets;
    await storage.set({ workspaces });

    let message = `${importedCount} preset(s) imported/updated successfully.`;
    if (skippedCount > 0) {
      message += ` ${skippedCount} preset(s) were skipped due to invalid structure.`;
    }
    return { success: true, message: message };
  } catch (error) {
    console.error("Error importing presets:", error.message, error.stack);
    return { success: false, message: `Error importing presets: ${error.message}` };
  }
}

//- --------------------------------------------------------------------
//- PRESET APPLICATION LOGIC
//- --------------------------------------------------------------------

/**
 * Gets the preset application behavior from sync storage.
 * @returns {Promise<string>} A promise that resolves with the preset behavior.
 */
async function getPresetBehavior() {
  const items = await chrome.storage.sync.get({ presetBehavior: 'close_all' });
  return items.presetBehavior;
}

/**
 * Closes existing windows based on the preset behavior.
 * @param {string} presetBehavior The preset behavior to use.
 */
async function closeExistingWindows(presetBehavior) {
  if (presetBehavior === 'close_all' || presetBehavior === 'smart_close_pinned') {
    const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
    for (const win of currentWindows) {
      if (win.id && (win.type === 'normal')) {
        if (presetBehavior === 'smart_close_pinned') {
          const tabsInWindow = await chrome.tabs.query({ windowId: win.id });
          const hasPinnedTab = tabsInWindow.some(tab => tab.pinned);
          if (hasPinnedTab) {
            continue;
          }
        }
        await chrome.windows.remove(win.id);
      }
    }
  }
}

/**
 * Creates new windows based on the preset layout.
 * @param {object} presetLayout The layout data for the preset.
 * @param {chrome.system.display.DisplayUnitInfo[]} currentDisplays The list of available displays.
 */
async function createNewWindows(presetLayout, currentDisplays) {
  const primaryDisplay = currentDisplays.find(d => d.isPrimary) || currentDisplays[0];
  if (!primaryDisplay) {
    throw new Error("No primary display found. Cannot apply preset.");
  }

  for (const windowData of presetLayout.windows) {
    try {
      const urlsToOpen = (safeGet(windowData, 'tabs', []) || [])
        .map(tab => safeGet(tab, 'url'))
        .filter(url => typeof url === 'string' && url.length > 0);

      if (urlsToOpen.length === 0 && typeof safeGet(windowData, 'appLaunchId') !== 'string') {
        console.warn("Window data in preset has no valid URLs or appLaunchId, skipping:", windowData);
        continue;
      }

      let targetLeft = safeGet(windowData, 'left', 100);
      let targetTop = safeGet(windowData, 'top', 100);
      let targetWidth = Math.max(100, safeGet(windowData, 'width', 800));
      let targetHeight = Math.max(100, safeGet(windowData, 'height', 600));
      let targetState = safeGet(windowData, 'state', "normal");

      const originalDisplayId = safeGet(windowData, 'displayId');
      let targetDisplay = null;

      if (originalDisplayId) {
        targetDisplay = currentDisplays.find(d => d.id === originalDisplayId);
      }

      if (!targetDisplay) {
        targetDisplay = primaryDisplay;
      }

      const displayBounds = targetDisplay.workArea || targetDisplay.bounds;
      if (!displayBounds) {
        console.error("Target display has no bounds information. Skipping window.", targetDisplay);
        continue;
      }

      targetWidth = Math.min(targetWidth, displayBounds.width);
      targetHeight = Math.min(targetHeight, displayBounds.height);
      targetLeft = Math.max(displayBounds.left, Math.min(targetLeft, displayBounds.left + displayBounds.width - targetWidth));
      targetTop = Math.max(displayBounds.top, Math.min(targetTop, displayBounds.top + displayBounds.height - targetHeight));

      if (targetDisplay.id !== originalDisplayId || targetState === "minimized") {
        targetState = "normal";
      }

      const createData = {
        url: urlsToOpen.length > 0 ? urlsToOpen[0] : undefined,
        left: Math.round(targetLeft),
        top: Math.round(targetTop),
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        focused: safeGet(windowData, 'focused', false),
        state: targetState,
      };

      const newWindow = await chrome.windows.create(createData);

      if (newWindow && newWindow.id) {
        for (let i = (createData.url ? 1 : 0); i < urlsToOpen.length; i++) {
          await chrome.tabs.create({
            windowId: newWindow.id,
            url: urlsToOpen[i],
            active: safeGet(windowData.tabs[i], 'active', false),
            pinned: safeGet(windowData.tabs[i], 'pinned', false)
          });
        }
        if ((windowData.state === "maximized" || windowData.state === "fullscreen") && targetDisplay.id === originalDisplayId) {
          await chrome.windows.update(newWindow.id, { state: windowData.state });
        }
        if (windowData.focused) {
          await chrome.windows.update(newWindow.id, { focused: true });
        }
      }
    } catch (windowError) {
      console.error("Error processing a window from preset:", windowData, windowError.message, windowError.stack);
    }
  }
}

/**
 * Applies a preset.
 * @param {string} presetName The name of the preset to apply.
 * @param {string} workspace The workspace to apply the preset from.
 * @returns {Promise<object>} A promise that resolves with a success or error object.
 */
async function applyPreset(presetName, workspace) {
  try {
    const presetBehavior = await getPresetBehavior();
    const allPresets = await getPresets(workspace);
    const presetLayout = allPresets[presetName];

    if (!presetLayout) {
      return { success: false, message: `Preset "${presetName}" not found.` };
    }

    const currentDisplays = await chrome.system.display.getInfo();

    await closeExistingWindows(presetBehavior);
    await createNewWindows(presetLayout, currentDisplays);

    return { success: true, message: `Preset "${presetName}" applied.` };
  } catch (error) {
    console.error(`Error applying preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error applying preset: ${error.message}` };
  }
}

//- --------------------------------------------------------------------
//- EVENT LISTENERS
//- --------------------------------------------------------------------

/**
 * Sets up the side panel to open on action click.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting side panel behavior:', error));
});

/**
 * Handles messages from other parts of the extension.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request.action;
  let promise;

  switch (action) {
    case "captureLayout":
      promise = captureCurrentWindowLayout();
      break;
    case "savePreset":
      promise = savePreset(request.presetName, request.layoutData, request.workspace);
      break;
    case "updatePreset":
      promise = updatePreset(request.presetName, request.layoutData, request.workspace);
      break;
    case "getPresets":
      promise = getPresets(request.workspace).then(presets => ({ presets }));
      break;
    case "importPresets":
      promise = importPresets(request.data, request.workspace);
      break;
    case "applyPreset":
      promise = applyPreset(request.presetName, request.workspace);
      break;
    case "deletePreset":
      promise = deletePreset(request.presetName, request.workspace);
      break;
    default:
      sendResponse({ success: false, message: `Unknown action: ${request.action}` });
      return false;
  }

  promise.then(response => {
    sendResponse({ success: true, ...response });
  }).catch(error => {
    sendResponse({ success: false, message: `Internal error processing ${action}: ${error.message}` });
  });

  return true;
});

/**
 * Handles keyboard shortcut commands.
 */
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const storage = await getStorageArea();
    const data = await storage.get('activeWorkspace');
    const activeWorkspace = data.activeWorkspace || 'default';
    const presets = await getPresets(activeWorkspace);
    const sortedPresetNames = Object.keys(presets).sort();
    let presetToApplyName = null;

    if (command === "apply-preset-1" && sortedPresetNames.length > 0) {
      presetToApplyName = sortedPresetNames[0];
    } else if (command === "apply-preset-2" && sortedPresetNames.length > 1) {
      presetToApplyName = sortedPresetNames[1];
    } else if (command === "apply-preset-3" && sortedPresetNames.length > 2) {
      presetToApplyName = sortedPresetNames[2];
    }

    if (presetToApplyName) {
      await applyPreset(presetToApplyName, activeWorkspace);
    }
  } catch (error) {
    console.error(`Error handling command "${command}":`, error.message, error.stack);
  }
});

chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync' && changes.cloudSync) {
    const data = await chrome.storage.sync.get({ cloudSync: false });
    if (data.cloudSync) {
      // Sync local to sync
      const localData = await chrome.storage.local.get(['workspaces', 'activeWorkspace']);
      await chrome.storage.sync.set(localData);
    }
  }
});
