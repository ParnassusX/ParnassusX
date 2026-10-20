# Simple Onboarding Flow Design

## Goal
To provide new users with immediate, gentle guidance on how to use the core functionality of the Window Layout Manager extension when they first interact with it.

## Chosen Approach
Modify the empty state messages in both the popup and the side panel to offer brief instructions. This approach is context-aware and minimally intrusive.

## Implementation Details

1.  **Popup (`popup.js` - within `loadQuickApplyButtons`):**
    *   If no presets exist, the `#quick-apply-buttons` container will display:
        ```html
        <p class="info-text">Welcome! 👋<br>
        1. Arrange your windows as you like them.<br>
        2. Click "Capture Current Window Layout" above.<br>
        3. Give your layout a name and click "Save New Preset".</p>
        ```

2.  **Side Panel (`sidepanel.js` - within `loadPresets`):**
    *   If no presets exist, the `#sidepanel-presets-list` container will display:
        ```html
        <p class="info-text">No presets saved yet.<br>
        To get started: Click the extension icon in your Chrome toolbar to open the popup, capture your current window layout, and save your first preset. You'll see it appear here!</p>
        ```

## Rationale
*   Provides guidance at the point where the user would expect to see content (presets).
*   Does not require opening new tabs or complex UI overlays for a first-run experience.
*   Reinforces the use of the popup for the initial save action.
