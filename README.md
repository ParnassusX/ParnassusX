# Window Layout Manager Extension

Window Layout Manager is a Chrome extension that helps you save and restore your Chrome window arrangements, making it easy to switch between different layouts for various tasks.

## Project Status

This document outlines the current state of the "Window Layout Manager" extension.

*   **What is Real (Fully Implemented):** The application is a fully functional MVP (Minimum Viable Product). All core features described below under "Core MVP Features" are implemented, tested, and working. This includes capturing layouts, saving/applying/updating/deleting presets, import/export, and configurable settings via the side panel. The logic is robust and handles multiple displays.

*   **What is Mock/Conceptual (Not Implemented):** Several markdown files (`.md`) in the repository outline potential future features (e.g., AI Preset Suggestions, Visual Preset Previews). **These are design concepts and ideas, not implemented features.** The code does not contain any logic related to these concepts. They exist for planning and discussion purposes.

*   **Architecture & Logic:** The extension's logic is not mocked. It is fully wired and functional, with a clear separation of concerns:
    *   `background.js`: Handles all core logic for window and preset management.
    *   `sidepanel.js` / `sidepanel.html`: Provides the main UI for managing presets and settings.
    *   `popup.js` / `popup.html`: Acts as a "quick action" menu for capturing and applying layouts.
    *   The legacy `options.html` and `options.js` have been removed, and their functionality is now integrated into the side panel.

---

## Core MVP Features

*   **Save Window Layouts:** Capture your current setup of windows (their sizes, positions, and all open tabs) and save it as a named "preset" using the quick save feature in the extension popup.
*   **One-Click Preset Application:**
    *   **Popup Quick Apply:** Instantly apply one of your top 3 (alphabetically sorted) presets directly from the extension popup.
    *   **Side Panel:** Apply any saved preset from a comprehensive list in the extension's side panel.
*   **Preset Management (via Side Panel):**
    *   **List & View:** See all your saved presets, sorted alphabetically.
    *   **Update:** Update an existing preset with the current window layout.
    *   **Delete:** Remove presets you no longer need (with confirmation).
*   **Customizable Application Behavior (via Side Panel Settings):**
    *   Choose how presets are applied:
        *   Close all other windows.
        *   Merge with existing windows (experimental).
        *   Smart Close: Keep windows that have pinned tabs.
*   **Import/Export Presets (via Side Panel Import/Export):**
    *   Export your presets to a JSON file for backup or sharing.
    *   Import presets from a JSON file (merges with existing, overwrites on name conflict).
*   **Keyboard Shortcuts:**
    *   Apply your top 3 presets (alphabetically sorted) using keyboard shortcuts.
    *   Customize these shortcuts via `chrome://extensions/shortcuts`.
*   **Multi-Screen Awareness:** The extension attempts to restore windows to their correct screens and adjusts if display configurations change (e.g., moving windows to the primary display if an original display is unavailable).

## How to Use

**1. Installation (Loading Unpacked Extension):**
*   Download or clone the extension files to a local directory.
*   Open Chrome and navigate to `chrome://extensions`.
*   Enable "Developer mode" (usually a toggle in the top-right corner).
*   Click the "Load unpacked" button and select the directory containing the extension files.
*   The Window Layout Manager icon should appear in your Chrome toolbar (you might need to pin it).

**2. Saving a Preset:**
*   Arrange your Chrome windows and tabs as desired.
*   Click the Window Layout Manager extension icon in your Chrome toolbar to open the popup.
*   Click the "Capture Current Window Layout" button. A status message will confirm.
*   Enter a descriptive name for your preset in the input field.
*   Click "Save New Preset". A success message will appear, and the Quick Apply buttons may update.

**3. Applying a Preset:**
*   **Via Popup Quick Apply:**
    *   Click the extension icon to open the popup.
    *   If you have presets saved, up to three "Quick Apply" buttons for your first three presets (alphabetically) will appear. Click the desired one.
    *   The layout will be applied, and the popup will close automatically.
*   **Via Side Panel:**
    *   Click the extension icon to open the side panel (it should open by default due to `openPanelOnActionClick: true`).
    *   In the "Presets" tab (default), you'll see a list of all your saved presets, sorted alphabetically.
    *   Click the "Apply" button next to the desired preset.
    *   The layout will be applied. The side panel remains open.

**4. Managing Presets & Settings (Side Panel):**
*   Click the extension icon to open the side panel.
*   Use the navigation tabs at the top:
    *   **Presets Tab:**
        *   View all your presets.
        *   Click "Refresh List" if needed (though it auto-refreshes on many changes).
        *   **Apply:** Click "Apply" next to a preset.
        *   **Update:** Click "Update" next to a preset to overwrite it with the current window layout (after a capture step).
        *   **Delete:** Click "Delete" next to a preset (a confirmation dialog will appear).
    *   **Settings Tab:**
        *   Configure "Preset Application Behavior" (Close All, Smart Close, Merge).
        *   Click "Save Settings" to apply your choice.
    *   **Import/Export Tab:**
        *   Click "Export All Presets" to download a JSON backup of your presets.
        *   To import, click "Choose File", select your JSON backup, then click "Import Presets from File". This will merge the imported presets with your current ones, overwriting any with the same name.

**5. Keyboard Shortcuts:**
*   The extension defines commands for "Apply First Preset", "Apply Second Preset", and "Apply Third Preset". These correspond to the first, second, and third presets in your alphabetically sorted list.
*   The default suggested shortcuts are Ctrl+Shift+1, Ctrl+Shift+2, and Ctrl+Shift+3 (Command+Shift+1, etc. on Mac).
*   To view or change these shortcuts, navigate to `chrome://extensions/shortcuts` in Chrome. Find "Window Layout Manager" and customize as needed.

## Future Ideas (Conceptual)

*   AI-powered smart preset suggestions (see `AI_PRESET_SUGGESTIONS_CONCEPT.md`).
*   Cloud synchronization of presets across devices.
*   More advanced workspace management features (e.g., grouping presets, associating presets with specific tasks or projects).
*   User-defined ordering for Quick Apply / Keyboard shortcuts instead of purely alphabetical.

---
*This README reflects the MVP state of the extension.*
