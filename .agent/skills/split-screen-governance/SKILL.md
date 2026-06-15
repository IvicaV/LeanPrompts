---
name: Split-Screen Governance
description: Rules and guidelines for modifying the split-screen window management and sizing logic.
---

# Split-Screen Governance

This document outlines the critical rules for managing window states and positions for the LeanPrompts extension, specifically regarding the "Split-Screen" functionality. These rules exist to prevent regressions, particularly cross-browser bugs (such as Opera shrinking the window height).

> **ANY CHANGE to the split-screen sizing logic MUST be reviewed against ALL rules below.**
> Code sections marked with `@PROTECTED_REGION` in `background.js` and `Popup.jsx` MUST NOT be modified without explicit user permission.

---

## 1. The `robustWindowUpdate` Mandate

**CRITICAL RULE:** NEVER use standard `chrome.windows.update` for setting the split-screen layout constraints. You MUST always use the `robustWindowUpdate` helper function.

### Why?
Browsers (like Opera) and Desktop Window Managers (DWM) use smooth animations for window state changes (e.g., from maximized to normal). A single `chrome.windows.update` API call often fires before the animation completes, causing the browser to ignore or override specific dimensions (most commonly the `height` attribute).

### How it works (3-phase pattern):
1. **Phase 1 — Pre-flight Un-Maximize:** Checks if the window is in `maximized`/`fullscreen` state. If so, forces `state: 'normal'` **with `left`/`top` pinning** (see Rule 7), then waits 250ms for DWM to settle.
2. **Phase 2 — Apply Dimensions:** Sends all geometry bounds (left, top, width, height) together with `state: 'normal'`.
3. **Phase 3 — Watchdog Loop:** Polls the actual window state + dimensions up to **10 times** at 150ms intervals. Checks `win.state === 'normal'` AND all 4 dimensions with a 4px tolerance (DPI). Re-applies the full update on each retry iteration.

**NEVER reduce the 4-dimension check (width, height, left, top) back to just width/left.**
**NEVER reduce the state check (`win.state === 'normal'`) — if state is not normal, dimensions are meaningless.**

---

## 2. Protected Code Regions
The background worker (`background.js`) contains specific `@PROTECTED_REGION` blocks. Do NOT modify the core sizing logic within these blocks without explicit user permission. These regions are battle-tested against Chrome, Edge, and Opera.

### Protected Regions in `background.js`:
- `ROBUST_WINDOW_UPDATE` — The `robustWindowUpdate` function (3-phase pattern)
- `SPLIT_SCREEN_SIZING` — The main window + sidebar positioning in `TRIGGER_SPLIT_SCREEN`
- `SPLIT_SCREEN_DEBUG` — The `DEBUG_SPLIT_SCREEN` diagnostic handler
- `SPLIT_SCREEN_LIFECYCLE` — The `chrome.windows.onRemoved` cleanup listener
- Multi-monitor targeting regions

### Protected Regions in `Popup.jsx`:
- `handleHardConnect` — UI deadlock protection
- `POPUP_LAUNCH_TRIGGER` — Injection API usage
- Window targeting in `executePromptAction`
- `SPLIT_SCREEN_DEBUG_OVERLAY` — The Ctrl+Shift+D diagnostic overlay

---

## 3. Window Gap
A small gap between the main browser window and the popup sidebar is intentional. Do not attempt "pixel hacks" (leakage, bridge, edgeGap) to make them perfectly flush, as this causes browser-specific rendering bugs and infinite resizing loops in certain environments.

---

## 4. Window Lifecycle Management (Cleanup)
There is a `@PROTECTED_REGION` at the end of `background.js` featuring a `chrome.windows.onRemoved` event listener.
This lifecycle observer ensures that orphaned sidebars are cleanly closed if the user destroys the main AI window.
**CRITICAL RULE:** Do not remove this observer. If the sidebar is closed manually by the user, we intentionally DO NOT resize the main window back to its original position (to adhere to minimal-invasive principles).

Additionally, to prevent a Manifest V3 Service Worker Lifecycle race condition when the service worker is woken up from hibernation by a window close event, there is an **asynchronous, storage-safe sync listener** at the top of `background.js`. This listener queries `chrome.storage.local` directly to ensure targeting states are cleared even when in-memory variables are not yet hydrated. Any changes to window lifecycle cleanup must preserve this async storage-safe sync pattern.

---

## 5. The `getActiveTab` Mandate (Cross-Window Targeting)
When operating in Split-Screen mode, the extension's sidebar popup runs as its own completely independent window.
**CRITICAL RULE:** Never use `chrome.tabs.query({ active: true, currentWindow: true })` inside popup interactions that may operate in a Split-Screen context.
You MUST always use the custom `getActiveTab()` helper function. This function automatically reads the `targetWindow` parameter from `URLSearchParams` to ensure Chrome queries the active tab of the *Main AI Window*, not the sidebar popup itself.

---

## 6. Connection UI State Locks
When setting React UI states that lock interactions (like `isConnecting = true` during `handleHardConnect`), the asynchronous message passing pipeline MUST be wrapped in a strict `try...finally` block.
**CRITICAL RULE:** Ensure `setIsConnecting(false)` is always called inside a `finally` block to prevent permanent UI lockouts if the Chrome messaging port disconnects unexpectedly or the Browser's Content Security Policy rejects the injection probe.

---

## 7. The Two-Step Un-Maximize + Position-Pinning Pattern
When `robustWindowUpdate` is called on a window that may be in `maximized` or `fullscreen` state, Phase 1 MUST:
1. Force `state: 'normal'` in a **separate** API call
2. Include `left` and `top` from the target bounds to **PIN** the window to the correct display
3. Wait ~250ms for DWM to settle before applying full dimensions

**CRITICAL RULE:** Without position-pinning, Opera restores the window to its "remembered normal" position, which may be on a **DIFFERENT display**. This was the root cause of the Feb 2026 regression where height was 822 (Display 1) instead of 1032 (Display 2).

---

## 8. Geometry-Only Bounds (No `focused` in `robustWindowUpdate`)
The `robustWindowUpdate` function MUST strip non-geometric properties (like `focused`) from the target bounds before passing them to `chrome.windows.update`.
**CRITICAL RULE:** NEVER pass `focused: false` (or `focused: true`) as part of the geometry bounds object. `focused` combined with `state: 'normal'` confuses Opera's DWM and causes it to deprioritize the dimension update. Handle focus separately if needed.

---

## 9. Retry Must Include State
Inside `robustWindowUpdate`'s watchdog retry loop, EVERY retry call MUST include `state: 'normal'`. The original bug (Feb 2026) was caused by the retry loop sending only geometry bounds without the state, allowing Opera to snap back to maximized between iterations.
**CRITICAL RULE:** The watchdog loop MUST verify `win.state === 'normal'` alongside the 4-dimension check. If the state is not `'normal'`, dimensions are meaningless and the retry must re-assert the state.

---

## 10. Debug Overlay (Ctrl+Shift+D)
A diagnostic overlay is available in the popup/sidebar via `Ctrl+Shift+D`. It sends `DEBUG_SPLIT_SCREEN` to the background worker and displays:
- Main window: `state`, `left`, `top`, `width`, `height`
- Sidebar window: `state`, `left`, `top`, `width`, `height`
- All displays: `bounds` and `workArea`
- Internal state: `dedicatedBrowserWindowId`, `sidebarWindowId`

**RULE:** Do not remove this debug capability. It is essential for diagnosing future split-screen issues across browsers. The handler in `background.js` and the overlay in `Popup.jsx` are both marked as `@PROTECTED_REGION`.
