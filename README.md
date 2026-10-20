# Window Layout Manager

A Chrome extension (Manifest V3) that saves the layout of your windows and tabs as named presets, and restores them later.

Status: early version, tested on a single display. Multi-monitor restore is best effort and has not been tested on a real multi-display setup.

## Features

- **Save a layout:** click the toolbar icon, press "Capture Current Window Layout", name it, press "Save New Preset". Saving under an existing name is refused; use Update to overwrite.
- **Apply a layout:** the popup shows the first three presets (alphabetical) for quick apply; the side panel lists all of them.
- **Update / delete:** from the side panel. Delete asks for confirmation.
- **Keyboard shortcuts:** Ctrl+Shift+1, 2, 3 (Command on Mac) apply the first three presets. Change them in `chrome://extensions/shortcuts`.
- **Settings (side panel, Settings tab):** how to apply a layout:
  - *Close all other windows* (default). Note: a shortcut closes your other windows without asking.
  - *Smart Close*: keeps windows that have pinned tabs.
  - *Merge*: opens the preset without closing anything. Windows can end up duplicated.
- **Import / Export (side panel):** export all presets to JSON, or import a JSON file. Imported presets are merged with yours; a name conflict overwrites the existing preset.

## What is saved

- Window position, size, state (normal, maximized, fullscreen), focus, and the display it was on.
- Each tab's web address (`http://` and `https://` only), active state and pinned state.

Tabs with other addresses (`chrome://`, `file://`, `about:`, extension pages) are not saved. Imported files are checked the same way, so a preset cannot open local files.

## Permissions

- `windows`, `tabs`: read window geometry and tab addresses. `tabs` is what makes Chrome show the "read your browsing history" warning.
- `storage`: presets and settings, stored locally in the browser.
- `system.display`: list the connected screens, used for placing windows.
- `sidePanel`: the side panel UI.

The extension does not send data anywhere. There is no account and no sync.

## Install (unpacked)

1. Open `chrome://extensions` and enable "Developer mode".
2. Click "Load unpacked" and select this folder.
3. Pin the icon from the Extensions menu if you want it in the toolbar.

## Tests

```
npm test                      # unit tests for the layout logic (Node 18+, no install)
npm i --no-save playwright    # once, for the browser tests
xvfb-run -a npm run test:e2e  # end-to-end in Chromium; set CHROME_BIN to pick a binary
```

## Files

- `background.js`: service worker. Capture, save, apply, shortcuts. All preset writes are serialized.
- `lib/layout.js`: pure logic (URL filtering, placement, preset validation). Covered by unit tests.
- `popup.*`, `sidepanel.*`: UI.
- `docs/ROAST.md`: an honest review of the first version.
- `docs/MONETIZATION.md`: a draft plan for a paid tier.
- `docs/strategy/`: early concept notes. They are not validated and do not describe what is built.
