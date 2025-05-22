document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('save-options-btn');
  const optionsForm = document.getElementById('options-form'); 
  const statusMessageDiv = document.getElementById('options-status-message');
  
  const exportPresetsBtn = document.getElementById('export-presets-btn');
  const importFileInput = document.getElementById('import-file-input');
  const importPresetsBtn = document.getElementById('import-presets-btn');
  const goToShortcutsBtn = document.getElementById('go-to-shortcuts-btn'); // Get the new button

  let statusTimeout = null; 

  function displayOptionsStatus(message, isError = false, duration = 3000) {
    if (!statusMessageDiv) {
        console.error("Options status message div not found. Message:", message);
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

  function saveOptions(event) {
    if(event) event.preventDefault(); 
    const presetBehaviorInput = document.querySelector('input[name="preset-behavior"]:checked');
    
    if (!presetBehaviorInput) {
      displayOptionsStatus('Please select a preset application behavior.', true);
      return;
    }
    const presetBehavior = presetBehaviorInput.value;

    chrome.storage.sync.set({
      presetBehavior: presetBehavior
    }, () => {
      if (chrome.runtime.lastError) {
        const errorMessage = `Error saving options: ${chrome.runtime.lastError.message}`;
        displayOptionsStatus(errorMessage, true);
        console.error(errorMessage);
      } else {
        displayOptionsStatus('Options saved successfully.', false);
      }
    });
  }

  function loadOptions() {
    chrome.storage.sync.get({
      presetBehavior: 'close_all' 
    }, (items) => {
      if (chrome.runtime.lastError) {
        const errorMessage = `Error loading options: ${chrome.runtime.lastError.message}`;
        displayOptionsStatus(errorMessage, true);
        console.error(errorMessage);
        const defaultBehaviorRadio = document.querySelector(`input[name="preset-behavior"][value="close_all"]`);
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
        return;
      }
      
      const currentBehavior = items.presetBehavior;
      const behaviorRadio = document.querySelector(`input[name="preset-behavior"][value="${currentBehavior}"]`);
      
      if (behaviorRadio) {
        behaviorRadio.checked = true;
      } else {
        console.warn(`Stored presetBehavior "${currentBehavior}" is invalid or not found. Defaulting to "close_all".`);
        const defaultBehaviorRadio = document.querySelector(`input[name="preset-behavior"][value="close_all"]`);
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
      }
    });
  }

  // Export Presets Logic
  if (exportPresetsBtn) {
    exportPresetsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "getPresets" }, (response) => {
        if (chrome.runtime.lastError) {
          displayOptionsStatus(`Error exporting presets: ${chrome.runtime.lastError.message}`, true);
          console.error("Export error (lastError):", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.status === "success" && response.presets) {
          if (Object.keys(response.presets).length === 0) {
            displayOptionsStatus("No presets to export.", false, 2000);
            return;
          }
          try {
            const jsonString = JSON.stringify(response.presets, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'window-presets.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            displayOptionsStatus('Presets exported successfully.', false);
          } catch (e) {
            displayOptionsStatus(`Error during export process: ${e.message}`, true);
            console.error("Export process error:", e);
          }
        } else {
          displayOptionsStatus(`Failed to get presets for export: ${response ? response.message : 'Unknown error'}`, true);
        }
      });
    });
  } else {
    console.error("Export presets button not found.");
  }

  // Import Presets Logic
  if (importPresetsBtn && importFileInput) {
    importPresetsBtn.addEventListener('click', () => {
      const file = importFileInput.files[0];
      if (!file) {
        displayOptionsStatus('Please select a file to import.', true);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedPresetsData = JSON.parse(event.target.result);
          if (typeof importedPresetsData !== 'object' || importedPresetsData === null) {
            displayOptionsStatus('Invalid file format: Not a valid JSON object.', true);
            return;
          }
          
          chrome.runtime.sendMessage({ action: "importPresets", data: importedPresetsData }, (response) => {
            if (chrome.runtime.lastError) {
              displayOptionsStatus(`Error importing presets: ${chrome.runtime.lastError.message}`, true);
              console.error("Import error (lastError):", chrome.runtime.lastError.message);
              return;
            }
            if (response && response.success) {
              displayOptionsStatus(response.message || 'Presets imported successfully.', false);
            } else {
              displayOptionsStatus(`Failed to import presets: ${response ? response.message : 'Unknown error'}`, true);
            }
            importFileInput.value = ''; 
          });

        } catch (e) {
          displayOptionsStatus(`Error parsing JSON file: ${e.message}`, true);
          console.error("JSON parsing error:", e);
          importFileInput.value = ''; 
        }
      };
      reader.onerror = () => {
        displayOptionsStatus(`Error reading file: ${reader.error.message}`, true);
        console.error("File reading error:", reader.error);
        importFileInput.value = ''; 
      };
      reader.readAsText(file);
    });
  } else {
    if(!importPresetsBtn) console.error("Import presets button not found.");
    if(!importFileInput) console.error("Import file input not found.");
  }

  // Keyboard shortcuts link
  if (goToShortcutsBtn) {
    goToShortcutsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  } else {
    console.error("Go to shortcuts button not found.");
  }

  // Initial load of other options
  if(statusMessageDiv && optionsForm) { 
    loadOptions();
  } else {
      if(!statusMessageDiv) console.error("Element with ID 'options-status-message' not found.");
      if(!optionsForm) console.error("Element with ID 'options-form' not found.");
  }

  if (saveButton) {
    saveButton.addEventListener('click', saveOptions);
  } else {
    console.error("Element with ID 'save-options-btn' not found.");
  }
});
