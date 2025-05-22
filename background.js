console.log("Background service worker started.");

// Helper function to safely get properties from an object
function safeGet(obj, path, defaultValue = null) {
  try {
    const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
    return typeof value !== 'undefined' && value !== null ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Helper function to find which display's bounds contain a point (e.g., window center)
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


async function captureCurrentWindowLayout() {
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const displays = await chrome.system.display.getInfo();

    if (!displays || displays.length === 0) {
        console.error("captureCurrentWindowLayout: No display information available.");
        return { error: "No display information available." };
    }

    console.log("Captured Windows:", windows);
    console.log("Captured Displays:", displays);

    const sanitizedWindows = windows.map(win => {
      const { alwaysOnTop, ...relevantWindowProps } = win;
      return {
        ...relevantWindowProps, 
        displayId: getDisplayForWindow(win, displays),
        tabs: (win.tabs || []).filter(tab => typeof tab.url === 'string' && tab.url.length > 0 && !tab.url.startsWith("chrome-extension://"))
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

async function savePreset(presetName, layoutData) {
  try {
    if (!presetName || typeof presetName !== 'string' || presetName.trim() === "") {
      return { success: false, message: "Invalid preset name." };
    }
    if (!layoutData || !layoutData.windows || !layoutData.displays) {
      return { success: false, message: "Invalid layout data provided." };
    }
    const data = await chrome.storage.local.get('presets');
    const presets = data.presets || {};
    presets[presetName] = layoutData;
    await chrome.storage.local.set({ presets });
    console.log(`Preset "${presetName}" saved successfully.`, presets);
    return { success: true, message: `Preset "${presetName}" saved.` };
  } catch (error) {
    console.error(`Error saving preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error saving preset: ${error.message}` };
  }
}

async function updatePreset(presetName, layoutData) {
  try {
    if (!presetName || typeof presetName !== 'string' || presetName.trim() === "") {
      return { success: false, message: "Invalid preset name for update." };
    }
    if (!layoutData || !layoutData.windows || !layoutData.displays) {
      return { success: false, message: "Invalid layout data provided for update." };
    }
    const data = await chrome.storage.local.get('presets');
    const presets = data.presets || {};
    
    presets[presetName] = layoutData;
    await chrome.storage.local.set({ presets });
    console.log(`Preset "${presetName}" updated successfully.`, presets);
    return { success: true, message: `Preset "${presetName}" updated.` };
  } catch (error) {
    console.error(`Error updating preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error updating preset: ${error.message}` };
  }
}


async function getPresets() {
  try {
    const data = await chrome.storage.local.get('presets');
    return data.presets || {};
  } catch (error) {
    console.error("Error retrieving presets:", error.message, error.stack);
    throw error; 
  }
}

async function importPresets(importedPresetsData) {
  if (typeof importedPresetsData !== 'object' || importedPresetsData === null) {
    return { success: false, message: "Invalid import data: Not an object." };
  }

  try {
    const data = await chrome.storage.local.get('presets');
    let currentPresets = data.presets || {};
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

    await chrome.storage.local.set({ presets: currentPresets });
    
    let message = `${importedCount} preset(s) imported/updated successfully.`;
    if (skippedCount > 0) {
      message += ` ${skippedCount} preset(s) were skipped due to invalid structure.`;
    }
    console.log(message, currentPresets);
    return { success: true, message: message };

  } catch (error) {
    console.error("Error importing presets:", error.message, error.stack);
    return { success: false, message: `Error importing presets: ${error.message}` };
  }
}


async function applyPreset(presetName) {
  let options;
  try {
      options = await new Promise((resolve, reject) => {
        chrome.storage.sync.get({ presetBehavior: 'close_all' }, (items) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(items);
        });
    });
  } catch (error) {
      console.error("applyPreset: Error getting options from storage.sync:", error.message, error.stack);
      return { success: false, message: `Error getting extension options: ${error.message}` };
  }
  
  const presetBehavior = options.presetBehavior;
  console.log(`Preset application behavior: ${presetBehavior}`);

  let allPresets;
  try {
    allPresets = await getPresets(); 
  } catch (error) {
    return { success: false, message: `Failed to retrieve presets: ${error.message}` };
  }

  if (!allPresets || !allPresets[presetName]) {
    console.error(`Preset "${presetName}" not found.`);
    return { success: false, message: `Preset "${presetName}" not found.` };
  }

  const presetLayout = allPresets[presetName];
  if (!presetLayout || !Array.isArray(presetLayout.windows) || !Array.isArray(presetLayout.displays)) {
    console.error(`Preset "${presetName}" has malformed data.`, presetLayout);
    return { success: false, message: `Preset "${presetName}" data is corrupted or invalid.` };
  }
  console.log(`Applying preset "${presetName}":`, presetLayout);

  let currentDisplays;
  try {
    currentDisplays = await chrome.system.display.getInfo();
  } catch (error) {
    console.error("applyPreset: Error getting current display info:", error.message, error.stack);
    return { success: false, message: `Failed to get current display information: ${error.message}` };
  }
  
  const primaryDisplay = currentDisplays.find(d => d.isPrimary) || currentDisplays[0];

  if (!primaryDisplay) {
      console.error("No primary display found. Cannot apply preset.");
      return { success: false, message: "No primary display found." };
  }

  if (presetLayout.displays.length !== currentDisplays.length) {
    console.warn("Display configuration changed. Number of displays was:", presetLayout.displays.length, "now:", currentDisplays.length);
  }

  if (presetBehavior === 'close_all' || presetBehavior === 'smart_close_pinned') {
    try {
      const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
      for (const win of currentWindows) {
        if (win.id && (win.type === 'normal')) {
          if (presetBehavior === 'smart_close_pinned') {
            const tabsInWindow = await chrome.tabs.query({ windowId: win.id });
            const hasPinnedTab = tabsInWindow.some(tab => tab.pinned);
            if (hasPinnedTab) {
              console.log(`Skipping closing window ID: ${win.id} (behavior: smart_close_pinned, has pinned tabs)`);
              continue; 
            }
            console.log(`Closing window ID: ${win.id} (behavior: smart_close_pinned, no pinned tabs)`);
          } else { 
            console.log(`Closing window ID: ${win.id} (behavior: close_all)`);
          }
          await chrome.windows.remove(win.id);
        }
      }
    } catch (error) {
      console.error("applyPreset: Error during window closing logic:", error.message, error.stack);
    }
  } else if (presetBehavior === 'merge') {
    console.log("Skipping closing existing windows (behavior: merge).");
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
          if (!targetDisplay) console.warn(`Window's original display ID ${originalDisplayId} not found. Using primary.`);
      } else {
          console.warn("Window data missing displayId. Attempting to match by coordinates or using primary.");
      }
      
      if (!targetDisplay) targetDisplay = primaryDisplay;
      
      const displayBounds = targetDisplay.workArea || targetDisplay.bounds;
      if(!displayBounds) {
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

      console.log(`Adjusted window pos for display ${targetDisplay.id}: L:${targetLeft}, T:${targetTop}, W:${targetWidth}, H:${targetHeight}, S:${targetState}`);

      const createData = {
        url: urlsToOpen.length > 0 ? urlsToOpen[0] : undefined, 
        left: Math.round(targetLeft),
        top: Math.round(targetTop),
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        focused: safeGet(windowData, 'focused', false),
        state: targetState,
      };
      if (safeGet(windowData, 'appLaunchId')) { 
        delete createData.url; 
        createData.appLaunchId = safeGet(windowData, 'appLaunchId');
      }

      const newWindow = await chrome.windows.create(createData);

      if (newWindow && newWindow.id) {
        for (let i = (createData.url ? 1 : 0); i < urlsToOpen.length; i++) { 
          try {
            await chrome.tabs.create({
              windowId: newWindow.id,
              url: urlsToOpen[i],
              active: safeGet(windowData.tabs[i], 'active', false),
              pinned: safeGet(windowData.tabs[i], 'pinned', false)
            });
          } catch (tabError) {
            console.error(`Error creating tab for URL ${urlsToOpen[i]} in window ${newWindow.id}:`, tabError.message, tabError.stack);
          }
        }
        if ((windowData.state === "maximized" || windowData.state === "fullscreen") && targetDisplay.id === originalDisplayId) {
           try { await chrome.windows.update(newWindow.id, { state: windowData.state }); }
           catch (updateError) { console.warn(`Error updating window state for ${newWindow.id}:`, updateError.message); }
        }
        if (windowData.focused) {
           try { await chrome.windows.update(newWindow.id, { focused: true }); }
           catch (updateError) { console.warn(`Error focusing window ${newWindow.id}:`, updateError.message); }
        }
      } else {
        console.error("Failed to create new window for windowData:", windowData, "API response:", newWindow);
      }
    } catch (windowError) {
      console.error("Error processing a window from preset:", windowData, windowError.message, windowError.stack);
    }
  }

  console.log(`Preset "${presetName}" applied.`);
  return { success: true, message: `Preset "${presetName}" applied.` };
}

async function deletePreset(presetName) {
  try {
    const data = await chrome.storage.local.get('presets');
    let presets = data.presets || {};
    if (presets[presetName]) {
      delete presets[presetName];
      await chrome.storage.local.set({ presets });
      console.log(`Preset "${presetName}" deleted successfully.`);
      return { success: true, message: `Preset "${presetName}" deleted.` };
    } else {
      console.warn(`Preset "${presetName}" not found for deletion.`);
      return { success: false, message: `Preset "${presetName}" not found.` };
    }
  } catch (error) {
    console.error(`Error deleting preset "${presetName}":`, error.message, error.stack);
    return { success: false, message: `Error deleting preset: ${error.message}` };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request.action;
  let promise;

  switch (action) {
    case "captureLayout":
      promise = captureCurrentWindowLayout().then(layout => {
        if (layout && layout.error) return { status: "error", message: layout.error };
        return { status: "success", layout: layout };
      });
      break;
    case "savePreset":
      if (!request.presetName || !request.layoutData) {
        sendResponse({status: "error", message: "Preset name or layout data missing for save."});
        return false; 
      }
      promise = savePreset(request.presetName, request.layoutData);
      break;
    case "updatePreset": 
      if (!request.presetName || !request.layoutData) {
        sendResponse({status: "error", message: "Preset name or layout data missing for update."});
        return false;
      }
      promise = updatePreset(request.presetName, request.layoutData);
      break;
    case "getPresets":
      promise = getPresets().then(presets => ({ status: "success", presets: presets }));
      break;
    case "importPresets": 
      if (!request.data) {
        sendResponse({status: "error", message: "No data provided for import."});
        return false;
      }
      promise = importPresets(request.data);
      break;
    case "applyPreset":
      if (!request.presetName) {
        sendResponse({status: "error", message: "Preset name missing for apply."});
        return false; 
      }
      promise = applyPreset(request.presetName); 
      break;
    case "deletePreset":
      if (!request.presetName) {
        sendResponse({status: "error", message: "Preset name missing for delete."});
        return false; 
      }
      promise = deletePreset(request.presetName); 
      break;
    default:
      console.warn("Unknown action received:", request.action);
      sendResponse({status: "error", message: `Unknown action: ${request.action}`});
      return false; 
  }

  promise.then(response => {
    if (typeof response.status !== 'undefined' || typeof response.success !== 'undefined') { 
        sendResponse(response);
    } else { 
        sendResponse({ status: "success", ...response });
    }
  }).catch(error => {
    console.error(`Error processing action "${action}":`, error.message, error.stack);
    sendResponse({status: "error", message: `Internal error processing ${action}: ${error.message}`});
  });

  return true; 
});

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log(`Command received: ${command}`);
  try {
    const presets = await getPresets();
    if (!presets || Object.keys(presets).length === 0) {
      console.log("No presets available to apply via shortcut.");
      return;
    }

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
      console.log(`Applying preset "${presetToApplyName}" via command "${command}"`);
      const result = await applyPreset(presetToApplyName);
      if (result && result.success) {
        console.log(`Successfully applied preset "${presetToApplyName}" via command.`);
      } else {
        console.error(`Failed to apply preset "${presetToApplyName}" via command. Message: ${result ? result.message : 'Unknown error'}`);
      }
    } else {
      console.log(`No preset available for command "${command}" (Index out of bounds or no presets). Total presets: ${sortedPresetNames.length}`);
    }
  } catch (error) {
    console.error(`Error handling command "${command}":`, error.message, error.stack);
  }
});
