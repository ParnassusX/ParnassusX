# Visual Preset Preview - Conceptual Design

## 1. Goal

To provide users with a quick visual representation of their saved presets in the side panel list, making it easier to identify and differentiate presets at a glance. This aims to be a "cool factor" enhancement for the free tier.

## 2. Challenges

*   **No Direct Screenshot Capability:** Chrome extensions cannot directly capture images of entire window layouts for security reasons.
*   **Representation Complexity:** The preview must be generated programmatically and schematically.
*   **Performance:** Generating and displaying previews should not significantly slow down the side panel.

## 3. Proposed Design: Mini-Grid Schematic

This approach will generate a small, abstract visual representation of the window layout for each preset.

*   **3.1. Data Source:** The existing preset data, which includes:
    *   Information about each display (ID, bounds, work area).
    *   Information for each window (relative position, size, display ID it's on, list of tabs).
    *   Information for each tab (URL, favicon URL - though accessing favicons directly for this might be complex, we can use placeholders or a generic icon initially).

*   **3.2. Preview Generation (Conceptual Steps):**
    1.  **Canvas:** For each preset, a small canvas element (e.g., HTML5 `<canvas>` or an SVG) will be used to draw the preview. Dimensions could be fixed (e.g., 100px wide, 60px tall).
    2.  **Display Normalization:**
        *   Determine the overall bounding box of all displays involved in the preset.
        *   Normalize the coordinates of the displays and windows to fit within the small canvas dimensions while maintaining relative positions and aspect ratios as much as possible.
    3.  **Draw Displays:** Render each display from the preset as a distinct rectangle within the canvas, possibly with a subtle border or different background if multiple displays are part of the preset and shown side-by-side in the preview.
    4.  **Draw Windows:** For each window in the preset:
        *   Draw a smaller rectangle within its corresponding normalized display area on the canvas.
        *   The rectangle's fill color could be a default, or potentially vary slightly based on window order or type (though this adds complexity).
        *   **Content Indication (Simplified):**
            *   Option A (Simplest): Just show colored rectangles for windows.
            *   Option B (More Advanced): Attempt to show a generic icon (e.g., a small square or circle) or the number of tabs within each window rectangle.
            *   Option C (Most Complex, Future): If feasible and not too slow, try to fetch and display a tiny, highly simplified version of the active tab's favicon within its window rectangle. (Favicon access for arbitrary URLs from a background/side panel context is restricted; `chrome://favicon/size/16@1x/https://example.com` can work from manifest-defined `web_accessible_resources` or from content scripts, but might be tricky to integrate here smoothly for *all* possible URLs in a preset). For MVP of this *concept*, a generic icon or tab count is safer.
    5.  **Caching (Important for Performance):** Once a preview is generated, it could be cached (e.g., as a data URL representation of the canvas/SVG) in `chrome.storage.local` associated with the preset name to avoid regenerating it every time the side panel loads. It would only regenerate if the preset is updated.

*   **3.3. Display in Side Panel:**
    *   In `sidepanel.js`, when `createPresetListItem` generates the HTML for a preset, it would include an `<img>` tag (if using cached data URLs) or a placeholder `div` where the canvas/SVG can be rendered.
    *   The preview would appear next to the preset name.

## 4. Example Visual (Conceptual Sketch - Description)

Imagine a preset list item:
*   `[ Mini Schematic Preview ] Preset Name (3 Windows, 8 Tabs)`
*   The "Mini Schematic Preview" (e.g., 100x60px) might show:
    *   A light gray rectangle representing the primary display.
    *   Inside it, three smaller, darker gray rectangles representing the three windows, positioned roughly as they were saved.
    *   Perhaps tiny dots or numbers inside each small rectangle indicating tab count.

## 5. Fallback

*   If preview generation fails or is too complex for a particular preset, a default generic icon or no preview will be shown.

## 6. Future Considerations / "Cooler" Enhancements
    *   Using dominant colors from favicons to tint window representations.
    *   More sophisticated favicon handling if security/API allows.
    *   Allowing users to pick a representative icon for a preset if the schematic is too abstract.
```
