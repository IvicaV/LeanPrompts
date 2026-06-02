/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * This file is part of LeanPrompts Studio.
 * 
 * LeanPrompts Studio is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * ============================================================================
 */
/* @PROTECTED_REGION START: CONTENT_ORCHESTRATOR
   CRITICAL: Import path must point to engine_core. 
   Sequence (Find -> Fingerprint -> Inject) is immutable. */
import { getCurrentAdapter, insertText, injectFiles, findBestTextInput, waitForElement, findAllElementsDeep } from '../engine_core/adapters';

console.log("LeanPrompts: [VER 1.0.5-FINAL] Content Script Active.");

// --- EXTENSION CONTEXT INVALIDATION GUARD ---
// When the extension is reloaded/updated, the runtime context becomes invalid.
// We need to detect this and stop all messaging attempts to prevent console spam.
let isContextValid = true;

function isRuntimeValid() {
  try {
    // This will throw if context is invalidated
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// Cleanup function to be called when context is invalidated
function cleanupOnContextInvalidation() {
  if (!isContextValid) return; // Already cleaned up
  isContextValid = false;
  console.log("LeanPrompts: Extension context invalidated. Cleaning up listeners.");

  // === ZERO-REGRESSION GUARD: Beendet asynchrone Polling-Loops hart ===
  window.__LP_CONTEXT_INVALIDATED = true; 

  // Remove all event listeners
  document.removeEventListener('selectionchange', selectionChangeHandler);
  document.removeEventListener('contextmenu', contextMenuHandler, true);
  document.removeEventListener('mouseup', mouseUpHandler);
  document.removeEventListener('mousedown', mouseDownHandler);
  document.removeEventListener('keyup', keyUpHandler);
  document.removeEventListener('focus', focusHandler, true);

  // === ZERO-REGRESSION GUARD START ===
  // Safely remove manual override overlay if context crashes
  const overlay = document.querySelector('.lp-selection-overlay');
  if (overlay) overlay.remove();
  document.body.classList.remove('lp-selection-mode');
  const styleTag = document.getElementById('lp-manual-mode-styles');
  if (styleTag) styleTag.remove();
  // === ZERO-REGRESSION GUARD END ===
}

// Safe wrapper for chrome.runtime.sendMessage
function safeSendMessage(message) {
  if (!isContextValid || !isRuntimeValid()) {
    cleanupOnContextInvalidation();
    return Promise.resolve(null);
  }

  try {
    return chrome.runtime.sendMessage(message).catch((error) => {
      if (error?.message?.includes('Extension context invalidated') ||
        error?.message?.includes('Receiving end does not exist')) {
        cleanupOnContextInvalidation();
      }
      return null;
    });
  } catch (e) {
    cleanupOnContextInvalidation();
    return Promise.resolve(null);
  }
}

// Safe wrapper for sendResponse to prevent errors after context invalidation
function safeSendResponse(sendResponse, data) {
  if (!isContextValid || !isRuntimeValid()) {
    return;
  }
  try {
    sendResponse(data);
  } catch (e) {
    // Context invalidated, ignore
  }
}

function showStatus(message, isError = false, duration = 3000, showSpinner = false, showReportBtn = false) {
  const statusId = 'lp-status-toast';
  let el = document.getElementById(statusId);
  if (el) el.remove();

  el = document.createElement("div");
  el.id = statusId;

  // Premium High-Contrast Glassmorphism (Abwärtskompatibel)
  let bg = "rgba(16, 185, 129, 0.88) !important"; // Default Green (isError === false)
  if (isError === true || isError === 'error') bg = "rgba(220, 38, 38, 0.88) !important"; // Red
  if (isError === 'warning') bg = "rgba(245, 158, 11, 0.88) !important"; // Amber

  el.style.cssText = `
    all: unset !important;
    position: fixed !important;
    top: 24px !important;
    right: 24px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    background: ${bg};
    backdrop-filter: blur(20px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
    color: #ffffff !important;
    padding: 14px 28px !important;
    border-radius: 14px !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
    font-weight: 600 !important;
    font-size: 15px !important;
    line-height: 1.2 !important;
    border: 1px solid rgba(255, 255, 255, 0.35) !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3) !important;
    pointer-events: none !important;
    opacity: 1 !important;
    visibility: visible !important;
    white-space: nowrap !important;
  `;

// Update Icon based on State (Abwärtskompatibel)
  let iconMarkup = '';
  if (showSpinner) {
    iconMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2C6.47715 2 2 6.47715 2 12" stroke-opacity="1"></path></svg>`;
  } else {
    iconMarkup = (isError === true || isError === 'error')
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : isError === 'warning'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  }

  // SECURITY FIX: Safe XML Parsing using native DOMParser to clear Store Linters.
  // If parsing fails, fall back to insertAdjacentHTML to guarantee visual consistency.
  let svgInserted = false;
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(iconMarkup, 'image/svg+xml');
      const svgNode = parsedDoc.documentElement;
      
      if (svgNode && svgNode.tagName.toLowerCase() === 'svg') {
        svgNode.setAttribute('width', '20');
        svgNode.setAttribute('height', '20');
        svgNode.style.flexShrink = '0';
        el.insertBefore(svgNode, el.firstChild);
        svgInserted = true;
      }
    } catch (e) {
      // Quiet fallback to prevent filling the chrome://extensions developer dashboard
    }
  }

  if (!svgInserted) {
    try {
      el.insertAdjacentHTML('afterbegin', iconMarkup);
    } catch (insertAdjacentError) {
      // Quiet fallback for strict CSP / Trusted Types environments (e.g. Claude.ai)
      // The status text is still displayed correctly, only the SVG icon is omitted.
    }
  }

  // Create the text node purely via DOM API to guarantee zero XSS execution,
  // even if 'message' contains unexpected external payload.
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  el.appendChild(textSpan);

  // === ZERO-REGRESSION: REPORT BUTTON (Völlig isoliertes DOM-Element) ===
  if (showReportBtn) {
    const reportBtn = document.createElement('button');
    reportBtn.textContent = "Report Issue";
    // Inline-Styles mit !important garantieren Schutz vor CSS-Bleeding der Host-Seite
    reportBtn.style.cssText = `
      all: unset !important;
      margin-left: 12px !important;
      background: rgba(255, 255, 255, 0.15) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      padding: 6px 12px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      color: #ffffff !important;
      transition: all 0.2s ease !important;
      box-sizing: border-box !important;
    `;
    
    // JS-basierte Hover-States (sicher in Content-Scripts)
    reportBtn.onmouseenter = () => reportBtn.style.background = "rgba(255, 255, 255, 0.25)";
    reportBtn.onmouseleave = () => reportBtn.style.background = "rgba(255, 255, 255, 0.15)";
    reportBtn.onmousedown = () => reportBtn.style.transform = "scale(0.95)";
    reportBtn.onmouseup = () => reportBtn.style.transform = "scale(1)";

    // SAFE ACTION: Nutzt deine bestehenden, abgesicherten Wrapper
    reportBtn.onclick = () => {
      if (!isContextValid || !isRuntimeValid()) return; // Schutz vor Extension-Crashes
      chrome.storage.local.set({ lp_navigation_signal: { action: 'openFeedback', timestamp: Date.now() } });
      safeSendMessage({ action: "OPEN_DASHBOARD" });
      if (el && el.parentNode) el.remove();
    };

    el.appendChild(reportBtn);
  }
  // === ENDE REPORT BUTTON ===

  (document.documentElement || document.body).appendChild(el);

  // CSP-safe animations via Web Animations API (no stylesheet manipulation needed)
  el.animate([
    { opacity: 0, transform: 'translateX(40px) scale(0.95)' },
    { opacity: 1, transform: 'translateX(0) scale(1)' }
  ], {
    duration: 500,
    easing: 'cubic-bezier(0.2, 1, 0.3, 1)'
  });

  // Spinner rotation via API (if applicable)
  if (showSpinner) {
    const svgEl = el.querySelector('svg');
    if (svgEl) {
      svgEl.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(360deg)' }
      ], {
        duration: 1200,
        iterations: Infinity
      });
    }
  }

  // Auto-dismiss logic (Duration = 0 means persistent)
  if (duration > 0) {
    setTimeout(() => {
      if (el && el.parentNode) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px) scale(0.95)';
        el.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        setTimeout(() => el.remove(), 400);
      }
    }, duration);
  }
}

