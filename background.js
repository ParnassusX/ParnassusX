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
        // Potentially return an error object or throw, to be caught by the caller
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
                         active: tab.active || false, // Ensure boolean
                         pinned: tab.pinned || false  // Ensure boolean
                       })),
      };
    });
    return { windows: sanitizedWindows, displays };
  } catch (error) {
    console.error("Error in captureCurrentWindowLayout:", error.message, error.stack);
    return { error: `Failed to capture layout: ${error.message}` }; // Return an error object for the caller
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

async function getPresets() {
  try {
    const data = await chrome.storage.local.get('presets');
    return data.presets || {};
  } catch (error) {
    console.error("Error retrieving presets:", error.message, error.stack);
    // Return null or an empty object, but also indicate error to caller if possible
    // For onMessage, this will be wrapped in a status object.
    throw error; // Re-throw to be caught by the message listener's catch block
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
    allPresets = await getPresets(); // getPresets now re-throws on error
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
  // Further display comparison logic can be added here if necessary

  if (presetBehavior === 'close_all') {
    try {
      const currentWindows = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
      for (const win of currentWindows) {
        if (win.id && (win.type === 'normal')) {
           console.log(`Closing window ID: ${win.id} (behavior: close_all)`);
           await chrome.windows.remove(win.id);
        }
      }
    } catch (error) {
      console.error("applyPreset: Error closing existing windows:", error.message, error.stack);
      // Non-fatal, proceed with applying preset if possible
    }
  } else {
    console.log("Skipping closing existing windows (behavior: merge).");
  }
  
  for (const windowData of presetLayout.windows) {
    try {
      const urlsToOpen = (safeGet(windowData, 'tabs', []) || [])
                           .map(tab => safeGet(tab, 'url'))
                           .filter(url => typeof url === 'string' && url.length > 0);

      if (urlsToOpen.length === 0 && typeof safeGet(windowData, 'appLaunchId') !== 'string') { // Check for app windows too
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
          // Fallback logic for older presets (simplified)
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
        url: urlsToOpen.length > 0 ? urlsToOpen[0] : undefined, // only provide if there are URLs
        left: Math.round(targetLeft),
        top: Math.round(targetTop),
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        focused: safeGet(windowData, 'focused', false),
        state: targetState,
        // type: safeGet(windowData, 'type', 'normal') // Consider if type should be restored
      };
      if (safeGet(windowData, 'appLaunchId')) { // For app windows
        delete createData.url; // appLaunchId and url are mutually exclusive
        createData.appLaunchId = safeGet(windowData, 'appLaunchId');
      }


      const newWindow = await chrome.windows.create(createData);

      if (newWindow && newWindow.id) {
        for (let i = (createData.url ? 1 : 0); i < urlsToOpen.length; i++) { // start from 0 if no initial URL in createData
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
      // Continue to next window
    }
  }

  console.log(`Preset "${presetName}" applied.`);
  return { success: true, message: `Preset "${presetName}" applied.` };
  // Note: Overall success is returned even if some individual windows/tabs failed.
  // More granular error reporting could be added if needed.
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

// Centralized error handling for message listener
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
        sendResponse({status: "error", message: "Preset name or layout data missing."});
        return false; // Synchronous response
      }
      promise = savePreset(request.presetName, request.layoutData); // savePreset now returns {success, message}
      break;
    case "getPresets":
      promise = getPresets().then(presets => ({ status: "success", presets: presets }));
      break;
    case "applyPreset":
      if (!request.presetName) {
        sendResponse({status: "error", message: "Preset name missing."});
        return false; // Synchronous response
      }
      promise = applyPreset(request.presetName); // applyPreset now returns {success, message}
      break;
    case "deletePreset":
      if (!request.presetName) {
        sendResponse({status: "error", message: "Preset name missing for deletion."});
        return false; // Synchronous response
      }
      promise = deletePreset(request.presetName); // deletePreset now returns {success, message}
      break;
    default:
      console.warn("Unknown action received:", request.action);
      sendResponse({status: "error", message: `Unknown action: ${request.action}`});
      return false; // Synchronous response for unknown action
  }

  promise.then(response => {
    // If response is already in {status, message/data} format from functions like savePreset, applyPreset
    if (typeof response.status !== 'undefined') {
        sendResponse(response);
    } else { // For functions that just return data on success (like original getPresets)
        sendResponse({ status: "success", ...response });
    }
  }).catch(error => {
    console.error(`Error processing action "${action}":`, error.message, error.stack);
    sendResponse({status: "error", message: `Internal error processing ${action}: ${error.message}`});
  });

  return true; // Indicates asynchronous response
});
