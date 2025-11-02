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
  const workspaceSelect = document.getElementById('workspace-select');
  const createWorkspaceBtn = document.getElementById('create-workspace-btn');
  const deleteWorkspaceBtn = document.getElementById('delete-workspace-btn');

  // Settings View Elements
  const settingsView = document.getElementById('settings-view');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const settingsForm = document.getElementById('settings-form');
  const cloudSyncToggle = document.getElementById('cloud-sync-toggle');
  const themeToggle = document.getElementById('theme-toggle');

  // Import/Export View Elements
  const importExportView = document.getElementById('import-export-view');
  const exportPresetsBtn = document.getElementById('export-presets-btn');
  const importFileInput = document.getElementById('import-file-input');
  const importPresetsBtn = document.getElementById('import-presets-btn');

  // --- Icon Definitions ---
  const ICONS = {
    apply: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`,
    update: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><polyline points="9 14 12 11 15 14" /></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>`,
  };

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

  // --- Workspace Logic ---
  async function getStorageArea() {
    const data = await chrome.storage.sync.get({ cloudSync: false });
    return data.cloudSync ? chrome.storage.sync : chrome.storage.local;
  }

  async function loadWorkspaces() {
    const storage = await getStorageArea();
    const data = await storage.get(['workspaces', 'activeWorkspace']);
    const workspaces = data.workspaces || { 'default': {} };
    const activeWorkspace = data.activeWorkspace || 'default';

    workspaceSelect.innerHTML = '';
    for (const name in workspaces) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === activeWorkspace) {
        option.selected = true;
      }
      workspaceSelect.appendChild(option);
    }
    loadPresets();
  }

  workspaceSelect.addEventListener('change', async () => {
    const storage = await getStorageArea();
    const activeWorkspace = workspaceSelect.value;
    await storage.set({ activeWorkspace });
    loadPresets();
  });

  createWorkspaceBtn.addEventListener('click', async () => {
    const workspaceName = prompt('Enter new workspace name:');
    if (workspaceName) {
      const storage = await getStorageArea();
      const data = await storage.get('workspaces');
      const workspaces = data.workspaces || { 'default': {} };
      if (workspaces[workspaceName]) {
        displayStatus(`Workspace "${workspaceName}" already exists.`, true);
        return;
      }
      workspaces[workspaceName] = {};
      await storage.set({ workspaces, activeWorkspace: workspaceName });
      loadWorkspaces();
    }
  });

  deleteWorkspaceBtn.addEventListener('click', async () => {
    const workspaceName = workspaceSelect.value;
    if (workspaceName === 'default') {
      displayStatus('Cannot delete the default workspace.', true);
      return;
    }
    if (confirm(`Are you sure you want to delete workspace "${workspaceName}"? This action cannot be undone.`)) {
      const storage = await getStorageArea();
      const data = await storage.get('workspaces');
      const workspaces = data.workspaces || { 'default': {} };
      delete workspaces[workspaceName];
      await storage.set({ workspaces, activeWorkspace: 'default' });
      loadWorkspaces();
    }
  });

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
    updateBtn.innerHTML = ICONS.update;
    updateBtn.classList.add('update-btn');
    updateBtn.setAttribute('data-preset-name', presetName);
    updateBtn.title = `Update preset: ${presetName}`;
    updateBtn.addEventListener('click', (event) => {
      const nameToUpdate = event.target.closest('button').getAttribute('data-preset-name');
      displayStatus(`Updating "${nameToUpdate}"... Capturing current layout.`, false, 4000);
      chrome.runtime.sendMessage({ action: "captureLayout" }, (captureResponse) => {
        handleResponse(captureResponse, (capRes) => {
          if (capRes.layout && !capRes.layout.error && Object.keys(capRes.layout).length > 0) {
            const newLayoutData = capRes.layout;
            displayStatus(`Layout captured. Updating preset "${nameToUpdate}"...`, false, 4000);
            chrome.runtime.sendMessage({ action: "updatePreset", presetName: nameToUpdate, layoutData: newLayoutData, workspace: workspaceSelect.value }, (updateMsgResponse) => {
              handleResponse(updateMsgResponse, (updResp) => {
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
    applyBtn.innerHTML = ICONS.apply;
    applyBtn.setAttribute('data-preset-name', presetName);
    applyBtn.title = `Apply preset: ${presetName}`;
    applyBtn.addEventListener('click', (event) => {
      const name = event.target.closest('button').getAttribute('data-preset-name');
      displayStatus(`Applying preset "${name}"...`, false, 2000);
      chrome.runtime.sendMessage({ action: "applyPreset", presetName: name, workspace: workspaceSelect.value }, (applyResponse) => {
        handleResponse(applyResponse, (appResp) => {
          displayStatus(appResp.message || `Preset "${name}" applied successfully.`, false, 3000);
        }, `Error applying "${name}"`);
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = ICONS.delete;
    deleteBtn.classList.add('delete-btn');
    deleteBtn.setAttribute('data-preset-name', presetName);
    deleteBtn.title = `Delete preset: ${presetName}`;
    deleteBtn.addEventListener('click', (event) => {
      const name = event.target.closest('button').getAttribute('data-preset-name');
      if (!confirm(`Are you sure you want to delete preset "${name}"? This action cannot be undone.`)) return;
      chrome.runtime.sendMessage({ action: "deletePreset", presetName: name, workspace: workspaceSelect.value }, (deleteResponse) => {
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

  async function loadPresets() {
    if (!presetsListDiv) {
        console.error("Preset list DIV not found.");
        displayStatus("Error: UI element for presets missing.", true);
        return;
    }
    const storage = await getStorageArea();
    chrome.runtime.sendMessage({ action: "getPresets", workspace: workspaceSelect.value }, (response) => {
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

  // --- Settings View Logic ---
  async function saveSettings(event) {
    if(event) event.preventDefault();
    const presetBehaviorInput = document.querySelector('#settings-form input[name="preset-behavior"]:checked');
    if (!presetBehaviorInput) {
      displayStatus('Please select a preset application behavior.', true, 5000);
      return;
    }
    const presetBehavior = presetBehaviorInput.value;
    const cloudSync = cloudSyncToggle.checked;
    const theme = themeToggle.checked ? 'dark' : 'light';
    await chrome.storage.sync.set({ presetBehavior, cloudSync, theme });
    displayStatus('Settings saved successfully.', false, 3000);
  }

  async function loadSettings() {
    const data = await chrome.storage.sync.get({ presetBehavior: 'close_all', cloudSync: false, theme: 'light' });
    cloudSyncToggle.checked = data.cloudSync;
    themeToggle.checked = data.theme === 'dark';
    document.body.classList.toggle('dark-theme', data.theme === 'dark');
    const currentBehavior = data.presetBehavior;
    const behaviorRadio = document.querySelector(`#settings-form input[name="preset-behavior"][value="${currentBehavior}"]`);
    if (behaviorRadio) {
      behaviorRadio.checked = true;
    } else {
      const defaultBehaviorRadio = document.querySelector('#settings-form input[name="preset-behavior"][value="close_all"]');
      if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
    }
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  themeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-theme', themeToggle.checked);
  });

  // --- Import/Export View Logic ---
  if (exportPresetsBtn) {
    exportPresetsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "getPresets", workspace: workspaceSelect.value }, (response) => {
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
          chrome.runtime.sendMessage({ action: "importPresets", data: importedPresetsData, workspace: workspaceSelect.value }, (response) => {
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
    loadWorkspaces();
  }
  if (settingsForm && statusMessageDiv) {
      loadSettings();
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.presets || changes.workspaces || changes.activeWorkspace)) {
      if (presetsView && presetsView.classList.contains('active')) {
          loadWorkspaces();
      }
    }
    if (namespace === 'sync') {
      if (changes.presets || changes.workspaces || changes.activeWorkspace || changes.cloudSync) {
        if (presetsView && presetsView.classList.contains('active')) {
            loadWorkspaces();
        }
      }
      if (changes.theme) {
        loadSettings();
      }
    }
  });
});
