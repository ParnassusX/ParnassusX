document.addEventListener('DOMContentLoaded', () => {
  const captureLayoutBtn = document.getElementById('capture-layout-btn');
  const saveLayoutBtn = document.getElementById('save-layout-btn');
  const presetNameInput = document.getElementById('preset-name-input');
  const presetsListDiv = document.getElementById('presets-list');
  const statusMessageDiv = document.getElementById('status-message');

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
      displayStatus(`${errorPrefix}: ${chrome.runtime.lastError.message}`, true);
      console.error(`${errorPrefix} (lastError):`, chrome.runtime.lastError.message);
      return;
    }
    if (response && response.status === "error") {
      displayStatus(`${errorPrefix}: ${response.message || 'Unknown error from background.'}`, true);
      console.error(`${errorPrefix} (response.status):`, response.message);
    } else if (response && (response.status === "success" || response.success)) { 
      if (successCallback) successCallback(response);
    } else {
      displayStatus("Unexpected response from background.", true);
      console.warn("Unexpected response:", response);
    }
  }

  // Function to create a single preset list item element
  function createPresetListItem(presetName) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'preset-name';
    nameSpan.textContent = presetName;
    li.appendChild(nameSpan);

    const buttonGroupDiv = document.createElement('div');
    buttonGroupDiv.className = 'button-group';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.setAttribute('data-preset-name', presetName);
    applyBtn.addEventListener('click', (event) => {
      const name = event.target.getAttribute('data-preset-name');
      displayStatus(`Applying preset "${name}"...`, false, 2000);
      chrome.runtime.sendMessage({ action: "applyPreset", presetName: name }, (applyResponse) => {
        handleResponse(applyResponse, () => {
          displayStatus(applyResponse.message || `Preset "${name}" applied successfully.`, false, 3000);
          setTimeout(() => window.close(), 700);
        }, `Error applying preset "${name}"`);
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.classList.add('delete-btn');
    deleteBtn.setAttribute('data-preset-name', presetName);
    deleteBtn.addEventListener('click', (event) => {
      const name = event.target.getAttribute('data-preset-name');
      if (!confirm(`Are you sure you want to delete preset "${name}"?`)) return;
      
      chrome.runtime.sendMessage({ action: "deletePreset", presetName: name }, (deleteResponse) => {
        handleResponse(deleteResponse, () => {
          displayStatus(deleteResponse.message || `Preset "${name}" deleted successfully.`, false);
          loadPresets(); 
        }, `Error deleting preset "${name}"`);
      });
    });

    buttonGroupDiv.appendChild(applyBtn);
    buttonGroupDiv.appendChild(deleteBtn);
    li.appendChild(buttonGroupDiv);
    return li;
  }

  async function loadPresets() {
    chrome.runtime.sendMessage({ action: "getPresets" }, (response) => {
      handleResponse(response, (r) => {
        presetsListDiv.innerHTML = ''; 
        const presets = r.presets;
        if (presets && Object.keys(presets).length > 0) {
          const ul = document.createElement('ul');
          for (const presetName in presets) {
            ul.appendChild(createPresetListItem(presetName));
          }
          presetsListDiv.appendChild(ul);
        } else {
          presetsListDiv.innerHTML = '<p style="text-align:center; color: var(--dark-gray-color);">No presets saved yet.</p>';
        }
      }, "Error loading presets");
    });
  }

  if (captureLayoutBtn) {
    captureLayoutBtn.addEventListener('click', () => {
      displayStatus('Capturing layout...', false, 2000);
      chrome.runtime.sendMessage({ action: "captureLayout" }, (response) => {
        handleResponse(response, (r) => {
          capturedLayout = r.layout;
          displayStatus(r.message || 'Layout captured! Enter name and save.', false);
          console.log("Captured layout in popup:", capturedLayout); 
        }, "Error capturing layout");
        if (response && response.status === "error") capturedLayout = null;
      });
    });
  } else {
      console.error("Element with ID 'capture-layout-btn' not found.");
  }

  if (saveLayoutBtn) {
    saveLayoutBtn.addEventListener('click', () => {
      const presetName = presetNameInput.value.trim();
      if (!presetName) {
        displayStatus('Please enter a name for the preset.', true);
        return;
      }
      if (!capturedLayout) {
        displayStatus('Please capture a layout first. Click "Capture Current Window Layout".', true);
        return;
      }
      
      const layoutDataToSave = capturedLayout; 

      chrome.runtime.sendMessage({ action: "savePreset", presetName: presetName, layoutData: layoutDataToSave }, (response) => {
        handleResponse(response, (r) => {
          displayStatus(r.message || `Preset "${presetName}" saved successfully.`, false);
          if(presetNameInput) presetNameInput.value = ''; 
          capturedLayout = null; 
          loadPresets(); 
        }, `Error saving preset "${presetName}"`);
      });
    });
  } else {
      console.error("Element with ID 'save-layout-btn' not found.");
  }

  if(presetsListDiv && statusMessageDiv && presetNameInput) {
    loadPresets();
  } else {
    if(!presetsListDiv) console.error("Element with ID 'presets-list' not found.");
    if(!statusMessageDiv) console.error("Element with ID 'status-message' not found.");
    if(!presetNameInput) console.error("Element with ID 'preset-name-input' not found.");
  }
});
