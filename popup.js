document.addEventListener('DOMContentLoaded', () => {
  const captureLayoutBtn = document.getElementById('capture-layout-btn');
  const saveLayoutBtn = document.getElementById('save-layout-btn');
  const presetNameInput = document.getElementById('preset-name-input');
  const statusMessageDiv = document.getElementById('status-message');
  const quickApplyContainer = document.getElementById('quick-apply-buttons');

  const addActionBtn = document.getElementById('add-action-btn');
  const actionDetailsPanel = document.getElementById('action-details-panel');
  const actionTabSelect = document.getElementById('action-tab-select');
  const actionScriptInput = document.getElementById('action-script-input');
  const clearActionBtn = document.getElementById('clear-action-btn');

  let capturedLayout = null;
  let statusTimeout = null;

  function displayStatus(message, isError = false, duration = 5000) {
    if (!statusMessageDiv) {
        console.error("Status message div not found. Message:", message);
        return;
    }
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    statusMessageDiv.textContent = message;
    statusMessageDiv.className = 'status visible ' + (isError ? 'status-error' : 'status-success');

    statusTimeout = setTimeout(() => {
      statusMessageDiv.className = 'status';
    }, duration);
  }

  function handleResponse(response, successCallback, errorPrefix = "Error") {
    if (chrome.runtime.lastError) {
      const errorMessage = `${errorPrefix}: ${chrome.runtime.lastError.message}`;
      displayStatus(errorMessage, true);
      console.error(errorMessage);
      if (successCallback !== displayStatus) return;
    }
    if (response && response.status === "error") {
      const errorMessage = `${errorPrefix}: ${response.message || 'Unknown error from background.'}`;
      displayStatus(errorMessage, true);
      console.error(errorMessage);
    } else if (response && (response.status === "success" || response.success)) {
      if (successCallback) successCallback(response); // Pass full response for more flexibility
    } else {
      if (response && typeof response.layout !== 'undefined' && successCallback) {
         successCallback(response);
      } else if (response && typeof response.presets !== 'undefined' && successCallback) {
         successCallback(response);
      }
      else {
        const errorMessage = `Unexpected response structure from ${errorPrefix}.`;
        displayStatus(errorMessage, true);
        console.warn(errorMessage, response);
      }
    }
  }

  async function loadQuickApplyButtons() {
    if (!quickApplyContainer) {
        console.error("Quick apply container not found.");
        return;
    }
    quickApplyContainer.innerHTML = '';

    chrome.runtime.sendMessage({ action: "getPresets" }, function(response) {
      if (chrome.runtime.lastError) {
        handleResponse({ status: 'error', message: chrome.runtime.lastError.message },
                       (r) => displayStatus(r.message, true),
                       "Error loading presets");
        quickApplyContainer.innerHTML = '<p class="info-text">Could not load presets.</p>';
        return;
      }
      handleResponse(response,
        (r) => {
          const presets = r.presets || r;
          if (!presets || typeof presets !== 'object') { // Check if presets is an object
            displayStatus("Error: Invalid presets data received.", true);
            quickApplyContainer.innerHTML = '<p class="info-text">Could not load presets.</p>';
            return;
          }

          const sortedPresetNames = Object.keys(presets).sort();
          const topPresets = sortedPresetNames.slice(0, 3);

          if (topPresets.length === 0) {
            quickApplyContainer.innerHTML = `<p class="info-text">Welcome! 👋<br>
                1. Arrange your windows as you like them.<br>
                2. Click "Capture Current Window Layout" above.<br>
                3. Give your layout a name and click "Save New Preset".</p>`;
            return;
          }

          topPresets.forEach(presetName => {
            const button = document.createElement('button');
            const displayName = presetName.length > 25 ? presetName.substring(0, 22) + "..." : presetName;
            button.textContent = `Apply "${displayName}"`;
            button.title = `Apply preset: ${presetName}`;
            button.classList.add('quick-apply-btn', 'secondary');
            button.dataset.presetName = presetName;

            button.addEventListener('click', function() {
              const nameToApply = this.dataset.presetName;
              displayStatus(`Applying preset "${nameToApply}"...`, false, 2000);
              chrome.runtime.sendMessage({ action: "applyPreset", presetName: nameToApply }, function(applyResponse) {
                handleResponse(applyResponse,
                               (resp) => {
                                 displayStatus(resp.message || `Preset "${nameToApply}" applied.`, false);
                                 setTimeout(() => window.close(), 1200);
                               },
                               `Error applying "${nameToApply}"`);
              });
            });
            quickApplyContainer.appendChild(button);
          });
        },
        "Error loading presets for Quick Apply"
      );
      if (!(response && (response.status === 'success' || response.success))) {
           quickApplyContainer.innerHTML = '<p class="info-text">Could not load presets.</p>';
      }
    });
  }

  function populateActionTabSelector() {
    if (!actionTabSelect || !capturedLayout || !capturedLayout.windows) {
      return;
    }
    actionTabSelect.innerHTML = '<option value="">-- Select a tab --</option>';
    capturedLayout.windows.forEach(win => {
      if(win.tabs && win.tabs.length > 0) {
        win.tabs.forEach(tab => {
          const option = document.createElement('option');
          option.value = tab.url;
          // Truncate title for display
          const title = tab.title || tab.url;
          option.textContent = title.length > 50 ? title.substring(0, 47) + '...' : title;
          actionTabSelect.appendChild(option);
        });
      }
    });
  }

  function resetActionPanel() {
      if (actionDetailsPanel) actionDetailsPanel.classList.add('hidden');
      if (actionTabSelect) actionTabSelect.innerHTML = '';
      if (actionScriptInput) actionScriptInput.value = '';
      if (addActionBtn) addActionBtn.textContent = 'Add Action (Advanced)';
  }

  if (captureLayoutBtn) {
    captureLayoutBtn.addEventListener('click', () => {
      displayStatus('Capturing layout...', false, 2000);
      resetActionPanel(); // Reset on new capture
      chrome.runtime.sendMessage({ action: "captureLayout" }, (response) => {
        handleResponse(response, (r) => {
          capturedLayout = r.layout;
          displayStatus(r.message || 'Layout captured! Enter name and save.', false);
          console.log("Captured layout in popup:", capturedLayout);
          populateActionTabSelector(); // Populate dropdown after capture
        }, "Error capturing layout");
        if (!(response && (response.status === "success" || response.success) && response.layout)) {
            capturedLayout = null;
        }
      });
    });
  } else {
      console.error("Element with ID 'capture-layout-btn' not found.");
  }

  if (saveLayoutBtn) {
    saveLayoutBtn.addEventListener('click', () => {
      const presetName = presetNameInput.value.trim();
      if (!presetName) {
        displayStatus('Please enter a name for the new preset.', true);
        return;
      }
      if (!capturedLayout) {
        displayStatus('Please capture a layout first. Click "Capture Current Window Layout".', true);
        return;
      }

      const layoutDataToSave = { ...capturedLayout }; // Create a copy to modify

      // Check if an action is defined and add it to the layout data
      const script = actionScriptInput.value.trim();
      const targetUrl = actionTabSelect.value;
      if (script && targetUrl) {
          layoutDataToSave.action = {
              targetUrl: targetUrl,
              script: script
          };
          console.log("Adding action to preset:", layoutDataToSave.action);
      }

      chrome.runtime.sendMessage({ action: "savePreset", presetName: presetName, layoutData: layoutDataToSave }, (response) => {
        handleResponse(response, (r) => {
          displayStatus(r.message || `Preset "${presetName}" processed successfully!`, false);
          if(presetNameInput) presetNameInput.value = '';
          capturedLayout = null;
          resetActionPanel();
          loadQuickApplyButtons();
        }, `Error saving preset "${presetName}"`);
      });
    });
  } else {
      console.error("Element with ID 'save-layout-btn' not found.");
  }

  // --- Action Panel Logic ---
  if (addActionBtn) {
      addActionBtn.addEventListener('click', () => {
          if (!capturedLayout) {
              displayStatus('Please capture a layout first before adding an action.', true);
              return;
          }
          const isHidden = actionDetailsPanel.classList.toggle('hidden');
          addActionBtn.textContent = isHidden ? 'Add Action (Advanced)' : 'Hide Action';
      });
  }

  if (clearActionBtn) {
      clearActionBtn.addEventListener('click', () => {
          actionTabSelect.value = '';
          actionScriptInput.value = '';
          displayStatus('Action cleared.', false, 2000);
      });
  }


  if(!statusMessageDiv) console.error("Element with ID 'status-message' not found.");
  if(!presetNameInput) console.error("Element with ID 'preset-name-input' not found.");

  loadQuickApplyButtons();
});