// STRICT WAITING: CPU-Efficient throttled rAF loop
async function waitUntil(conditionFn, timeout = 5000) {
  const start = Date.now();
  return new Promise((resolve) => {
    let lastRun = 0;
    const loop = () => {
      const now = Date.now();
      // Throttle heavy DOM polling to every 200ms instead of 60fps
      if (now - lastRun >= 200) {
        lastRun = now;
        if (conditionFn()) {
          resolve(true);
          return;
        }
      }
      if (Date.now() - start > timeout) {
        resolve(false);
        return;
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
}

// Fingerprinting System for DOM Stability
const getEditorState = (editorEl) => {
  if (!editorEl) return "";
  // We count potential file chips (images, buttons, svgs)
  // Wider search: look in parent and siblings to find chips that might be outside the direct editor container
  const container = editorEl.closest('div[class*="editor"], [role="main"], [class*="prompt"], [class*="composer"], body') || editorEl;

  // Use Deep Search for Shadow DOM support (AI Studio, Gemini, etc.)
  const chips = findAllElementsDeep(container, el => {
    if (!el.tagName || !el.getAttribute) return false;
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute('class') || "").toLowerCase();
    const role = (el.getAttribute('role') || "").toLowerCase();
    return tag === 'img' || tag === 'svg' || tag === 'ms-file-chip' || tag === 'button' || role === 'button' ||
      cls.includes('chip') || cls.includes('attachment') || cls.includes('file') || cls.includes('progress');
  });

  // Also check pure text length as fallback
  const textLen = (editorEl.value || editorEl.innerText || "").length;
  return `${chips.length}:${textLen}`;
};

// Optimized: One single DOM walk to find ALL staged/visible filename markers
function getStagedFileContent(container = document, excludeInput = null) {
  const candidates = findAllElementsDeep(container, el => {
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    if (excludeInput && (el === excludeInput || excludeInput.contains(el))) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'img' || tag === 'span' || tag === 'div' || tag === 'button' || tag === 'ms-file-chip';
  });

  return candidates.map(el => (
    el.innerText ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('alt') ||
    el.getAttribute('data-name') ||
    el.getAttribute('data-filename') ||
    (el.tagName === 'IMG' ? el.getAttribute('src') : "") ||
    ""
  ).toLowerCase());
}

function isInjectionRedundant(inputField, request) {
  const normalizeText = (t) => (t || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*#_~`>+\-]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const currentTextLocal = normalizeText(inputField.value || inputField.innerText || "");
  const incomingText = normalizeText(request.text || "");
  const textAlreadyPresent = !incomingText || currentTextLocal.includes(incomingText);

  // Files Redundancy: Single DOM pass for efficiency
  const incomingFiles = request.files || [];
  if (incomingFiles.length === 0) {
    return { isFullyRedundant: textAlreadyPresent, textAlreadyPresent, filesToInject: [] };
  }

  // Find the prompt area to scan for files
  const promptArea = (() => {
    let container = inputField;
    let bestCandidate = inputField.parentElement;
    for (let i = 0; i < 10 && container && container !== document.body && container !== document.documentElement; i++) {
      container = (container instanceof ShadowRoot) ? container.host : container.parentNode;
      if (!container || container === document) break;
      const tag = container.tagName?.toLowerCase() || "";
      const cls = typeof container.className === 'string' ? container.className.toLowerCase() : "";
      if (tag === 'article' || cls.includes('message-list') || cls.includes('chat-history')) break;
      if (container.getBoundingClientRect && container.getBoundingClientRect().height < window.innerHeight * 0.85) {
        bestCandidate = container;
      }
    }
    return bestCandidate;
  })();

  const stagedContents = getStagedFileContent(promptArea, inputField);
  const filesToInject = incomingFiles.filter(f => {
    const parts = f.name.toLowerCase().split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const token = parts.join('.').substring(0, 12).trim();
    if (!token) return true;
    return !stagedContents.some(content => content.includes(token) && (ext === '' || content.includes(ext)));
  });

  return {
    isFullyRedundant: textAlreadyPresent && filesToInject.length === 0,
    textAlreadyPresent,
    filesToInject
  };
}

const isProcessing = { current: false, startTime: null };
let lastInjectionTime = 0; // Guard for double-firing
let manualOverrideElement = null; // Stores user-selected element

// GLOBAL TRACKING
let cleanupCurrentSelectionMode = null;
let highlightTimer = null;
let highlightElementRef = null;

// Helper: Apply temporary highlight
const highlightElement = (el) => {
  if (!el) return;

  // Clear previous
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    if (highlightElementRef) {
      highlightElementRef.style.outline = '';
      highlightElementRef.style.transition = '';
    }
  }

  const originalOutline = el.style.outline;
  const originalTransition = el.style.transition;

  highlightElementRef = el;
  el.style.transition = 'outline 0.2s ease';
  el.style.outline = '3px solid #3b82f6'; // Tailwind Blue-500
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Cleanup Timer
  highlightTimer = setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.transition = originalTransition;
    highlightTimer = null;
    highlightElementRef = null;
  }, 2000);
};

// Wrap the entire listener in try-catch to prevent uncaught errors
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Early guard against context invalidation
    if (!isContextValid || !isRuntimeValid()) {
      cleanupOnContextInvalidation();
      return false;
    }

    // PING HANDLER (Synchronous)
    if (request.action === "PING") {
      sendResponse({ status: "PONG" });
      return false;
    }

    // TOAST HANDLER (Minimal-Invasiv, nutzt bestehende CSS-Isolierung)
    if (request.action === "SHOW_TOAST") {
      showStatus(request.message, false, 3000);
      sendResponse({ success: true });
      return false;
    }

    // CHECK COMPATIBILITY HANDLER (Async with Polling)
    if (request.action === "CHECK_COMPATIBILITY_v105") {
      // 1. Check Manual Override first (instant)
      if (manualOverrideElement && document.body.contains(manualOverrideElement)) {
        sendResponse({
          isSupported: true,
          hasInput: true,
          name: "Manual Connection",
          isManual: true
        });
        return false;
      }

      // 2. Async: Poll for input field (fast LLMs respond immediately, slow SPAs get time)
      (async () => {
        const adapter = getCurrentAdapter(window.location.hostname);

        // Poll for input with 5s max timeout (resolves immediately if found)
        const inputField = await waitForElement(() => {
          return adapter ? adapter.getInput() : findBestTextInput();
        }, 5000);

        // Check for disabled fields if no input found
        let reason = null;
        if (!inputField) {
          const disabledField = findAllElementsDeep(document, (el) => {
            const tag = el.tagName.toLowerCase();
            return (tag === 'textarea' || tag === 'input' || el.isContentEditable) && (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true');
          })[0];
          if (disabledField) reason = "LOGIN_REQUIRED";
        }

        sendResponse({
          isSupported: !!adapter || !!inputField,
          hasInput: !!inputField,
          name: adapter?.name || (inputField ? "Generic" : null),
          reason,
          version: "1.0.5-FIX"
        });
      })();

      return true; // Keep channel open for async response
    }


    // HIGHLIGHT TARGET HANDLER
    if (request.action === "HIGHLIGHT_TARGET") {
      let target = null;
      if (manualOverrideElement && document.body.contains(manualOverrideElement)) {
        target = manualOverrideElement;
      } else {
        const adapter = getCurrentAdapter(window.location.hostname);
        target = adapter ? adapter.getInput() : findBestTextInput();
      }

      if (target) {
        highlightElement(target);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      return false;
    }

    // SELECTION MODE HANDLER ("Point & Click")
    if (request.action === "START_SELECTION_MODE") {
      // 1. Overlay for visual tint only (allow scrolling through it)
      const overlay = document.createElement('div');
      overlay.className = 'lp-selection-overlay'; // For easy removal
      overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(59, 130, 246, 0.1);
      z-index: 2147483647;
      pointer-events: none;
    `;

      // Toast instruction
      const toast = document.createElement('div');
      toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: #1f2937; color: white; padding: 10px 20px; border-radius: 8px;
      font-family: sans-serif; font-size: 14px; font-weight: bold;
      pointer-events: none;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    `;
      toast.innerText = "Click on the input field. (Esc to cancel)";
      overlay.appendChild(toast);

      document.body.appendChild(overlay);

      // 2. GLOBAL CURSOR OVERRIDE (Robust Inline Injection + Class)
      document.body.classList.add('lp-selection-mode');

      // Explicitly inject style tag as fallback/guarantee for the border and cursor
      // This solves the issue where the external CSS file might not load or be blocked
      const styleId = 'lp-manual-mode-styles';
      let styleTag = document.getElementById(styleId);
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.textContent = `
            body.lp-selection-mode {
                cursor: crosshair !important;
                position: relative;
            }
            body.lp-selection-mode * {
                cursor: crosshair !important;
            }
            body.lp-selection-mode::after {
                content: "";
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                border: 4px solid #3b82f6;
                background: rgba(59, 130, 246, 0.05);
                z-index: 2147483647;
                pointer-events: none;
                box-shadow: inset 0 0 20px rgba(59, 130, 246, 0.2);
                animation: lp-fade-in 0.3s ease-out;
            }
            @keyframes lp-fade-in { from { opacity: 0; } to { opacity: 1; } }
            body.lp-selection-mode *:hover {
                outline: 2px solid #3b82f6 !important;
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(styleTag);
      }

      // 3. CAPTURE CLICK ON WINDOW
      const clickHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();

        const target = e.target;
        const tag = target.tagName.toLowerCase();

        // VALIDATION: Strict check for text-entry fields
        const isInput = tag === 'input' && (target.type === 'text' || target.type === 'search' || !target.type);
        const isTextarea = tag === 'textarea';
        const isEditable = target.isContentEditable || target.getAttribute('contenteditable') === 'true';
        const isProsemirror = target.classList.contains('ProseMirror'); // Special case for common editors
        const isLexical = target.getAttribute('data-lexical-editor') === 'true';
        const isMonaco = target.classList.contains('monaco-editor');

        if (!isInput && !isTextarea && !isEditable && !isProsemirror && !isLexical && !isMonaco) {
          // Failure Feedback
          showStatus("Please select a text input field", 2000);
          const originalOutline = target.style.outline;
          target.style.transition = 'outline 0.1s';
          target.style.outline = '3px solid #ef4444'; // Red
          setTimeout(() => {
            target.style.outline = originalOutline;
          }, 500);
          return; // Do NOT finish
        }

        manualOverrideElement = target;

        // Visual feedback (Green flash)
        target.style.outline = '3px solid #10b981';
        setTimeout(() => target.style.outline = '', 1000);

        showStatus(`Connected to ${tag}`, 2000);

        finish();
      };

      // Escape to cancel
      const escHandler = (e) => {
        if (e.key === 'Escape') finish();
      };

      // Cleanup Function
      const finish = () => {
        if (document.body.contains(overlay)) overlay.remove();
        document.body.classList.remove('lp-selection-mode');
        const styleTag = document.getElementById('lp-manual-mode-styles');
        if (styleTag) styleTag.remove();

        window.removeEventListener('click', clickHandler, { capture: true });
        window.removeEventListener('keydown', escHandler, { capture: true }); // Clean capture listener
        cleanupCurrentSelectionMode = null;
      };

      // Register Global Cleanup
      cleanupCurrentSelectionMode = finish;

      window.addEventListener('click', clickHandler, { capture: true, once: true });
      window.addEventListener('keydown', escHandler, { capture: true, once: true }); // Capture phase for Robustness

      // VERIFICATION: Check if overlay is actually in DOM
      const isOverlayInDom = document.body.contains(overlay);
      if (!isOverlayInDom) {
        console.error("LeanPrompts: CRITICAL - Overlay failed to attach.");
        // Cleanup if failed
        finish();
        sendResponse({ success: false, started: false, error: "DOM_ATTACH_FAILED" });
        return false;
      }

      sendResponse({ success: true, started: true });
      return false;
    }

    // STOP SELECTION MODE HANDLER (Cancel)
    if (request.action === "STOP_SELECTION_MODE") {
      if (cleanupCurrentSelectionMode) {
        cleanupCurrentSelectionMode();
        cleanupCurrentSelectionMode = null;
      }
      // Double check manual cleanup
      const overlay = document.querySelector('.lp-selection-overlay');
      if (overlay) overlay.remove();
      document.body.classList.remove('lp-selection-mode');
      const styleTag = document.getElementById('lp-manual-mode-styles');
      if (styleTag) styleTag.remove();

      sendResponse({ success: true });
      return false;
    }

    // REMOVE HIGHLIGHT HANDLER (Explicit Cleanup)
    if (request.action === "REMOVE_HIGHLIGHT") {
      // Clear any pending clear timer from HIGHLIGHT_TARGET
      if (highlightTimer) {
        clearTimeout(highlightTimer);
        const el = highlightElementRef;
        if (el) {
          el.style.outline = '';
          el.style.transition = '';
        }
        highlightTimer = null;
        highlightElementRef = null;
      }
      sendResponse({ success: true });
      return false;
    }

    // INJECT_PROMPT HANDLER (Async with State Protection)
    if (request.action === "INJECT_PROMPT_v105") {
      // 1. Frame Guard: Prevent injection in hidden/utility iframes (avoids multi-injection)
      if (window.self !== window.top) {
        const style = window.getComputedStyle(window.frameElement || document.documentElement);
        if (style.display === 'none' || style.visibility === 'hidden' || window.innerWidth < 50 || window.innerHeight < 50) {
          return false;
        }
      }

      // 2. ATOMIC INJECTION LOCK (Phase 3: Strictly Synchronous)
      const now = Date.now();
      if (isProcessing.current) {
        // Safety check: If lock is older than 12s, release it
        if (isProcessing.startTime && now - isProcessing.startTime > 12000) {
          isProcessing.current = false;
        } else {
          sendResponse({ success: false, reason: "BUSY" });
          return false;
        }
      }

      // Engage lock synchronously BEFORE any async yields
      isProcessing.current = true;
      isProcessing.startTime = now;

      // 3. Collision Guard (Debounce)
      if (now - lastInjectionTime < 800) {
        isProcessing.current = false; // Release lock if it's a de-facto duplicate
        sendResponse({ success: true, status: "SKIPPED_DUPLICATE" });
        return false;
      }

      (async () => {
        try {
          const adapter = getCurrentAdapter(window.location.hostname);

          // A) FIND (Load-Aware Hydration Loop)
          // We wait as long as the page is loading, then add a 10s grace period for hydration.
          let connectingToastShown = false;
          let manualOverrideToastShown = false;
          let pageCompleteTime = null;
          const HYDRATION_GRACE_PERIOD = 10000; // 10s after 'complete'

          const inputField = await waitForElement(() => {
            // 1. Manual Override Priority
            if (manualOverrideElement && document.body.contains(manualOverrideElement)) {
              return manualOverrideElement;
            }

            // 2. Optimized Discovery: Prioritize direct adapter query
            // Avoid calling findBestTextInput (which scans the whole DOM) on every polling tick
            if (adapter) {
              const el = adapter.getInput();
              if (el) {
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') return el;
              }
            } else {
              // Only run global heuristic search if no specific adapter is available
              const el = findBestTextInput();
              if (el) return el;
            }

            // 3. Progressive Feedback
            const timeElapsed = Date.now() - isProcessing.startTime;
            if (!connectingToastShown && adapter && timeElapsed > 2500) {
              showStatus(`Connecting to ${adapter.name}...`, false, 2000);
              connectingToastShown = true;
            }

            // PHASE 2: Wait patiently without false positive toasts.

            // 4. Persistence Check: Stay patient as long as page is loading
            const isComplete = document.readyState === 'complete';
            if (isComplete && !pageCompleteTime) {
              pageCompleteTime = Date.now();
            }

            // Return false to keep polling, but we'll handle the timeout manually below
            return null;
          }, 25000); // 25s max safety timeout (stays under Chrome's 30s Service Worker watchdog)

          // MANUAL TIMEOUT LOGIC: Re-evaluate if we should actually give up
          // We only give up if:
          // (Page is complete AND grace period passed) OR (Total timeout 120s reached)
          if (!inputField) {
            const totalElapsed = Date.now() - isProcessing.startTime;
            const isComplete = document.readyState === 'complete';
            const graceElapsed = pageCompleteTime ? (Date.now() - pageCompleteTime) : 0;

            if (!isComplete || graceElapsed < HYDRATION_GRACE_PERIOD) {
              // If we hit the 120s and it's still not found, then it's a real failure
              if (totalElapsed < 120000) {
                // This branch shouldn't really be hit because waitForElement polls, 
                // but for clarity: we want to keep waiting.
              }
            }

            // If we reach here and still no inputField, throw the appropriate error
            if (window.self !== window.top) {
              throw new Error("SILENT_FRAME_MISSING");
            }

            const msg = !isComplete
              ? `${adapter?.name || 'LLM'} is still loading. Please wait until the page is ready.`
              : "Input field not found. The LLM's interface may have changed.";

            throw new Error(msg);
          }

          // B) STATE-AWARE COLLISION DETECTION
          const redundancy = isInjectionRedundant(inputField, request);

          if (redundancy.isFullyRedundant) {
            showStatus("Prompt already staged", false, 3000);
            sendResponse({ success: true, status: "SKIPPED_REDUNDANT" });
            return;
          }

          // BUGFIX: Show global English spinner toast AFTER redundancy check
          showStatus("Injecting...", false, 0, true);

          // === GRACEFUL DEGRADATION: File failure must NOT block text injection ===
          let filesFailed = false;

          // C) INJECT FILES (If missing)
          if (redundancy.filesToInject.length > 0) {
            // FRAME GUARD: Only the top frame may inject files to prevent multi-frame duplication.
            // Sub-frames on platforms like AI Studio can independently discover the same file input,
            // causing the same file to be uploaded multiple times via parallel dispatch.
            if (window.self !== window.top) {
              console.log("LeanPrompts: Skipping file injection in sub-frame (dedup guard).");
            } else {
              const initialFingerprint = getEditorState(inputField.parentElement?.parentElement || inputField);

              const fileSuccess = await injectFiles(redundancy.filesToInject, adapter?.name);

              if (!fileSuccess) {
                // Soft-fail: Flag but do NOT abort — text injection must continue
                filesFailed = true;
                console.warn("LeanPrompts: File injection failed. Proceeding with text injection.");
              } else {
                // Wait for DOM to React (only when files were actually injected)
                await waitUntil(() => {
                  const currentFingerprint = getEditorState(inputField.parentElement?.parentElement || inputField);
                  return currentFingerprint !== initialFingerprint;
                }, 4000);

                await new Promise(r => setTimeout(r, 1200));
              }
            }
          } else if (request.files && request.files.length > 0) {
            // All files already present, but maybe text is missing? 
            // If text was also present, we would have caught it in isFullyRedundant.
          }

          // D) INJECT TEXT (If missing)
          if (request.text && !redundancy.textAlreadyPresent) {
            let success = await insertText(inputField, request.text, adapter?.name);

            // BING SPECIFIC FIX: Dispatch extra events to wake up the UI
            if (adapter?.name === "Bing Image Creator") {
              inputField.dispatchEvent(new Event('keydown', { bubbles: true }));
              inputField.dispatchEvent(new Event('keypress', { bubbles: true }));
              inputField.dispatchEvent(new Event('keyup', { bubbles: true }));
              setTimeout(() => inputField.dispatchEvent(new Event('input', { bubbles: true })), 50);
            }

            if (!success) throw new Error("Injection strategy failed");
          } else if (request.text && redundancy.textAlreadyPresent) {
            console.log("LeanPrompts: Text already present, skipping part C");
          }

          lastInjectionTime = Date.now(); // SET COLLISION GUARD
          sendResponse({ success: true });

          // Conditional feedback: Warn user if files failed, otherwise normal success
          if (filesFailed) {
            showStatus("Text injected. Please attach files manually.", true, 6000);
          } else {
            showStatus("Prompt synchronized!");
          }

          // --- POST-INJECTION UI CLEANUP (Minimal-Invasive) ---
          if (adapter?.name === "Google AI Studio") {
            // Dismiss the import overlay by clicking the background backdrop
            const backdrop = document.querySelector('.cdk-overlay-backdrop');
            if (backdrop) backdrop.click();
            // Restore focus to ensure any remaining popups release
            if (inputField) inputField.focus();
          }

        } catch (error) {
          // BUGFIX: Cleanup hanging spinner on error
          const el = document.getElementById('lp-status-toast');
          if (el && el.innerText.includes("Injecting")) el.remove();

          if (error.message !== "SILENT_FRAME_MISSING") {
            console.error("LeanPrompts Injection Error:", error);
            
            // --- START: ZERO-REGRESSION AUTO-COPY UI ---
            const hasFiles = request.files && request.files.length > 0;
            const uiMessage = hasFiles 
                ? `Auto-Inject blocked. Press Ctrl+V to paste text. ⚠️ ATTACH FILES MANUALLY!`
                : `Auto-Inject blocked. Press Ctrl+V to paste.`;
            
            showStatus(uiMessage, 'warning', hasFiles ? 10000 : 8000, false, true);
            sendResponse({ success: false, error: uiMessage, fallbackText: request.text });
            // --- END: ZERO-REGRESSION AUTO-COPY UI ---

          } else {
            // Send a response so the caller isn't left hanging, but mark it as silent
            sendResponse({ success: false, silent: true });
          }
        } finally {
          isProcessing.current = false;
          isProcessing.startTime = null;
        }
      })();

      return true;
    }

    // Fallback
    try { sendResponse({ status: "ignored" }); } catch (e) { }
    return false;
  });
} catch (e) {
  // Extension context invalidated during listener registration
  console.log("LeanPrompts: Could not register message listener - context may be invalidated");
}
// --- SELECTION & CONTEXT TRACKING FOR CONTEXT MENU ---
const getContextState = (target = null) => {
  const selectionObj = window.getSelection() || document.getSelection();
  let selectionText = selectionObj ? selectionObj.toString().trim() : "";

  const activeEl = target || document.activeElement;
  let isEditable = false;
  let hasSelection = selectionText.length > 0;

  if (activeEl) {
    const tag = activeEl.tagName?.toLowerCase();
    const type = activeEl.type?.toLowerCase();

    // Check for editability
    isEditable = activeEl.isContentEditable ||
      tag === 'textarea' ||
      (tag === 'input' && ['text', 'search', 'url', 'email', 'password', 'number', 'tel'].includes(type));

    // Special case: Selection inside inputs/textareas
    if (!hasSelection && (tag === 'textarea' || tag === 'input')) {
      try {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (typeof start === 'number' && typeof end === 'number' && start !== end) {
          selectionText = activeEl.value.substring(start, end).trim();
          hasSelection = selectionText.length > 0;
        }
      } catch (e) { /* Some input types don't support selection */ }
    }
  }

  return { hasSelection, isEditable, selectionText };
};

const sendContextUpdate = (target = null) => {
  const state = getContextState(target);
  // Use safe wrapper to prevent errors when context is invalidated
  safeSendMessage({
    action: "UPDATE_CONTEXT_STATE",
    ...state
  });
};

// Named handlers for event listeners (so they can be removed on context invalidation)
const selectionChangeHandler = () => sendContextUpdate();
const contextMenuHandler = (e) => sendContextUpdate(e.target);
const mouseUpHandler = () => sendContextUpdate();
const mouseDownHandler = () => sendContextUpdate();
const keyUpHandler = () => sendContextUpdate();
const focusHandler = (e) => sendContextUpdate(e.target);

// Listeners for activity (Selection Tracking)
document.addEventListener('selectionchange', selectionChangeHandler);
document.addEventListener('contextmenu', contextMenuHandler, true);
document.addEventListener('mouseup', mouseUpHandler);
document.addEventListener('mousedown', mouseDownHandler);
document.addEventListener('keyup', keyUpHandler);
document.addEventListener('focus', focusHandler, true);

// Initial state sync
if (document.readyState === 'complete') {
  sendContextUpdate();
  checkLinkedInShare();
} else {
  window.addEventListener('DOMContentLoaded', () => {
    sendContextUpdate();
    checkLinkedInShare();
  });
  window.addEventListener('load', () => sendContextUpdate());
}

function checkLinkedInShare() {
  if (window.location.hostname === 'www.linkedin.com' && isRuntimeValid()) {
    chrome.storage.local.get(['lp_linkedin_pending_share'], (result) => {
      if (result.lp_linkedin_pending_share) {
        showStatus("LeanPrompts: Preparing share... LinkedIn may take a moment to load the text.", false, 10000);
        chrome.storage.local.remove('lp_linkedin_pending_share');
      }
    });
  }
}

// Handler for background script to query state
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Guard against context invalidation
    if (!isContextValid || !isRuntimeValid()) {
      cleanupOnContextInvalidation();
      return false;
    }

    if (request.action === "GET_CONTEXT_STATE") {
      try {
        sendResponse(getContextState());
      } catch (e) { /* ignore */ }
      return false;
    }
  });
} catch (e) {
  // Extension context invalidated
}

/* @PROTECTED_REGION END: CONTENT_ORCHESTRATOR */

