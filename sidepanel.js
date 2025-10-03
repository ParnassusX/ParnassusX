document.addEventListener('DOMContentLoaded', () => {
  // General Elements
  const statusMessageDiv = document.getElementById('sidepanel-status-message');
  let statusTimeout = null;

  // Navigation Elements
  const navButtons = document.querySelectorAll('.nav-button');
  const views = document.querySelectorAll('.view');

  // Presets View Elements
  const presetsView = document.getElementById('presets-view');
  const presetsListDiv = document.getElementById('sidepanel-presets-list');
  const refreshPresetsBtn = document.getElementById('refresh-presets-btn');

  // Settings View Elements
  const settingsView = document.getElementById('settings-view');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const settingsForm = document.getElementById('settings-form');
  const themeToggle = document.getElementById('theme-toggle');

  // Import/Export View Elements
  const importExportView = document.getElementById('import-export-view');
  const exportPresetsBtn = document.getElementById('export-presets-btn');
  const importFileInput = document.getElementById('import-file-input');
  const importPresetsBtn = document.getElementById('import-presets-btn');

  // --- Navigation Logic ---
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const viewId = button.getAttribute('data-view');

      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      views.forEach(view => {
        if (view.id === viewId) {
          view.classList.add('active');
        } else {
          view.classList.remove('active');
        }
      });
      if (statusMessageDiv) statusMessageDiv.className = 'status';
    });
  });

  // --- Status Display Logic ---
  function displayStatus(message, isError = false, duration = 3000, targetDiv = statusMessageDiv) {
    if (!targetDiv) {
        console.error("Target status message div not found. Message:", message);
        return;
    }
    if (targetDiv === statusMessageDiv && statusTimeout) {
      clearTimeout(statusTimeout);
    }

    targetDiv.textContent = message;
    targetDiv.className = 'status visible ' + (isError ? 'status-error' : 'status-success');

    const currentTimeout = setTimeout(() => {
        targetDiv.className = 'status';
    }, duration);

    if (targetDiv === statusMessageDiv) {
        statusTimeout = currentTimeout;
    }
  }

  // --- Generic Chrome Message Response Handler ---
  function handleResponse(response, successCallback, errorPrefix = "Error", statusTargetDiv = statusMessageDiv) {
    if (chrome.runtime.lastError) {
      displayStatus(`${errorPrefix}: ${chrome.runtime.lastError.message}`, true, 5000, statusTargetDiv);
      console.error(`${errorPrefix} (lastError):`, chrome.runtime.lastError.message);
      return;
    }
    if (response && response.status === "error") {
      displayStatus(`${errorPrefix}: ${response.message || 'Unknown error from background.'}`, true, 5000, statusTargetDiv);
      console.error(`${errorPrefix} (response.status):`, response.message);
    } else if (response && (response.status === "success" || response.success)) {
      if (successCallback) successCallback(response);
    } else {
      if (response && typeof response.presets !== 'undefined' && successCallback) {
        successCallback(response);
      } else if (response && typeof response.layout !== 'undefined' && successCallback) {
         successCallback(response);
      } else {
        displayStatus(`Unexpected response structure from ${errorPrefix}.`, true, 5000, statusTargetDiv);
        console.warn(`Unexpected response from ${errorPrefix}:`, response);
      }
    }
  }

  // --- Presets View Logic ---
  function createPresetListItem(presetName) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'preset-name';
    nameSpan.textContent = presetName;
    li.appendChild(nameSpan);

    const buttonGroupDiv = document.createElement('div');
    buttonGroupDiv.className = 'button-group';

    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Update';
    updateBtn.classList.add('update-btn');
    updateBtn.setAttribute('data-preset-name', presetName);
    updateBtn.title = `Capture current layout and update preset: ${presetName}`; // Tooltip
    updateBtn.addEventListener('click', (event) => {
      const nameToUpdate = event.target.getAttribute('data-preset-name');
      displayStatus(`Updating "${nameToUpdate}"... Capturing current layout.`, false, 4000);
      chrome.runtime.sendMessage({ action: "captureLayout" }, (captureResponse) => {
        handleResponse(captureResponse, (capRes) => {
          if (capRes.layout && !capRes.layout.error && Object.keys(capRes.layout).length > 0) {
            const newLayoutData = capRes.layout;
            displayStatus(`Layout captured. Updating preset "${nameToUpdate}"...`, false, 4000);
            chrome.runtime.sendMessage({ action: "updatePreset", presetName: nameToUpdate, layoutData: newLayoutData }, (updateMsgResponse) => {
              handleResponse(updateMsgResponse, (updResp) => { // Pass full response to callback
                displayStatus(updResp.message || `Preset "${nameToUpdate}" updated successfully.`, false);
              }, `Error updating "${nameToUpdate}"`);
            });
          } else {
            const errMsg = capRes.layout && capRes.layout.error ? capRes.layout.error : "capture failed or returned empty/invalid layout";
            displayStatus(`Capture failed for "${nameToUpdate}". ${errMsg}. Update cancelled.`, true);
          }
        }, `Capture error for "${nameToUpdate}"`);
      });
    });

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.setAttribute('data-preset-name', presetName);
    applyBtn.title = `Apply preset: ${presetName}`;
    applyBtn.addEventListener('click', (event) => {
      const name = event.target.getAttribute('data-preset-name');
      displayStatus(`Applying preset "${name}"...`, false, 2000);
      chrome.runtime.sendMessage({ action: "applyPreset", presetName: name }, (applyResponse) => {
        handleResponse(applyResponse, (appResp) => {
          displayStatus(appResp.message || `Preset "${name}" applied successfully.`, false, 3000);
        }, `Error applying "${name}"`);
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.classList.add('delete-btn');
    deleteBtn.setAttribute('data-preset-name', presetName);
    deleteBtn.title = `Delete preset: ${presetName}`;
    deleteBtn.addEventListener('click', (event) => {
      const name = event.target.getAttribute('data-preset-name');
      if (!confirm(`Are you sure you want to delete preset "${name}"? This action cannot be undone.`)) return;
      chrome.runtime.sendMessage({ action: "deletePreset", presetName: name }, (deleteResponse) => {
        handleResponse(deleteResponse, (delResp) => {
          displayStatus(delResp.message || `Preset "${name}" deleted successfully.`, false);
          loadPresets();
        }, `Error deleting "${name}"`);
      });
    });

    buttonGroupDiv.appendChild(updateBtn);
    buttonGroupDiv.appendChild(applyBtn);
    buttonGroupDiv.appendChild(deleteBtn);
    li.appendChild(buttonGroupDiv);
    return li;
  }

  function loadPresets() {
    if (!presetsListDiv) {
        console.error("Preset list DIV not found.");
        displayStatus("Error: UI element for presets missing.", true);
        return;
    }
    chrome.runtime.sendMessage({ action: "getPresets" }, (response) => {
      handleResponse(response, (r) => {
        presetsListDiv.innerHTML = '';
        const presets = r.presets;
        if (presets && Object.keys(presets).length > 0) {
          const ul = document.createElement('ul');
          const sortedPresetNames = Object.keys(presets).sort();
          sortedPresetNames.forEach(presetName => {
            ul.appendChild(createPresetListItem(presetName));
          });
          presetsListDiv.appendChild(ul);
        } else {
          presetsListDiv.innerHTML = `<p class="info-text">No presets saved yet.<br>
                To get started: Click the extension icon in your Chrome toolbar to open the popup, capture your current window layout, and save your first preset. You'll see it appear here!</p>`;
        }
      }, "Error loading presets list");
    });
  }

  if (refreshPresetsBtn) {
    refreshPresetsBtn.addEventListener('click', loadPresets);
  }

  // --- Theme Management ---
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function handleThemeChange() {
    const theme = themeToggle.checked ? 'dark' : 'light';
    applyTheme(theme);
    chrome.storage.sync.set({ theme: theme }, () => {
      if (chrome.runtime.lastError) {
        console.error(`Error saving theme: ${chrome.runtime.lastError.message}`);
      }
    });
  }

  // --- Settings View Logic ---
  function saveSettings(event) {
    if(event) event.preventDefault();
    const presetBehaviorInput = document.querySelector('#settings-form input[name="preset-behavior"]:checked');
    if (!presetBehaviorInput) {
      displayStatus('Please select a preset application behavior.', true, 5000);
      return;
    }
    const presetBehavior = presetBehaviorInput.value;
    chrome.storage.sync.set({ presetBehavior: presetBehavior }, () => {
      if (chrome.runtime.lastError) {
        displayStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, true, 5000);
      } else {
        displayStatus('Settings saved successfully.', false, 3000);
      }
    });
  }

  function loadSettings() {
    chrome.storage.sync.get({ presetBehavior: 'close_all', theme: 'light' }, (items) => {
      if (chrome.runtime.lastError) {
        displayStatus(`Error loading settings: ${chrome.runtime.lastError.message}`, true, 5000);
        // Fallback to defaults
        const defaultBehaviorRadio = document.querySelector('#settings-form input[name="preset-behavior"][value="close_all"]');
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
        applyTheme('light');
        if(themeToggle) themeToggle.checked = false;
        return;
      }

      // Load preset behavior setting
      const currentBehavior = items.presetBehavior;
      const behaviorRadio = document.querySelector(`#settings-form input[name="preset-behavior"][value="${currentBehavior}"]`);
      if (behaviorRadio) {
        behaviorRadio.checked = true;
      } else {
        const defaultBehaviorRadio = document.querySelector('#settings-form input[name="preset-behavior"][value="close_all"]');
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
      }

      // Load theme setting
      const currentTheme = items.theme;
      applyTheme(currentTheme);
      if (themeToggle) {
        themeToggle.checked = currentTheme === 'dark';
      }
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  if (themeToggle) {
    themeToggle.addEventListener('change', handleThemeChange);
  }

  // --- Import/Export View Logic ---
  if (exportPresetsBtn) {
    exportPresetsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "getPresets" }, (response) => {
        handleResponse(response, (r) => {
          const presets = r.presets || r;
          if (!presets || Object.keys(presets).length === 0) {
            displayStatus("No presets to export.", false, 2000); return;
          }
          const jsonString = JSON.stringify(presets, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'window-presets.json';
          document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
          displayStatus('Presets exported successfully.', false, 3000);
        }, "Export error");
      });
    });
  }

  if (importPresetsBtn && importFileInput) {
    importPresetsBtn.addEventListener('click', () => {
      const file = importFileInput.files[0];
      if (!file) {
        displayStatus('Please select a file to import.', true, 3000); return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedPresetsData = JSON.parse(event.target.result);
          if (typeof importedPresetsData !== 'object' || importedPresetsData === null) {
            displayStatus('Invalid file format: Not a JSON object.', true, 5000); return;
          }
          chrome.runtime.sendMessage({ action: "importPresets", data: importedPresetsData }, (response) => {
            handleResponse(response, (r) => {
              displayStatus(r.message || 'Presets imported successfully.', false, 3000);
              if (presetsView && presetsView.classList.contains('active')) { // Only load if presets view is active
                 loadPresets();
              }
            }, "Import error");
            importFileInput.value = '';
          });
        } catch (e) {
          displayStatus(`Error parsing JSON: ${e.message}`, true, 5000);
          importFileInput.value = '';
        }
      };
      reader.onerror = () => {
        displayStatus(`Error reading file: ${reader.error.message}`, true, 5000);
        importFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // --- Initialization ---
  if (presetsListDiv && statusMessageDiv) {
    loadPresets();
  }
  if (settingsForm && statusMessageDiv) {
      loadSettings();
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.presets) {
        console.log("Presets changed in storage, refreshing side panel preset list.");
        if (presetsView && presetsView.classList.contains('active')) {
            loadPresets();
        }
    }
  });
});
