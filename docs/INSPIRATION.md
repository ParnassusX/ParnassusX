# Inspiration: what was looked at and what was taken

Only ideas were taken. No code was copied from any of these projects. Where a licence was found it is noted; check the repository before reusing anything.

| Project | What it does | Idea taken |
|---|---|---|
| Tab Session Manager (sienori) | Saves and restores windows and tabs; automatic saves; cloud sync; tab groups. | Keep a history of saved versions, so an overwrite is recoverable. Automatic saves and cloud sync are **not** built (see below). |
| Tabs Session Saver (paoloronco) | Saves windows and tab groups locally; optional cloud sync. Reported as AGPL-3.0 licensed. | Restore should keep tab groups intact. Not built yet, since the tab-groups API was not checked here. |
| Tab Saver (Egrodo) | Closes and saves all open tabs to local storage so they can be restored. | Make "close everything" safe: remember what was closed so it can be brought back. Built as Undo. |
| Layout Resizer, gTile (GNOME), Tiled | Snap or resize the current window to a grid or fraction of the screen. | Layouts expressed as fractions of the screen. Built as the library's reference-screen layouts, scaled to each screen. |
| Auto Window Layout | Remembers window size and position per site. | Per-site geometry. Not built; it would need a per-site storage model and is not a current priority. |

## Not built, and why

- **Automatic saves on a schedule.** Needs the `alarms` permission, which adds to the review and to the list of things the extension can do. Worth doing only if people ask for it.
- **Cloud sync.** Out of scope for this version; see `docs/MONETIZATION.md` for the plan and the validation steps that come first.
- **Tab groups.** The tab-groups API was not verified in this environment, so it is not claimed.
