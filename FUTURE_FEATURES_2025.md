# Future Features & Strategic Improvements (Mid-2025)

## 1. Introduction

This document outlines potential new features and strategic improvements for the Window Layout Manager extension, based on research into the latest Chrome Extension APIs and UI/UX trends relevant for mid-2025. The goal is to identify opportunities to enhance the extension's power, intelligence, and user experience.

---

## 2. High-Impact API Integrations

### 2.1. AI-Powered Preset Naming (`prompt` API)

*   **API:** `chrome.prompt` (Gemini Nano)
*   **Description:** This new API allows extensions to leverage Google's efficient Gemini Nano language model directly in the browser. It enables powerful, on-device AI interactions without sending user data to external servers.
*   **Proposed Feature:** **Smart Preset Suggestions.**
    *   When a user captures a window layout, we can use the `prompt` API to analyze the URLs and titles of the open tabs.
    *   Based on this context, the extension would automatically suggest a descriptive and relevant name for the preset.
*   **Example Use Case:**
    *   A user captures a layout with tabs for Google Calendar, Gmail, and a project management tool. The extension suggests the name "Work Focus" or "Morning Planning."
    *   A layout with YouTube, Reddit, and news sites could be automatically named "Evening Browsing."
*   **Benefit:** Reduces user friction by automating the naming process and making presets easier to identify and manage. This adds a layer of intelligence that aligns perfectly with modern application trends.

### 2.2. Advanced Layout Restoration (`userScripts.execute` API)

*   **API:** `chrome.userScripts.execute()`
*   **Description:** This powerful API allows for the one-time injection of a user script into a specific page at a specific time. Unlike permanently registered content scripts, these are dynamic and executed on demand.
*   **Proposed Feature:** **"Action" Presets.**
    *   Introduce an advanced option when saving a preset that allows a user to attach a small JavaScript snippet to a specific tab within the layout.
    *   When the preset is applied, the extension would use `userScripts.execute()` to run the associated script on that tab after it has loaded.
*   **Example Use Case:**
    *   A **trader** restores their layout. A script automatically logs into their trading platform on one of the restored tabs.
    *   A **developer** restores a layout for a project. A script automatically clicks the "run" button in their local development environment's web UI.
    *   A **designer** restores a layout and a script on their Figma tab automatically selects a specific design component.
*   **Benefit:** This transforms the extension from a simple window manager into a true workflow automation tool for power users, enabling a new level of productivity.

### 2.3. UI Polish & Layout Awareness (`sidePanel.getLayout` API)

*   **API:** `sidePanel.getLayout()`
*   **Description:** A simple but useful new API that allows the extension to determine if the side panel is currently positioned on the left or right side of the browser window.
*   **Proposed Feature:** **Adaptive UI & Future-Proofing.**
    *   While the current UI is symmetrical, this API allows for subtle layout adjustments if we ever introduce more complex, direction-aware components (e.g., pop-out menus, tooltips).
    *   It also ensures the UI feels correct for users of Right-to-Left (RTL) languages, where the panel may default to the left.
*   **Benefit:** A small but significant detail that demonstrates a high level of polish and consideration for all users, making the extension feel more robust and thoughtfully designed.

---

## 3. General UI/UX and Strategic Directions

*   **Deeper Side Panel Integration:** The Side Panel remains the central hub for modern extension UIs. Future development should continue to enrich the side panel experience, making it the primary place for all management and configuration tasks.
*   **Contextual Actions:** Explore using the `action.onUserSettingsChanged` event to provide helpful hints. For example, if a user unpins the extension icon, we could show a one-time message in the side panel reminding them how to access it.
*   **Enhanced User Control & Transparency:** As we add more powerful features (especially those involving AI or scripting), it will be crucial to be transparent about what they do and give users clear control over them. For "Action Presets," this would mean a clear indicator on the preset and a confirmation before running any script.

By embracing these new APIs and trends, we can ensure the Window Layout Manager remains a powerful, modern, and indispensable tool for its users.