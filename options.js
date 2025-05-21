document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('save-options-btn');
  const optionsForm = document.getElementById('options-form'); // Keep for potential future use
  const statusMessageDiv = document.getElementById('options-status-message');
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
        // Attempt to set a default even if loading fails, so the UI is in a known state.
        const defaultBehaviorRadio = document.querySelector(`input[name="preset-behavior"][value="close_all"]`);
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
        return;
      }
      const behaviorRadio = document.querySelector(`input[name="preset-behavior"][value="${items.presetBehavior}"]`);
      if (behaviorRadio) {
        behaviorRadio.checked = true;
      } else {
        // If the stored value is somehow invalid, default to 'close_all'
        console.warn(`Stored presetBehavior "${items.presetBehavior}" is invalid. Defaulting to "close_all".`);
        const defaultBehaviorRadio = document.querySelector(`input[name="preset-behavior"][value="close_all"]`);
        if (defaultBehaviorRadio) defaultBehaviorRadio.checked = true;
        // Optionally inform the user about the default being applied due to invalid stored value
        // displayOptionsStatus('Invalid saved option found, default applied.', true, 4000);
      }
    });
  }

  // Initial load of options
  if(statusMessageDiv && optionsForm) { // Check if essential elements are present
    loadOptions();
  } else {
      if(!statusMessageDiv) console.error("Element with ID 'options-status-message' not found.");
      if(!optionsForm) console.error("Element with ID 'options-form' not found.");
      // Potentially display a global error if basic elements are missing, though this is unlikely if HTML is correct.
  }

  if (saveButton) {
    saveButton.addEventListener('click', saveOptions);
  } else {
    console.error("Element with ID 'save-options-btn' not found.");
  }
});
