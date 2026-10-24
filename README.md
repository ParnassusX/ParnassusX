# Window Layout Manager

A Chrome extension (Manifest V3) that saves the layout of your windows and tabs as named presets, and restores them later. Presets adapt when your screens change.

Status: early version. Tested in Chromium on a single display. Multi-monitor placement is covered by unit tests, not by a real multi-screen run.

## What it does

**Save.** Click the toolbar icon, name the layout, press Save. Every normal window with web tabs is captured: position, size, state, screen, and each tab's address, title, pinned and active state. Minimized windows and non-web tabs (`chrome://`, `file://`, extension pages) are skipped.

**Apply.** The popup shows your first three presets for quick apply. The side panel lists all of them, with a thumbnail, window and tab counts, and a list of the tabs to check before you apply.

**Undo.** Applying a layout with "Close other windows first" closes windows. Before it does, the current windows are remembered. The popup and side panel then offer **Undo**, which brings them back without closing anything else.

**Versions.** *Update* replaces a preset with the current layout, and keeps the previous version (up to three). *Restore previous version* swaps back, and can be undone the same way.

**Library.** Six ready-made layouts for common work: code review, writing with sources, daily planning, presentation prep, reading session, meeting focus. Add any of them to your presets. You can rename a library copy and edit it like any other preset.

**Screens.** Layouts remember the screen they were saved on.
- If the screen is missing, windows go to the primary screen.
- If the screen is the same size, windows return to their exact position.
- If the screen is a different size, the layout is scaled proportionally (*Scale to the current screen*, on by default).
- Positions are always kept inside the visible work area.
- When screens change while the side panel is open, the list refreshes and a banner explains which presets are scaled.

**Undo for every change.** Delete, rename, duplicate, update, restore a version, remove a tab, import and library additions can all be undone. A banner in the side panel names the last change and has an Undo button. The last ten changes are kept.

**Manage.** Search across names, tab titles and URLs. Rename, duplicate, update, restore an earlier version, remove a single tab from a preset, delete. Lists are ordered by most recent use. Light, dark and system themes.

**Shortcuts.** Ctrl+Shift+1, 2 and 3 (Command on Mac) apply the preset in each slot. Assign a slot from a preset's ⋯ menu; a badge shows it on the card. Slots without a preset fall back to alphabetical order. Change the key combinations in `chrome://extensions/shortcuts`.

**Apply behaviour** (Settings tab):
- *Close other windows first* (default). The window you are using stays open. Undo brings the closed windows back, one apply at a time: only the most recent apply can be undone.
- *Keep windows with pinned tabs*: closes the others, but leaves windows that have a pinned tab.
- *Add alongside*: opens the layout without closing anything. Windows can end up duplicated.

## Storage

- Presets, their history and the last-apply snapshot are stored in `chrome.storage.local`, on this device only.
- Settings (apply behaviour, scaling, theme) are in `chrome.storage.sync`, so they follow your Chrome profile.
- Presets saved by the first version are upgraded when they are read. Nothing needs to be migrated by hand.
- Every write goes through one queue, so simultaneous saves cannot overwrite each other.
- Nothing is sent anywhere. There is no account and no sync.

## Permissions

- `windows`, `tabs`: read window geometry and tab addresses and titles. `tabs` is what makes Chrome show the "read your browsing history" warning. Without it, tab addresses are not available.
- `storage`: presets and settings, on this device.
- `system.display`: list the connected screens and detect changes, used for placing windows and scaling.
- `sidePanel`: the side panel UI.

## Install (unpacked)

1. Open `chrome://extensions` and turn on "Developer mode".
2. Click "Load unpacked" and select this folder.
3. Pin the icon from the Extensions menu if you want it in the toolbar.

## Tests

```
npm test                      # unit tests: layout, scaling, history, search, slots, previews, library (no install)
npm i --no-save playwright    # once, for the browser tests
xvfb-run -a npm run test:e2e     # message-level checks in Chromium
xvfb-run -a npm run test:e2e:ui  # click-driven checks: every button and dialog path
# CHROME_BIN picks a binary; SCREENSHOT_DIR saves screenshots for review
```

To regenerate the PNG icons from `icons/icon.svg`: `CHROME_BIN=... node tools/render-icons.js`.

## Files

- `background.js`: service worker. Capture, save, apply, undo, shortcuts, and the message API.
- `lib/layout.js`: pure logic: URL filtering, placement and scaling, preset entries and history. Covered by unit tests.
- `lib/preview.js`: schematic SVG thumbnails of a layout.
- `lib/ui.js`: shared UI helpers: messaging, icons, dialogs.
- `popup.*`, `sidepanel.*`, `style.css`: the interface.
- `lib/ui.js`: shared UI helpers: messages, icons, dialogs with inline validation, toasts with actions, menus.
- `library/presets.json`: built-in layouts, drawn for a 1920×1040 reference screen.
- `icons/`: `icon.svg` is the source; the PNG sizes are generated from it.
- `docs/ROAST.md`: review of the first version and what was fixed.
- `docs/ROAST-UX.md`: review of the interface and flows, with what was verified and what is still open.
- `docs/INSPIRATION.md`: open source projects looked at, and which ideas were taken.
- `docs/READINESS.md`: honest verdict on whether the app is ready to publish and to sell.
- `docs/PRIVACY.md`, `docs/STORE-LISTING.md`: drafts for the Chrome Web Store submission.
- `docs/MONETIZATION.md`: draft plan for a paid tier.
- `docs/strategy/`: early concept notes. They are not validated and do not describe what is built.
