# AI-Powered Preset Suggestions: Conceptual Groundwork

This document outlines the conceptual design for potential AI-driven features aimed at enhancing the Window Layout Manager extension by providing smart preset suggestions.

## Section 1: Analytics for Smart Suggestions (Conceptual Design)

### Objective

The primary goal of collecting analytics is to identify user behavior patterns and frequently used window layouts. This data, processed locally, would form the basis for generating intelligent suggestions for creating, updating, or applying presets, ultimately making window management more intuitive and efficient.

### Data Points to Consider

1.  **Frequently Co-occurring URLs/Domains & Arrangements:**
    *   *Description:* Track which website URLs or domains (e.g., `mail.google.com`, `docs.google.com`, `yourproject.jira.com`) are often open at the same time. Analyze their typical window states (maximized, normal), positions, sizes, and relative screen placements (e.g., "email on left half of main screen, project tracker on right half").
2.  **Stable Manual Layouts:**
    *   *Description:* Detect when a user manually arranges windows (opens, closes, resizes, moves) and then maintains that layout for a significant period without further changes. This "settled" state could indicate a personally useful, but unsaved, preset.
3.  **Post-Preset Application Modifications:**
    *   *Description:* Observe if users consistently make the same manual adjustments (e.g., opening a specific additional tab, closing a particular window, resizing one) immediately after applying an existing preset. This could indicate the preset is incomplete or slightly misconfigured for their current needs.
4.  **Time-of-Day/Day-of-Week Correlations:**
    *   *Description:* Identify if certain sets of applications or window layouts are consistently used at specific times of the day (e.g., "morning news and email setup") or on specific days of the week (e.g., "Monday project planning layout").
5.  **Task-Switching Patterns:**
    *   *Description:* Analyze sequences of window/tab changes that might indicate a switch between common tasks. For example, closing a set of development tools and opening communication/meeting tools might suggest a "meeting mode" layout.
6.  **Display Configuration Context:**
    *   *Description:* Correlate layout patterns with specific display configurations (e.g., number of monitors, resolutions). A layout used with three monitors might be different from one used with a single laptop screen. Suggestions could be tailored to the current display setup.

### Ethical Collection & Consent Strategy

*   **Strictly Opt-In:** Analytics collection will be disabled by default. Users must explicitly opt-in to enable this feature.
*   **Clear Explanation of Data Use:** Before opting in, users will be provided with a clear, concise explanation of:
    *   What data is being considered (examples like those listed above).
    *   How this data is used (solely for generating local, personalized preset suggestions).
    *   That the data is not transmitted externally.
*   **Emphasis on Local Processing:** The design will prioritize on-device processing of this behavioral data. No window content, browsing history (beyond URL patterns for layout suggestions), or personal identifiers would be sent to external servers.
*   **User Control & Transparency:**
    *   Users should have a way to view the types of patterns or insights the extension has derived (if feasible and meaningful to display).
    *   Users must be able to easily clear any locally stored analytical data or derived patterns.
    *   Opting out at any time will stop further collection and clear existing analytical data.

## Section 2: `chrome.prompt` API (or similar AI interaction API - Conceptual Application)

### Assumed Availability

For the purpose of this conceptual design, we assume the future availability of a browser-integrated AI interaction API, notionally similar to `chrome.prompt` (as researched for potential "2025" browser features). This API would allow the extension to engage with the user in a more natural and intelligent way, leveraging an underlying in-browser AI model.

### Use Cases for User Interaction

1.  **Suggest Saving a Frequently Used Manual Layout:**
    *   *Description:* If the analytics detect a user frequently manually arranges a specific set of windows and tabs and uses this layout for a while, the AI API could be used to ask: "You've used this window layout a few times. Would you like to save it as a new preset?"
2.  **Suggest a Name for a New Preset:**
    *   *Description:* When a user captures a layout and is about to save it, the extension could analyze the primary URLs or application types visible in the layout. The AI API could then suggest a relevant name, e.g., "It looks like this layout is for 'Project Phoenix Development'. Would you like to use this name?" or offer a few choices.
3.  **Suggest Updating an Existing Preset:**
    *   *Description:* If analytics show a user consistently applies a preset and then immediately makes the same modification (e.g., always opens `chat.company.com` in a new small window next to it), the AI API could prompt: "I've noticed you often open 'Chat' after applying the 'Work Focus' preset. Would you like to update the preset to include this?"
4.  **Contextual Preset Suggestion on Startup/New Window:**
    *   *Description:* Based on time of day, day of week, or detected display configuration changes, the AI could proactively suggest applying a relevant preset: "Good morning! It's Monday, time for your 'Weekly Planning' layout?"
5.  **Clarification for Ambiguous Actions:**
    *   *Description:* If a user's actions are ambiguous but hint at a common task for which multiple presets exist, the AI could ask for clarification: "Are you starting your 'Coding' or 'Research' task? I can apply the relevant preset."

### Hypothetical API Interaction

**Use Case:** Suggesting saving a frequently used manual layout.

**Conceptual Logic (in `background.js` or similar):**
```javascript
// Assume analytics module has identified a 'stableFrequentLayout' object
if (stableFrequentLayout && shouldSuggestSave(stableFrequentLayout)) {
  try {
    const userResponse = await chrome.prompt({
      type: 'confirm', // or 'yesNoCancel'
      message: "You've used this window layout frequently. Would you like to save it as a new preset?",
      // optional: suggestedName: generateIntelligentName(stableFrequentLayout) // Another AI interaction
    });

    if (userResponse.confirmed) {
      // Proceed to get a name (could be another prompt or a default)
      // and then call the existing savePreset_or_updatePreset function.
      const presetName = userResponse.suggestedName || "Suggested Preset " + Date.now();
      // Call internal function to save 'stableFrequentLayout' with 'presetName'
      // display success message to user via notification or side panel update
    } else {
      // User declined, maybe snooze this suggestion for a while.
    }
  } catch (error) {
    console.error("Error interacting with chrome.prompt:", error);
  }
}
```

This example illustrates how an extension might use such an API to make interactions more proactive and intelligent, reducing manual user effort.
