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
// -----------------------------------------------------------------------------
// GLOBAL STARTUP & DIAGNOSTICS
// -----------------------------------------------------------------------------
console.log("LeanPrompts: Background Service Worker is STARTING...");

// Global Error Handler for the Service Worker itself
self.addEventListener('error', (event) => {
  console.error("LeanPrompts SW Error:", event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error("LeanPrompts SW Unhandled Rejection:", event.reason);
});

import { dbAPI } from './utils/db';
import { SEED_PROMPTS, SEED_SNIPPETS } from './utils/seedData';
import { Adapters } from './engine_core/adapters';
import { backupManager } from './utils/backup';

// --- DYNAMIC CONTENT SCRIPT INJECTION HELPER ---
async function ensureContentScriptActive(tabId) {
  try {
    // 1. Sende eine Testnachricht, um zu prüfen ob das Skript bereits geladen ist
    const isActive = await new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { action: "PING" }, (response) => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(response && (response.status === "ACK" || response.status === "PONG"));
      });
      setTimeout(() => resolve(false), 250); // Erhöht auf 250ms für verbesserte Toleranz bei hoher Systemlast
    });

    if (isActive) return true;

    // 2. Falls inaktiv, prüfe über executeScript, ob das Skript bereits im Window-Kontext aktiv ist.
    // Dies schützt zuverlässig vor doppelten Injektionen bei hoher Auslastung des Message-Ports.
    const isAlreadyInjected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__LP_CONTENT_SCRIPT_ACTIVE
    }).then(results => results?.[0]?.result).catch(() => false);

    if (isAlreadyInjected) {
      return true;
    }

    // 3. Falls gänzlich inaktiv, lade das Skript über die scripting-API dynamisch nach
    const manifest = chrome.runtime.getManifest();
    const contentScript = manifest.content_scripts?.[0]?.js?.[0];
    
    if (contentScript) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [contentScript]
      });
      // Kurze Pause für die Registrierung des Skripts
      await new Promise(r => setTimeout(r, 150));
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`LeanPrompts: Dynamic injection failed for tab ${tabId}:`, err);
    return false;
  }
}

/**
 * Validiert die Struktur eines eingehenden externen Workflows defensiv.
 * Verhindert, dass korrupte Daten in die IndexedDB geschrieben werden.
 */
function validateWorkflowPayload(data) {
  if (!data || typeof data !== 'object') return false;
  
  // Ein valider Workflow-Import benötigt zwingend ein Prompt-Objekt mit ID und Titel
  const prompt = data.prompt;
  if (!prompt || typeof prompt !== 'object') return false;
  if (typeof prompt.id !== 'string' || typeof prompt.title !== 'string') return false;
  
  // Die optionalen Arrays für Snippets und KnowledgeBase müssen, falls vorhanden, Arrays sein
  if (data.snippets && !Array.isArray(data.snippets)) return false;
  if (data.knowledgeBase && !Array.isArray(data.knowledgeBase)) return false;
  
  return true;
}

// GLOBAL STATE FOR SPLIT SCREEN TARGETING
let dedicatedBrowserWindowId = null;
let sidebarWindowId = null;

// GLOBAL STATE FOR INJECTION LOCKING (Tab-specific) - PERSISTENT
// We use chrome.storage.session to survive Service Worker hibernation
async function getInjectionLock(tabId) {
  const data = await chrome.storage.session.get(`lock_${tabId}`);
  return data[`lock_${tabId}`] || null;
}

async function setInjectionLock(tabId, timestamp) {
  await chrome.storage.session.set({ [`lock_${tabId}`]: timestamp });
}

async function releaseInjectionLock(tabId) {
  await chrome.storage.session.remove(`lock_${tabId}`);
}

async function getReinjectionGuard(tabId) {
  const data = await chrome.storage.session.get(`guard_${tabId}`);
  return data[`guard_${tabId}`] || null;
}

async function setReinjectionGuard(tabId, timestamp) {
  await chrome.storage.session.set({ [`guard_${tabId}`]: timestamp });
}

async function releaseReinjectionGuard(tabId) {
  await chrome.storage.session.remove(`guard_${tabId}`);
}

// Load persisted IDs on startup (Defensive Alive Validation to prevent stale targeting states)
chrome.storage.local.get(['dedicatedWindowId', 'sidebarWindowId']).then(async (data) => {
  const dedicatedAlive = data.dedicatedWindowId ? await validateTargetWindow(data.dedicatedWindowId) : false;
  const sidebarAlive = data.sidebarWindowId ? await validateTargetWindow(data.sidebarWindowId) : false;

  dedicatedBrowserWindowId = dedicatedAlive ? data.dedicatedWindowId : null;
  sidebarWindowId = sidebarAlive ? data.sidebarWindowId : null;

  if ((data.dedicatedWindowId && !dedicatedAlive) || (data.sidebarWindowId && !sidebarAlive)) {
    await chrome.storage.local.set({
      dedicatedWindowId: dedicatedBrowserWindowId,
      sidebarWindowId: sidebarWindowId
    });
  }
  console.log("LeanPrompts: Restored validated targeting state:", { dedicatedBrowserWindowId, sidebarWindowId });
});

// Windows Cleanup: Clear IDs when windows are closed (Asynchronous Storage-Safe Sync)
chrome.windows.onRemoved.addListener(async (windowId) => {
  try {
    const data = await chrome.storage.local.get(['dedicatedWindowId', 'sidebarWindowId']);
    const storedDedicatedId = data.dedicatedWindowId;
    const storedSidebarId = data.sidebarWindowId;

    if (windowId === storedDedicatedId) {
      // Main window closed: close orphaned sidebar if it exists
      if (storedSidebarId) {
        chrome.windows.remove(storedSidebarId).catch(() => { /* Already closed by user or OS */ });
      }
      dedicatedBrowserWindowId = null;
      sidebarWindowId = null;
      await chrome.storage.local.set({ dedicatedWindowId: null, sidebarWindowId: null });
      console.log("LeanPrompts: Dedicated browser window closed (Storage Sync).");
    } else if (windowId === storedSidebarId) {
      // Sidebar closed: clear targeting state
      dedicatedBrowserWindowId = null;
      sidebarWindowId = null;
      await chrome.storage.local.set({ dedicatedWindowId: null, sidebarWindowId: null });
      console.log("LeanPrompts: Sidebar window closed (Storage Sync).");
    }
  } catch (err) {
    console.error("LeanPrompts: Error cleaning up window state on remove:", err);
  }
});

// PHASE 4: Tab Cleanup (Prevent deadlocks and orphaned context)
chrome.tabs.onRemoved.addListener((tabId) => {
  releaseInjectionLock(tabId);
  releaseReinjectionGuard(tabId);
  chrome.storage.local.remove([
    `lp_manual_selection_${tabId}`
  ]);
  // Surgical cleanup for both RAM memory and session storage backup
  tabContexts.delete(tabId);
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.remove(`ctx_${tabId}`).catch(() => {});
  }
});

/**
 * HELPER: Robustes Window-Update zur Überwindung von OS-Animationen.
 * Stellt sicher, dass das Fenster tatsächlich die Zielgröße erreicht.
 */
/* @PROTECTED_REGION START: ROBUST_WINDOW_UPDATE
   CRITICAL: NEVER reduce the 4-dimension check (width, height, left, top) back to just width/left.
   Opera and DWM animations WILL break the layout if height is not constantly verified and re-applied.
   See: .agent/skills/split-screen-governance/SKILL.md */
async function robustWindowUpdate(windowId, targetBounds) {
  // Strip non-geometric properties — 'focused' confuses Opera's DWM when combined with state
  const { focused, ...geometryBounds } = targetBounds;

  // PHASE 1: Pre-flight — Force out of maximized/fullscreen BEFORE applying dimensions.
  // Opera DWM ignores bounded dimensions while the window is still in 'maximized' state.
  // CRITICAL: Include target left/top to PIN the window to the correct display.
  //           Without this, Opera restores the window to its "remembered normal" position,
  //           which may be on a DIFFERENT display, causing all dimension updates to fight DWM.
  try {
    const currentWin = await chrome.windows.get(windowId);
    if (currentWin.state !== 'normal') {
      await chrome.windows.update(windowId, {
        state: 'normal',
        left: geometryBounds.left,
        top: geometryBounds.top
      });
      await new Promise(r => setTimeout(r, 250)); // Let DWM animation settle
    }
  } catch (e) { /* window may no longer exist */ }

  // PHASE 2: Apply ALL target dimensions with state:'normal' (belt-and-suspenders)
  await chrome.windows.update(windowId, { ...geometryBounds, state: 'normal' });

  // PHASE 3: Watchdog-Loop (Verifikation) — increased to 10 iterations for cross-display moves
  for (let i = 0; i < 10; i++) {
    try {
      const win = await chrome.windows.get(windowId);

      // State MUST be 'normal' — if still maximized, dimensions are meaningless
      const stateOk = win.state === 'normal';

      // Prüfen auf Zielerreichung (Toleranz 4px für DPI-Rundung)
      const wOk = geometryBounds.width === undefined || Math.abs(win.width - geometryBounds.width) <= 4;
      const hOk = geometryBounds.height === undefined || Math.abs(win.height - geometryBounds.height) <= 4;
      const lOk = geometryBounds.left === undefined || Math.abs(win.left - geometryBounds.left) <= 4;
      const tOk = geometryBounds.top === undefined || Math.abs(win.top - geometryBounds.top) <= 4;

      if (stateOk && wOk && hOk && lOk && tOk) {
        return true;
      }
    } catch (e) {
      /* ignore */
    }

    // Puffer für DWM-Animation, falls noch nicht erreicht
    await new Promise(r => setTimeout(r, 150));

    try {
      // CRITICAL: Retry MUST always include state:'normal' to fight DWM snap-back
      await chrome.windows.update(windowId, { ...geometryBounds, state: 'normal' });
    } catch (e) {
      /* ignore */
    }
  }
  return false;
}
/* @PROTECTED_REGION END: ROBUST_WINDOW_UPDATE */

/**
 * HELPER: Validiert, ob eine Window-ID noch existiert und aktiv ist.
 * Verhindert Injektionen in "Geister-Fenster" nach OS-Reboot oder Chrome-Update.
 */
async function validateTargetWindow(windowId) {
  if (!windowId) return false;
  try {
    const win = await chrome.windows.get(windowId);
    return !!win;
  } catch (e) {
    return false;
  }
}

/**
 * HELPER: Initialisiert Standardwerte in chrome.storage.local
 */
import { DEFAULT_LLMS } from './utils/llmConstants';

/**
 * HELPER: Initialisiert Standardwerte in chrome.storage.local
 */
async function initializeDefaults() {
  try {
    const data = await chrome.storage.local.get(['savedPrompts', 'custom_llms', 'settings']);

    if (!data.savedPrompts) {
      await chrome.storage.local.set({ savedPrompts: [] });
    }

    if (!data.custom_llms) {
      await chrome.storage.local.set({
        custom_llms: DEFAULT_LLMS
      });
    }

    if (!data.settings) {
      await chrome.storage.local.set({
        settings: {
          autoBackup: true,
          confirmDelete: true,
          darkMode: true,
          sessionsCollapsed: false
        }
      });
    }

    // Initialisiere Kontextmenü nach Installation/Update
    await refreshTopPromptsMenu();
  } catch (e) {
    console.error("Initialize defaults failed:", e);
  }
}

// GLOBAL STATE FOR CONTEXT MENU
const tabContexts = new Map(); // tabId -> { hasSelection, isEditable, selectionText }

// Restore session context mapping on Service Worker startup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
  chrome.storage.session.get(null).then((allSessionData) => {
    Object.entries(allSessionData).forEach(([key, value]) => {
      if (key.startsWith('ctx_')) {
        const tabId = parseInt(key.replace('ctx_', ''), 10);
        if (!isNaN(tabId)) {
          tabContexts.set(tabId, value);
        }
      }
    });
    // Sync the menu state of the active tab immediately after restoration
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        updateMenuStateForTab(tabs[0].id);
      }
    });
  }).catch((err) => {
    console.warn("LeanPrompts: Failed to restore volatile context map:", err);
  });
}

/**
 * HELPER: Updates the native context menu state for a specific tab.
 */
function updateMenuStateForTab(tabId) {
  const state = tabContexts.get(tabId) || { hasSelection: true, isEditable: false, selectionText: '' };
  const updateSafe = (id, props) => {
    chrome.contextMenus.update(id, props, () => {
      if (chrome.runtime.lastError) { /* ignore - item might not exist yet */ }
    });
  };

  // Optimistic fallback: If state is unknown, default to true to prevent gray-out blocker
  const hasSelection = (state.hasSelection === false) ? false : true;

  updateSafe("leanprompts-save", { enabled: hasSelection });
  updateSafe("leanprompts-add-quick-draft", { enabled: hasSelection });
  updateSafe("leanprompts-save-snippet", { enabled: hasSelection });
  updateSafe("leanprompts-save-kb", { enabled: hasSelection });

  // Visibility protocol: Only enable Top Prompts if the page is officially supported.
  // This prevents the "Extension not active" error on random non-LLM pages.
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) return;
    
    // === ZERO-REGRESSION GUARD START ===
    const urlToLower = tab.url.toLowerCase();
    if (urlToLower.startsWith('chrome://') || urlToLower.startsWith('edge://') || urlToLower.startsWith('about:') || urlToLower.startsWith('file://')) {
        updateSafe("leanprompts-top-root", { enabled: false });
        return;
    }
    // === ZERO-REGRESSION GUARD END ===

    try {
      const url = urlToLower;
      const isSupported = (url.startsWith('http')) && Adapters.some(adapter =>
        adapter.matches && adapter.matches.some(match => url.includes(match.toLowerCase()))
      );
      updateSafe("leanprompts-top-root", { enabled: isSupported });
    } catch (e) { /* fallback to enabled if check fails */ }
  });
}

// Ensure menu state is updated when tabs change
chrome.tabs.onActivated.addListener(({ tabId }) => {
  // Poll state on activation but don't wait for it to update basic menu
  chrome.tabs.sendMessage(tabId, { action: "GET_CONTEXT_STATE" }, (resp) => {
    if (!chrome.runtime.lastError && resp) {
      tabContexts.set(tabId, resp);
      updateMenuStateForTab(tabId);
    }
  });
  updateMenuStateForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { action: "GET_CONTEXT_STATE" }, (resp) => {
      if (!chrome.runtime.lastError && resp) {
        tabContexts.set(tabId, resp);
      }
      updateMenuStateForTab(tabId);
    });
  }
});

/**
 * HELPER: Baut das Kontextmenü für Top-Prompts dynamisch auf
 */
let isRefreshingMenu = false;
async function refreshTopPromptsMenu() {
  if (isRefreshingMenu) return;
  isRefreshingMenu = true;

  try {
    // 1. Erstmal alles entfernen.
    await new Promise(resolve => chrome.contextMenus.removeAll(resolve));

    const createAsync = (props) => new Promise(resolve => {
      chrome.contextMenus.create(props, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
        resolve();
      });
    });

    const explicitContexts = ["page", "selection", "link", "editable", "image"];

    // 2. Basis-Struktur neu aufbauen (DEFAULT ENABLED)
    await createAsync({
      id: "leanprompts-root",
      title: "LeanPrompts",
      contexts: explicitContexts
    });

    // We start as ENABLED by default to avoid the blocker. 
    // The tab state sync will disable if necessary.
    await createAsync({
      id: "leanprompts-save",
      parentId: "leanprompts-root",
      title: "Save Text as Prompt",
      contexts: explicitContexts,
      enabled: true
    });

    await createAsync({
      id: "leanprompts-add-quick-draft",
      parentId: "leanprompts-root",
      title: "Add to Quick Draft",
      contexts: explicitContexts,
      enabled: true
    });

    await createAsync({
      id: "leanprompts-save-snippet",
      parentId: "leanprompts-root",
      title: "Save Text as Snippet",
      contexts: explicitContexts,
      enabled: true
    });

    await createAsync({
      id: "leanprompts-save-kb",
      parentId: "leanprompts-root",
      title: "Save to Knowledge Base",
      contexts: explicitContexts,
      enabled: true
    });

    await createAsync({
      id: "leanprompts-add-llm",
      parentId: "leanprompts-root",
      title: "Add Page/Link to Quick Launch",
      contexts: explicitContexts,
      enabled: true
    });

    // Sync current tab state immediately after creation
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: "GET_CONTEXT_STATE" }, (resp) => {
        if (!chrome.runtime.lastError && resp) {
          tabContexts.set(activeTab.id, resp);
          updateMenuStateForTab(activeTab.id);
        }
      });
    }

    // 3. Top Prompts aus der Datenbank laden
    let prompts = [];
    try { prompts = await dbAPI.getAllPrompts(); } catch (e) { }

    if (prompts && prompts.length > 0) {
      const topPrompts = prompts
        .sort((a, b) => {
          if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        })
        .slice(0, 5);

      await createAsync({
        id: "leanprompts-top-root",
        parentId: "leanprompts-root",
        title: "Top Prompts",
        contexts: explicitContexts,
        enabled: true // Default to enabled
      });

      for (const p of topPrompts) {
        await createAsync({
          id: `lp-top-${p.id}`,
          parentId: "leanprompts-top-root",
          title: p.title.length > 25 ? p.title.substring(0, 25) + "..." : p.title,
          contexts: explicitContexts
        });
      }
    }
  } catch (err) {
    console.error("Context menu refresh failed:", err);
  } finally {
    isRefreshingMenu = false;
  }
}

/**
 * HELPER: Öffnet oder fokussiert das Dashboard
 */
async function openDashboard(options = {}) {
  try {
    const dashboardUrl = chrome.runtime.getURL("index.html");
    const tabs = await chrome.tabs.query({ url: dashboardUrl + "*" });

    let targetUrl = dashboardUrl;
    let requireExactUrl = false;
    let params = new URLSearchParams();

    if (typeof options === 'string') {
      params.append('id', options);
      requireExactUrl = true;
    } else if (options) {
      if (options.promptId) params.append('id', options.promptId);
      if (options.snippetId) params.append('snippetId', options.snippetId);
      if (options.kbId) params.append('kbId', options.kbId);
      if (options.view && options.view !== 'library') params.append('view', options.view);

      if (options.promptId || options.snippetId || options.kbId || options.view || options.force) {
        requireExactUrl = true;
      }
    }

    const queryString = params.toString();
    if (queryString) {
      targetUrl += "?" + queryString;
    }

    if (tabs.length > 0) {
      const tab = tabs[0];
      const shouldUpdateUrl = requireExactUrl && tab.url !== targetUrl;

      if (shouldUpdateUrl) {
        await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
      } else {
        await chrome.tabs.update(tab.id, { active: true });
      }
      await chrome.windows.update(tab.windowId, { focused: true });

      if (options && (options.force || options.view)) {
        setTimeout(() => {
          const targetView = options.view || 'library';
          chrome.tabs.sendMessage(tab.id, { action: "NAVIGATE_VIEW", view: targetView }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }, 150);
      }
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
    return { success: true };
  } catch (err) {
    console.error("Open dashboard failed:", err);
    return { success: false, error: err.message };
  }
}

/**
 * CENTRAL INJECTION LOGIC (ADAPTIVE & ROBUST)
 */
// 1. UPDATE performInjection TO RETRY ON NO_INPUT
/* @PROTECTED_REGION START: BACKGROUND_INJECTION_ENGINE
   CRITICAL: 50ms interval and retry logic are legally bound by the "Gold Standard Profile".
   DO NOT MODIFY without unlocking the engine. */
// INTELLIGENT INJECTION DISPATCHER (STRICT REACTIVE POLLING)
const activeInjections = new Set();

const performInjection = async (tabId, payload) => {
  // Absolut atomarer, synchroner Guard
  if (activeInjections.has(tabId)) {
    return { success: false, reason: "BUSY", error: "Already injecting..." };
  }
  activeInjections.add(tabId);

  try {
    // --- PER-TAB LOCKING & HEARTBEAT ---
    const now = Date.now();
    const lastLock = await getInjectionLock(tabId);

    if (lastLock && (now - lastLock < 15000)) {
      return { success: false, reason: "BUSY", error: "Already injecting..." };
    }

    // Heartbeat-Check (defensiv gekapselt)
    let heartbeat = false;
    try {
      heartbeat = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "PING" }, (resp) => {
          if (chrome.runtime.lastError) resolve(false);
          else resolve(!!resp);
        });
        setTimeout(() => resolve(false), 250);
      });
    } catch (e) {
      heartbeat = false;
    }

    if (!heartbeat) {
      // If no heartbeat, we don't lock, but we also don't immediately fail
      // if the problem is just a missing script (self-healing will handle it later)
      // BUT we definitely don't want to set a "dead lock" for 15s.
      console.log("LeanPrompts: Heartbeat failed for tab", tabId);
    } else {
      await setInjectionLock(tabId, now);
    }

    const sendToAllFrames = (id, data) => new Promise(async resolve => {
      try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: id });
        if (!frames || frames.length === 0) {
          // Fallback to main frame if navigation API fails
          chrome.tabs.sendMessage(id, data, (resp) => resolve([resp || { success: false, error: "NO_RESPONSE" }]));
          return;
        }

        const results = await Promise.all(frames.map(frame => new Promise(fRes => {
          chrome.tabs.sendMessage(id, data, { frameId: frame.frameId }, (resp) => {
            if (chrome.runtime.lastError) fRes({ success: false, error: "CHANNEL_CLOSED", frameId: frame.frameId });
            else fRes({ ...(resp || { success: false, error: "NO_RESPONSE" }), frameId: frame.frameId });
          });
        })));
        resolve(results);
      } catch (e) {
        // Fallback
        chrome.tabs.sendMessage(id, data, (resp) => resolve([resp || { success: false, error: "NO_RESPONSE" }]));
      }
    });

    const MAX_ATTEMPTS = 200;
    const BUSY_BACKOFF_MS = 100;
    const INTERVAL_MS = 50;
    const CHANNEL_CLOSED_TIMEOUT_MS = 5000; // 5s max retry for missing scripts
    const startTime = Date.now();

    // PHASE 4: Proactive Window/Tab Validation
    try {
      const tabCheck = await chrome.tabs.get(tabId);
      if (!tabCheck) throw new Error("TAB_GONE");
      await chrome.windows.get(tabCheck.windowId);
    } catch (e) {
      await releaseInjectionLock(tabId);
      return { success: false, error: "TARGET_CLOSED", reason: "The target window or tab was closed." };
    }

    try {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const results = await sendToAllFrames(tabId, payload);

        // FIRST SUCCESS WINS: If any frame succeeded, we are done!
        const success = results.find(r => r && r.success);
        if (success) return success;

        // AGGREGATE ERRORS & STATUS
        const isAnyBusy = results.some(r => r && r.reason === "BUSY");
        const isAnyClosed = results.some(r => r && (r.error === "CHANNEL_CLOSED" || r.error === "NO_RESPONSE"));

        // Determine if we have a "Terminal" error. 
        // We only return an error if ALL frames have failed and NONE are busy.
        // If any frame is BUSY, we MUST continue polling.
        const realErrors = results.filter(r => r && r.error && r.error !== "CHANNEL_CLOSED" && r.error !== "NO_RESPONSE" && !r.reason);

        // ZERO-REGRESSION FIX: Ignore 'isAnyClosed' here.
        // Dormant iframes (e.g. Google Login) always return CHANNEL_CLOSED.
        // If the main frame returns a real error (like "Action required"), we must not mask it!
        if (realErrors.length > 0 && !isAnyBusy) {
          return realErrors[0];
        }

        // RETRY LOGIC for BUSY or CHANNEL_CLOSED
        // (Using the already-computed aggregate states from lines 476-477)

        // SELF-HEALING: If channel is closed on the first attempt, try to re-inject the content script
        // This happens when the extension was updated and existing tabs have "orphaned" scripts.
        if (isAnyClosed && i === 0) {
          // RACE CONDITION GUARD: Prevent multiple parallel injections
          const existingGuard = await getReinjectionGuard(tabId);
          if (existingGuard) {
            console.log(`LeanPrompts: Injection already pending for tab ${tabId}, waiting...`);
            await new Promise(r => setTimeout(r, 500));
            continue;
          }

          try {
            await setReinjectionGuard(tabId, Date.now());

            const manifest = chrome.runtime.getManifest();
            const contentScript = manifest.content_scripts?.[0]?.js?.[0];
            if (contentScript) {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: [contentScript]
              });
              // Small grace period for the new script to initialize its listeners
              await new Promise(r => setTimeout(r, 300));
              continue; // Immediately retry the loop
            }
          } catch (e) {
            console.warn("LeanPrompts: Self-healing injection attempt failed:", e);
          } finally {
            await releaseReinjectionGuard(tabId);
          }
        }

        // If it's been CHANNEL_CLOSED for > 5s (and self-healing failed/wasn't possible), give up.
        // CRITICAL FIX: We only return "Inactive" if NO frame is currently "BUSY".
        // This prevents cross-origin helper iframes (e.g. in AI Studio) from poisoning the global state.
        if (isAnyClosed && !isAnyBusy && (Date.now() - startTime > CHANNEL_CLOSED_TIMEOUT_MS)) {
          chrome.tabs.get(tabId, (tab) => {
            const url = tab?.url || "Unknown URL";
            console.error(`LeanPrompts: Injection failed because script is inactive on: ${url}`);
          });
          return { success: false, error: "Extension not active on this page. (Try refreshing or check if the page is supported)" };
        }

        const delay = isAnyBusy ? BUSY_BACKOFF_MS : INTERVAL_MS;

        if (i === MAX_ATTEMPTS - 1) {
          return { success: false, error: "Injection Timeout: The LLM interface is not responding." };
        }
        await new Promise(r => setTimeout(r, delay));
      }
      return { success: false, error: "Max attempts reached" };
    } finally {
      await releaseInjectionLock(tabId); // Sicherstellen, dass Sperre gelöscht wird
    }
  } finally {
    activeInjections.delete(tabId);
  }
};
/* @PROTECTED_REGION END: BACKGROUND_INJECTION_ENGINE */

// -----------------------------------------------------------------------------
// EVENT LISTENERS
// -----------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    try {
      // 1. Ensure DB is seeded BEFORE initializing menus
      await dbAPI.seedIfEmpty(SEED_PROMPTS, SEED_SNIPPETS);
    } catch (err) {
      console.error("Seeding failed:", err);
    }
  }

  // 2. Build menus (now with seeded data if applicable)
  // CRITICAL: Must complete before opening the Dashboard!
  await initializeDefaults();

  // 3. FORCE ONBOARDING TAB ON FIRST INSTALL
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("index.html"),
      active: true // Forces the browser to immediately bring the tab to the foreground
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-dashboard') {
    await openDashboard({ view: 'library', force: true });
  }

  if (command === 'create-prompt') {
    await openDashboard({ view: 'library', force: true });
    setTimeout(async () => {
      const dashboardUrl = chrome.runtime.getURL("index.html");
      const tabs = await chrome.tabs.query({ url: dashboardUrl + "*" });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "CREATE_NEW_PROMPT" }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }, 500);
  }
});

/**
 * HELPER: Smart Polling für Content Script Readiness
 * Ersetzt pauschale Wartezeiten durch aktives Pingen.
 */
async function waitForContentScript(tabId, maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const isReady = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "PING" }, (response) => {
          if (chrome.runtime.lastError) resolve(false);
          else resolve(response && (response.status === "PONG" || response.status === "ACK"));
        });
      });
      if (isReady) return true;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 250)); // Intervall von 100ms auf 250ms erhöht
  }
  return false;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Fallback: Get selection text from our state if native property is missing
  const storedState = tabContexts.get(tab.id) || {};
  let selectionText = info.selectionText || storedState.selectionText;

  // LAST RESORT FALLBACK: Direct Query (Crucial for race conditions)
  if (!selectionText && tab.id) {
    try {
      const resp = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: "GET_CONTEXT_STATE" }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r);
        });
        setTimeout(() => resolve(null), 500);
      });
      if (resp && resp.selectionText) selectionText = resp.selectionText;
    } catch (e) { }
  }

  if (info.menuItemId === "leanprompts-save" && selectionText) {
    const id = crypto.randomUUID();
    const text = selectionText;
    const newPrompt = {
      id,
      title: `Captured: ${text.substring(0, 30)}...`,
      content: text,
      tags: ["Inbox"],
      updatedAt: new Date().toISOString(),
      chain: [{
        id: crypto.randomUUID(),
        title: "Main Step",
        content: text,
        notes: "",
        versions: [],
        isVisible: true
      }],
      versions: [],
      ignoredVariables: []
    };
    try {
      await dbAPI.savePrompt(newPrompt);
      await refreshTopPromptsMenu();
      openDashboard(id);
    } catch (err) { }
  }

  if (info.menuItemId === "leanprompts-add-quick-draft" && selectionText) {
    try {
      const data = await chrome.storage.local.get(['lp_quick_prompt_draft']);
      const currentDraft = data.lp_quick_prompt_draft || "";
      
      const separator = currentDraft.trim() ? "\n\n" : "";
      const newDraft = currentDraft + separator + selectionText;

      await chrome.storage.local.set({ lp_quick_prompt_draft: newDraft });

      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { 
          action: "SHOW_TOAST", 
          message: "Added to Quick Draft!" 
        }).catch(() => { /* Safe Fallback falls Content-Script schläft */ });
      }
    } catch (err) {
      console.error("LeanPrompts: Add to Quick Draft failed", err);
    }
  }

  if (info.menuItemId === "leanprompts-save-snippet" && selectionText) {
    const id = crypto.randomUUID();
    const text = selectionText;
    const newSnippet = {
      id,
      name: `Captured: ${text.substring(0, 20)}...`,
      content: text,
      tags: ["Inbox"],
      updatedAt: new Date().toISOString()
    };
    try {
      await dbAPI.saveSnippet(newSnippet);
      openDashboard({ view: 'snippets', snippetId: id });
    } catch (err) { }
  }

  if (info.menuItemId === "leanprompts-save-kb" && selectionText) {
    const id = crypto.randomUUID();
    const text = selectionText;
    const newTile = {
      id,
      title: `Captured: ${text.substring(0, 30)}...`,
      content: text,
      tags: ["Inbox"],
      isPinned: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    try {
      const data = await chrome.storage.local.get(['lp_knowledge_tiles']);
      const currentTiles = data.lp_knowledge_tiles || [];
      await chrome.storage.local.set({ lp_knowledge_tiles: [newTile, ...currentTiles] });
      openDashboard({ view: 'knowledge', kbId: id });
    } catch (err) { }
  }

  if (info.menuItemId === "leanprompts-add-llm") {
    const url = info.linkUrl || info.pageUrl;
    if (!url) return;
    try {
      const themeData = await chrome.storage.local.get(['lp_theme']);
      const isDark = themeData.lp_theme !== 'light'; // default to dark
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (dialogUrl, dialogTitle, dark) => {
          // Remove any existing dialog
          const existing = document.getElementById('lp-add-llm-dialog-backdrop');
          if (existing) existing.remove();

          // Theme tokens
          const t = dark ? {
            backdrop: 'rgba(0, 0, 0, 0.5)',
            bg: 'rgba(31, 41, 55, 0.95)',
            border: 'rgba(255, 255, 255, 0.15)',
            shadow: '0 25px 50px rgba(0, 0, 0, 0.4)',
            text: '#ffffff',
            textSub: 'rgba(255, 255, 255, 0.6)',
            inputBg: 'rgba(255, 255, 255, 0.08)',
            inputBorder: 'rgba(255, 255, 255, 0.2)',
            inputText: '#ffffff',
            cancelBg: 'rgba(255, 255, 255, 0.08)',
            cancelBgHover: 'rgba(255, 255, 255, 0.15)',
            cancelText: 'rgba(255, 255, 255, 0.8)',
            cancelBorder: 'rgba(255, 255, 255, 0.15)',
            selBg: '#3b82f6', selText: '#ffffff'
          } : {
            backdrop: 'rgba(0, 0, 0, 0.3)',
            bg: 'rgba(255, 255, 255, 0.97)',
            border: 'rgba(0, 0, 0, 0.1)',
            shadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
            text: '#111827',
            textSub: 'rgba(0, 0, 0, 0.5)',
            inputBg: 'rgba(0, 0, 0, 0.04)',
            inputBorder: 'rgba(0, 0, 0, 0.15)',
            inputText: '#111827',
            cancelBg: 'rgba(0, 0, 0, 0.05)',
            cancelBgHover: 'rgba(0, 0, 0, 0.1)',
            cancelText: 'rgba(0, 0, 0, 0.7)',
            cancelBorder: 'rgba(0, 0, 0, 0.12)',
            selBg: '#3b82f6', selText: '#ffffff'
          };

          // Inject selection style for readable highlight
          if (!document.getElementById('lp-dialog-sel-style')) {
            const s = document.createElement('style');
            s.id = 'lp-dialog-sel-style';
            s.textContent = `#lp-add-llm-dialog-backdrop input::selection { background: ${t.selBg} !important; color: ${t.selText} !important; }`;
            document.head.appendChild(s);
          }

          const backdrop = document.createElement('div');
          backdrop.id = 'lp-add-llm-dialog-backdrop';
          backdrop.style.cssText = `
            all: unset !important;
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important; height: 100vh !important;
            background: ${t.backdrop} !important;
            backdrop-filter: blur(4px) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
          `;

          const dialog = document.createElement('div');
          dialog.style.cssText = `
            all: unset !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            background: ${t.bg} !important;
            backdrop-filter: blur(20px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
            border: 1px solid ${t.border} !important;
            border-radius: 16px !important;
            padding: 24px !important;
            width: 380px !important;
            max-width: 90vw !important;
            box-shadow: ${t.shadow} !important;
            color: ${t.text} !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
          `;

          const title = document.createElement('div');
          title.style.cssText = `all: unset !important; display: block !important; font-size: 16px !important; font-weight: 700 !important; color: ${t.text} !important; margin: 0 !important;`;
          title.textContent = '\u{1F517} Add to Quick Launch';

          const makeLabel = (text) => {
            const label = document.createElement('div');
            label.style.cssText = `all: unset !important; display: block !important; font-size: 12px !important; font-weight: 600 !important; color: ${t.textSub} !important; margin-bottom: 4px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;`;
            label.textContent = text;
            return label;
          };

          const makeInput = (value) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.style.cssText = `
              all: unset !important;
              display: block !important;
              width: 100% !important;
              box-sizing: border-box !important;
              background: ${t.inputBg} !important;
              border: 1px solid ${t.inputBorder} !important;
              border-radius: 8px !important;
              padding: 10px 12px !important;
              color: ${t.inputText} !important;
              font-size: 14px !important;
              font-family: inherit !important;
              outline: none !important;
            `;
            input.addEventListener('focus', () => { input.style.borderColor = 'rgba(59, 130, 246, 0.7)'; });
            input.addEventListener('blur', () => { input.style.borderColor = t.inputBorder; });
            return input;
          };

          const nameGroup = document.createElement('div');
          nameGroup.style.cssText = `all: unset !important; display: block !important;`;
          nameGroup.appendChild(makeLabel('Name'));
          const nameInput = makeInput(dialogTitle);
          nameGroup.appendChild(nameInput);

          const urlGroup = document.createElement('div');
          urlGroup.style.cssText = `all: unset !important; display: block !important;`;
          urlGroup.appendChild(makeLabel('URL'));
          const urlInput = makeInput(dialogUrl);
          urlGroup.appendChild(urlInput);

          const btnRow = document.createElement('div');
          btnRow.style.cssText = `all: unset !important; display: flex !important; gap: 10px !important; justify-content: flex-end !important; margin-top: 4px !important;`;

          const makeBtn = (text, primary) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            const bg = primary ? 'rgba(59, 130, 246, 0.85)' : t.cancelBg;
            const bgHover = primary ? 'rgba(59, 130, 246, 1)' : t.cancelBgHover;
            const clr = primary ? '#ffffff' : t.cancelText;
            const bdr = primary ? 'rgba(59, 130, 246, 0.6)' : t.cancelBorder;
            btn.style.cssText = `
              all: unset !important;
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
              padding: 8px 20px !important;
              border-radius: 8px !important;
              font-size: 13px !important;
              font-weight: 600 !important;
              cursor: pointer !important;
              font-family: inherit !important;
              background: ${bg} !important;
              color: ${clr} !important;
              border: 1px solid ${bdr} !important;
            `;
            btn.addEventListener('mouseenter', () => { btn.style.background = bgHover; });
            btn.addEventListener('mouseleave', () => { btn.style.background = bg; });
            return btn;
          };

          const cancelBtn = makeBtn('Cancel', false);
          const saveBtn = makeBtn('Save', true);
          btnRow.appendChild(cancelBtn);
          btnRow.appendChild(saveBtn);

          dialog.appendChild(title);
          dialog.appendChild(nameGroup);
          dialog.appendChild(urlGroup);
          dialog.appendChild(btnRow);
          backdrop.appendChild(dialog);

          const cleanup = () => {
            if (document.body.contains(backdrop)) backdrop.remove();
            const selStyle = document.getElementById('lp-dialog-sel-style');
            if (selStyle) selStyle.remove();
          };

          const save = () => {
            const name = nameInput.value.trim() || 'New Link';
            const url = urlInput.value.trim();
            if (!url) { urlInput.style.borderColor = 'rgba(220, 38, 38, 0.8)'; return; }
            chrome.runtime.sendMessage({ action: "SAVE_CUSTOM_LLM", name, url });
            cleanup();
          };

          saveBtn.addEventListener('click', save);
          cancelBtn.addEventListener('click', cleanup);
          backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
          backdrop.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cleanup();
            if (e.key === 'Enter') save();
          });

          document.body.appendChild(backdrop);
          setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
        },
        args: [url, tab.title || "New Link", isDark]
      });
    } catch (e) {
      console.error("LeanPrompts: Failed to show Quick Launch dialog:", e);
    }
  }

  if (info.menuItemId.startsWith("lp-top-") && tab.id) {
    const promptId = info.menuItemId.replace("lp-top-", "");
    try {
      const prompt = await dbAPI.getPrompt(promptId);
      if (prompt) {
        const text = (prompt.chain && prompt.chain.length > 0) ? prompt.chain[0].content : prompt.content;
        const result = await performInjection(tab.id, { action: "INJECT_PROMPT", text });
        if (!result.success) {
          console.error("Top Prompt Injection Failed:", result.error);
        }
      }
    } catch (e) {
      console.error("Top Prompt Click Handler Error:", e);
    }
  }
});

// MAIN WORLD EXECUTOR FOR QWEN FILE DROP (MV3 CSP COMPLIANT)
function executeQwenDropMainWorld(files) {
  console.log("[LeanPrompts Qwen Main World] Starting drop execution...");

  const textarea = document.querySelector('textarea#chat-input') ||
                   document.querySelector('.ant-input-textarea textarea') ||
                   document.querySelector('textarea');

  const fileInput = document.querySelector('input[type="file"]') ||
                    Array.from(document.querySelectorAll('input')).find(el => el.type === 'file');

  const target = (fileInput && fileInput.parentElement) ||
                 document.querySelector('.ant-upload') ||
                 document.querySelector('[class*="upload"]') ||
                 (textarea && textarea.closest('[class*="composer"], [class*="input-area"]')) ||
                 textarea;

  if (!target) {
    console.error("[LeanPrompts Qwen Main World] No upload target found");
    return false;
  }

  const base64ToBlob = (base64, mimeType) => {
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const byteCharacters = atob(base64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
  };

  const dt = new DataTransfer();
  files.forEach(f => {
    try {
      const blob = base64ToBlob(f.data, f.type);
      const file = new File([blob], f.name, { type: f.type, lastModified: Date.now() });
      dt.items.add(file);
    } catch (e) {
      console.error('[LeanPrompts Qwen Main World] Error building File:', e);
    }
  });

  if (dt.files.length === 0) return false;

  const createDragEvent = (type) => {
    const rect = target.getBoundingClientRect();
    const ev = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      dataTransfer: dt
    });

    if (ev.dataTransfer !== dt) {
      Object.defineProperty(ev, 'dataTransfer', {
        value: dt,
        writable: false,
        configurable: true
      });
    }
    return ev;
  };

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  return (async () => {
    target.dispatchEvent(createDragEvent('dragenter'));
    await delay(50);
    target.dispatchEvent(createDragEvent('dragover'));
    await delay(50);
    target.dispatchEvent(createDragEvent('drop'));
    console.log("[LeanPrompts Qwen Main World] Drop event dispatched to target:", target);
    return true;
  })();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Wrap everything in a try-catch to ensure we at least send an error response if something fails synchronously
  try {
    if (request.action === "EXECUTE_QWEN_MAIN_WORLD") {
      (async () => {
        try {
          const tabId = sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "No active tab ID" });
            return;
          }
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: executeQwenDropMainWorld,
            args: [request.files || []]
          });
          sendResponse({ success: true, results });
        } catch (e) {
          console.error("LeanPrompts: Qwen Main World execution failed:", e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
    if (request.action === "UPDATE_CONTEXT_STATE") {
      const { hasSelection, isEditable, selectionText } = request;
      const tabId = sender.tab?.id;
      if (tabId) {
        const state = { hasSelection, isEditable, selectionText };
        tabContexts.set(tabId, state);

        // Persist context state as non-blocking background backup for SW hibernation recovery
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({ [`ctx_${tabId}`]: state }).catch(() => {});
        }

        updateMenuStateForTab(tabId);
      }
      sendResponse({ success: true });
      return false;
    }

    if (request.action === "PING_BACKGROUND") {
      sendResponse({ status: "ACK" });
      return false;
    }

    if (request.action === "PREPARE_ACTIVE_TAB") {
      (async () => {
        try {
          let targetWinId = dedicatedBrowserWindowId;
          if (!targetWinId) {
            const storageData = await chrome.storage.local.get(['dedicatedWindowId']);
            targetWinId = storageData.dedicatedWindowId || null;
          }

          if (targetWinId) {
            const isAlive = await validateTargetWindow(targetWinId);
            if (!isAlive) targetWinId = null;
          }

          const queryOptions = targetWinId
            ? { active: true, windowId: targetWinId }
            : { active: true, currentWindow: true };

          const tabs = await chrome.tabs.query(queryOptions);
          let finalTab = tabs[0];
          
          if (!finalTab && targetWinId) {
            const fallbackTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            finalTab = fallbackTabs[0];
          }

          if (finalTab) {
            await ensureContentScriptActive(finalTab.id);
          }
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    if (request.action === "MANUAL_SELECTION_SUCCESS") {
      // Persistent storage for when popup is closed during selection
      const tabId = sender.tab?.id;
      if (tabId) {
        const key = `lp_manual_selection_${tabId}`;
        chrome.storage.local.set({
          [key]: {
            name: request.name || "Selected Field",
            timestamp: Date.now()
          }
        });
      }

      // Bridge message to other extension components (Popup if open)
      chrome.runtime.sendMessage(request, () => {
        if (chrome.runtime.lastError) { /* ignore if popup closed */ }
      });
      sendResponse({ success: true });
      return false;
    }

    if (request.action === "SAVE_CUSTOM_LLM") {
      (async () => {
        try {
          const { name, url } = request;

          // 1. Defensiver Typ-Schutz gegen fehlerhafte Payloads
          if (typeof url !== 'string') {
            sendResponse({ success: false, error: "Invalid data types" });
            return;
          }

          const cleanUrl = url.trim();

          // --- DEFENSIBER PROTOKOLL-RESOLVER (ROBUST PATTERN) ---
          // 1. Protokoll-Ergänzung für unvollständige Eingaben (verhindert Parser-Abstürze)
          let finalUrl = cleanUrl;
          if (!/^https?:\/\//i.test(finalUrl)) {
            if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(finalUrl)) {
              finalUrl = `http://${finalUrl}`;
            } else {
              finalUrl = `https://${finalUrl}`;
            }
          }

          // 2. Parser-Validierung über eine strikte Allowlist
          try {
            const urlObj = new URL(finalUrl);
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
              sendResponse({ success: false, error: "Unsafe protocol rejected. Only HTTP/HTTPS URLs are allowed." });
              return;
            }
          } catch (e) {
            sendResponse({ success: false, error: "Unsafe or invalid URL structure." });
            return;
          }

          const data = await chrome.storage.local.get(['custom_llms']);
          const currentLlms = data.custom_llms || [];
          
          // Quoten-Schutz zur Vermeidung von Storage-Flooding
          if (currentLlms.length >= 100) {
            sendResponse({ success: false, error: "Maximum link quota reached" });
            return;
          }

          // Defensiver Fallback für den Namen und Längenbegrenzung (schützt vor leeren Strings)
          const cleanName = (typeof name === 'string' ? name : "New Link").substring(0, 50).trim() || "New Link";

          const newLlm = { 
            id: crypto.randomUUID(), 
            name: cleanName, 
            url: finalUrl // Verwende finalUrl anstelle von cleanUrl
          };
          
          await chrome.storage.local.set({ custom_llms: [...currentLlms, newLlm] });
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    if (request.action === "OPEN_DASHBOARD") {
      openDashboard(request).then(res => {
        try { sendResponse(res || { success: true }); } catch (e) { }
      }).catch(err => {
        try { sendResponse({ success: false, error: err.message }); } catch (e) { }
      });
      return true;
    }

    if (request.action === "OPEN_AND_INJECT") {
      const { url, text, files, forceNavigate, alternativeDomains, targetWindowId } = request;
      chrome.tabs.query({}, async (tabs) => {
        try {
          let targetDomain = "";
          try { targetDomain = new URL(url).host; } catch (e) { }

          // Build list of all domains to search for (primary + alternatives)
          const allDomains = [targetDomain, ...(alternativeDomains || [])].filter(Boolean);

          // Tab matching helper - checks if tab URL matches any of the domains
          const matchesDomain = (tabUrl) => {
            if (!tabUrl) return false;
            return allDomains.some(domain => tabUrl.includes(domain));
          };

          /* @PROTECTED_REGION: Multi-monitor targeting - DO NOT MODIFY
             Each sidebar passes its associated browser window ID.
             See: .agent/skills/split-screen-governance/SKILL.md */
          // 1. Determine Target Window
          // Multi-monitor: Use explicit targetWindowId from sidebar if provided
          // This ensures each sidebar targets its own associated browser window
          let activeWindowId = targetWindowId || null;

          // Fallback: read from storage if no explicit ID (for non-sidebar launches)
          if (!activeWindowId) {
            const storageData = await chrome.storage.local.get(['dedicatedWindowId']);
            activeWindowId = storageData.dedicatedWindowId || dedicatedBrowserWindowId;
          }

          // ID-Heartbeat Check: Ensure window exists before locking on it
          if (activeWindowId) {
            const isAlive = await validateTargetWindow(activeWindowId);
            if (!isAlive) activeWindowId = null;
          }

          let targetTab = null;
          if (activeWindowId) {
            // Split-screen mode: ONLY search in dedicated window
            targetTab = tabs.find(t => t.windowId === activeWindowId && matchesDomain(t.url));
          } else {
            // Normal mode: search all windows for matching domain
            targetTab = allDomains.length > 0 ? tabs.find(t => matchesDomain(t.url)) : null;
          }

          if (targetTab) {
            chrome.windows.update(targetTab.windowId, { focused: true }, async () => {
              try {
                let shouldResetContext = !!forceNavigate;
                let targetUrl = url;

                if (!shouldResetContext) {
                  await ensureContentScriptActive(targetTab.id);
                  const check = await new Promise(resolve => {
                    chrome.tabs.sendMessage(targetTab.id, { action: "CHECK_COMPATIBILITY_v105" }, (response) => {
                      if (chrome.runtime.lastError) resolve(null);
                      // Security Handshake: Only trust responses from our verified code
                      else if (response && response.version !== "1.0.5-FIX") {
                        console.warn("LeanPrompts: Ignoring legacy ghost script compatibility report.");
                        resolve({ ...response, hasInput: false });
                      }
                      else resolve(response);
                    });
                    setTimeout(() => resolve(null), 6000);
                  });

                  // AI STUDIO UPGRADE: Ensure we always land on a chat-capable URL if navigation is required.
                  const isAIStudio = targetTab.url.includes('aistudio.google.com') || (url && url.includes('aistudio.google.com'));

                  if (isAIStudio) {
                    const isChatPage = targetTab.url.includes('/prompts/') || targetTab.url.includes('/playground');
                    if (!isChatPage || !check || !check.hasInput) {
                      shouldResetContext = true;
                      // Upgrade URL to the chat-capable endpoint
                      if (targetUrl === 'https://aistudio.google.com' || targetUrl === 'https://aistudio.google.com/') {
                        targetUrl = 'https://aistudio.google.com/prompts/new_chat';
                      }
                    }
                  } else if (!check || !check.hasInput) {
                    shouldResetContext = true;
                  }
                }

                if (shouldResetContext) {
                  // ZERO-REGRESSION FIX: SPAs like AI Studio don't reload if the URL only changes query params.
                  // We must force a hard reload to clear the isolated world context (window.__LP_CONTEXT_INVALIDATED).
                  const currentCleanUrl = targetTab.url.split('?')[0].split('#')[0];
                  const targetCleanUrl = targetUrl.split('?')[0].split('#')[0];
                  
                  if (currentCleanUrl === targetCleanUrl) {
                      // SURGICAL FIX: Force tab to foreground before reloading to prevent silent background injection
                      chrome.tabs.update(targetTab.id, { active: true }, () => {
                          chrome.tabs.reload(targetTab.id);
                      });
                  } else {
                      chrome.tabs.update(targetTab.id, { url: targetUrl, active: true });
                  }
                  
                  let isResolved = false;
                  let fallbackTimer;

                  const proceedWithInjection = async () => {
                    if (isResolved) return;
                    isResolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    clearTimeout(fallbackTimer);

                    try {
                      // ZERO-REGRESSION FIX: SPA Hydration Buffer
                      // Gibt dem Browser 800ms Zeit, das alte DOM zu zerstören und die neuen Upload-Buttons 
                      // von React/Angular rendern zu lassen, bevor der Datei-Injektor sucht.
                      await new Promise(r => setTimeout(r, 800));

                      await waitForContentScript(targetTab.id);
                      if (!text && (!files || files.length === 0)) {
                        sendResponse({ success: true, status: "opened_new" });
                      } else {
                        const result = await performInjection(targetTab.id, { action: "INJECT_PROMPT_v105", text, files });
                        sendResponse(result);
                      }
                    } catch (err) {
                      console.error("LeanPrompts: proceedWithInjection failed", err);
                      sendResponse({ success: false, error: "Injection failed during load: " + err.message });
                    }
                  };

                  const listener = (tabId, changeInfo) => {
                    if (tabId === targetTab.id && changeInfo.status === 'complete') {
                      proceedWithInjection();
                    }
                  };

                  chrome.tabs.onUpdated.addListener(listener);
                  // Wachhund: Falls Chrome 'complete' bei SPAs verschluckt.
                  // ZERO-REGRESSION FIX: Entschärft auf 12s, um modernen SPAs Zeit zum Laden zu geben.
                  fallbackTimer = setTimeout(proceedWithInjection, 12000);
                } else {
                  // ZERO-REGRESSION FIX: Bedingungslose Aktivierung von Fenster und Tab.
                  // Umgeht veraltete "targetTab.active" Snapshots und OS-Restriktionen, die Hintergrund-Injektionen verursachen.
                  chrome.windows.update(targetTab.windowId, { focused: true });
                  chrome.tabs.update(targetTab.id, { active: true }, async () => {
                    await waitForContentScript(targetTab.id);
                    if (!text && (!files || files.length === 0)) {
                      sendResponse({ success: true, status: "opened" });
                    } else {
                      const result = await performInjection(targetTab.id, { action: "INJECT_PROMPT_v105", text, files });
                      sendResponse(result);
                    }
                  });
                }
              } catch (e) {
                sendResponse({ success: false, error: "Injection context error: " + e.message });
              }
            });

          } else {
            // New Tab Case
            let finalUrl = url;
            // Ghost/UI Mitigation: If targeting AI Studio Home for a new tab, upgrade it to Chat
            if (url === 'https://aistudio.google.com' || url === 'https://aistudio.google.com/') {
              finalUrl = 'https://aistudio.google.com/prompts/new_chat';
            }

            const createProperties = { url: finalUrl, active: true };
            if (activeWindowId) createProperties.windowId = activeWindowId;

            chrome.tabs.create(createProperties, (newTab) => {
              if (chrome.runtime.lastError) {
                // Window no longer exists, clear the stored ID
                dedicatedBrowserWindowId = null;
                chrome.storage.local.remove('dedicatedWindowId');
                delete createProperties.windowId;
                chrome.tabs.create(createProperties, (fallbackTab) => setupNewTabListener(fallbackTab));
              } else {
                setupNewTabListener(newTab);
              }
            });

            function setupNewTabListener(tab) {
              if (!tab) {
                sendResponse({ success: false, error: "Failed to create tab" });
                return;
              }
              
              let isResolved = false;
              let fallbackTimer;

              const proceedWithInjection = async () => {
                // Synchroner Guard gegen doppelte parallele Ausführungen
                if (isResolved) return;

                try {
                  // SPA-Hydrierungs-Puffer abwarten
                  await new Promise(r => setTimeout(r, 800));

                  // Aktiven Handshake mit dem Content-Script versuchen
                  const isReady = await waitForContentScript(tab.id, 3000);
                  if (!isReady) {
                    // Falls das Script nicht antwortet (z.B. wegen Redirect im Gange),
                    // brechen wir diesen Versuch ab, lassen den Listener aber aktiv für das nächste Event.
                    return;
                  }

                  // Verbindung erfolgreich etabliert. Jetzt aufräumen und injizieren.
                  isResolved = true;
                  chrome.tabs.onUpdated.removeListener(listener);
                  clearTimeout(fallbackTimer);

                  if (!text && (!files || files.length === 0)) {
                    sendResponse({ success: true, status: "opened" });
                  } else {
                    const result = await performInjection(tab.id, { action: "INJECT_PROMPT_v105", text, files });
                    sendResponse(result);
                  }
                } catch (err) {
                  // Fehler-Sicherung: Ressourcen freigeben
                  isResolved = true;
                  chrome.tabs.onUpdated.removeListener(listener);
                  clearTimeout(fallbackTimer);
                  console.error("LeanPrompts: proceedWithInjection for new tab failed", err);
                  sendResponse({ success: false, error: "Injection failed: " + err.message });
                }
              };

              const listener = (tabId, changeInfo) => {
                // Reagiert auf 'complete' (auch nach Weiterleitungen)
                if (tabId === tab.id && changeInfo.status === 'complete') {
                  proceedWithInjection();
                }
              };
              
              chrome.tabs.onUpdated.addListener(listener);
              // Ultimative Absicherung: Beendet den Kanal nach 12s, falls die Seite gar nicht lädt
              fallbackTimer = setTimeout(() => {
                if (!isResolved) {
                  isResolved = true;
                  chrome.tabs.onUpdated.removeListener(listener);
                  sendResponse({ success: false, error: "Injection timed out during page load." });
                }
              }, 12000);
            }
          }
        } catch (e) {
          sendResponse({ success: false, error: "Tab management error: " + e.message });
        }
      });
      return true;
    }

    if (request.action === "INJECT_CURRENT") {
      const { text, files } = request;
      
      // ZERO-REGRESSION: Async Wrapper kapselt die Logik, blockiert aber nicht den Message-Channel
      (async () => {
        try {
          // KALTSTART-SCHUTZ: Lade ID aus dem Storage, falls die globale Variable noch null ist
          let targetWinId = dedicatedBrowserWindowId;
          if (!targetWinId) {
            const storageData = await chrome.storage.local.get(['dedicatedWindowId']);
            targetWinId = storageData.dedicatedWindowId || null;
          }

          if (targetWinId) {
            const isAlive = await validateTargetWindow(targetWinId);
            if (!isAlive) targetWinId = null;
          }

          const queryOptions = targetWinId
            ? { active: true, windowId: targetWinId }
            : { active: true, currentWindow: true };

          // Die exakt selbe Original-Logik:
          const tabs = await chrome.tabs.query(queryOptions);
          let finalTab = tabs[0];
          
          if (!finalTab && targetWinId) {
            const fallbackTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            finalTab = fallbackTabs[0];
          }

          if (finalTab) {
            chrome.windows.update(finalTab.windowId, { focused: true });
            await ensureContentScriptActive(finalTab.id);
            await waitForContentScript(finalTab.id);
            const result = await performInjection(finalTab.id, { action: "INJECT_PROMPT_v105", text, files });
            sendResponse(result);
          } else {
            sendResponse({ success: false, error: "No active tab found" });
          }
        } catch (e) {
          sendResponse({ success: false, error: "Direct injection error: " + e.message });
        }
      })();
      
      // CRITICAL: Muss synchron außerhalb des async-Blocks bleiben!
      return true; 
    }

    if (request.action === "REFRESH_MENU" || request.action === "RELOAD_DATA") {
      refreshTopPromptsMenu().then(() => {
        try { sendResponse({ success: true }); } catch (e) { }
      }).catch(err => {
        try { sendResponse({ success: false, error: err.message }); } catch (e) { }
      });
      return true;
    }

    /* @PROTECTED_REGION START: SPLIT_SCREEN_DEBUG
       CRITICAL: Do NOT remove or modify this diagnostic handler.
       See: .agent/skills/split-screen-governance/SKILL.md Rule 10 */
    if (request.action === "DEBUG_SPLIT_SCREEN") {
      (async () => {
        try {
          const info = { mainWindow: null, sidebarWindow: null, displays: [], state: {} };
          info.state = { dedicatedBrowserWindowId, sidebarWindowId };

          if (dedicatedBrowserWindowId) {
            try { info.mainWindow = await chrome.windows.get(dedicatedBrowserWindowId); } catch (e) { info.mainWindow = { error: 'Window not found' }; }
          }
          if (sidebarWindowId) {
            try { info.sidebarWindow = await chrome.windows.get(sidebarWindowId); } catch (e) { info.sidebarWindow = { error: 'Window not found' }; }
          }

          try { info.displays = await chrome.system.display.getInfo(); } catch (e) { info.displays = []; }

          sendResponse({ success: true, debug: info });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
    /* @PROTECTED_REGION END: SPLIT_SCREEN_DEBUG */

    // --- NEW: UNDO SPLIT SCREEN (ZERO-REGRESSION) ---
    if (request.action === "UNDO_SPLIT_SCREEN") {
      (async () => {
        try {
          // 1. Storage abrufen (exakt wie UI)
          const data = await chrome.storage.local.get(['dedicatedWindowId', 'sidebarWindowId']);
          const rawMainWinId = dedicatedBrowserWindowId || data.dedicatedWindowId;
          const rawSideWinId = sidebarWindowId || data.sidebarWindowId;

          // 2. Hauptfenster wiederherstellen (fehlertolerant)
          if (rawMainWinId) {
            const mainWinId = parseInt(rawMainWinId, 10);
            if (!isNaN(mainWinId)) {
              await chrome.windows.update(mainWinId, { state: 'maximized' }).catch((err) => {
                console.warn("Hauptfenster-Wiederherstellung fehlgeschlagen:", err.message);
              });
            }
          }
          
          // 3. Sidebar schließen (fehlertolerant)
          if (rawSideWinId) {
            const sideWinId = parseInt(rawSideWinId, 10);
            if (!isNaN(sideWinId)) {
              await chrome.windows.remove(sideWinId).catch((err) => {
                console.warn("Split-Screen-Fenster existierte nicht mehr:", err.message);
              });
            }
          }

          // 4. Speicher-Bereinigung in LOCAL (Triggert sofort die UI-Änderung auf "Enter Split-Screen")
          // Selbst wenn die Fenster bereits geschlossen waren, garantiert dies den UI-Sync.
          dedicatedBrowserWindowId = null;
          sidebarWindowId = null;
          await chrome.storage.local.set({ dedicatedWindowId: null, sidebarWindowId: null });
          
          sendResponse({ success: true });
        } catch (err) {
          console.error("LeanPrompts: Undo split screen failed:", err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (request.action === "TRIGGER_SPLIT_SCREEN") {
      const { currentWindowId, sidebarWidth = 450 } = request;
      dedicatedBrowserWindowId = currentWindowId;

      (async () => {
        try {
          const win = await chrome.windows.get(currentWindowId);
          const displays = await chrome.system.display.getInfo();
          const winCenterX = win.left + (win.width / 2);
          const winCenterY = win.top + (win.height / 2);

          const display = displays.find(d => {
            const b = d.bounds;
            return winCenterX >= b.left && winCenterX <= b.left + b.width &&
              winCenterY >= b.top && winCenterY <= b.top + b.height;
          }) || displays[0];

          const workArea = display.workArea;
          const sidebarWidthNum = Math.floor(request.sidebarWidth || 450);
          const browserWidth = Math.floor(workArea.width) - sidebarWidthNum;

          // --- NEW: MIN-WIDTH GUARD ---
          if (browserWidth < 700) {
              sendResponse({ success: false, error: "Screen too small for Split-Screen mode." });
              return; 
          }
          // ----------------------------

          // --- CLEAN SPLIT SCREEN (Browser-independent) ---
          /* @PROTECTED_REGION START: SPLIT_SCREEN_SIZING
             CRITICAL: DO NOT MODIFY without reading .agent/skills/split-screen-governance/SKILL.md
             1. This exact positioning is the result of extensive testing across Chrome and Opera.
             2. NEVER use standard `chrome.windows.update` here. ALWAYS use `robustWindowUpdate` to
                ensure Opera does not shrink the window height due to DWM animations.
             3. Small gap between windows is INTENTIONAL to prevent resizing loops. */

          // 1. Browser window: left side (NEVER pass 'focused' inside geometry bounds)
          const mainBounds = {
            left: Math.floor(workArea.left),
            top: Math.floor(workArea.top),
            width: browserWidth,
            height: Math.floor(workArea.height)
          };
          const updatePromise = robustWindowUpdate(currentWindowId, mainBounds);

          /* @PROTECTED_REGION: Multi-monitor targeting - DO NOT MODIFY
             targetWindow parameter enables multi-monitor split-screen.
             See: .agent/skills/split-screen-governance/SKILL.md */
          // 2. Sidebar window: right side (immediately adjacent)
          // Pass the browser window ID so sidebar knows which window to target
          const sidebarLeft = Math.floor(workArea.left) + browserWidth;

          // Execute creation in parallel with robust scaling to cut visual latency
          const [sidebarWin] = await Promise.all([
            chrome.windows.create({
              url: chrome.runtime.getURL(`popup.html?mode=sidebar&targetWindow=${currentWindowId}`),
              type: "popup",
              left: sidebarLeft,
              top: Math.floor(workArea.top),
              width: sidebarWidthNum,
              height: Math.floor(workArea.height),
              focused: true
            }),
            updatePromise
          ]);

          // 3. Delayed enforcement for browser stability
          setTimeout(async () => {
            try {
              await robustWindowUpdate(sidebarWin.id, {
                left: sidebarLeft,
                top: Math.floor(workArea.top),
                width: sidebarWidthNum,
                height: Math.floor(workArea.height)
              });
            } catch (e) { /* window might be closed */ }
          }, 500);
          // --- END CLEAN SPLIT SCREEN ---
          /* @PROTECTED_REGION END: SPLIT_SCREEN_SIZING */

          sidebarWindowId = sidebarWin.id;
          await chrome.storage.local.set({
            dedicatedWindowId: currentWindowId,
            sidebarWindowId: sidebarWin.id
          });
          sendResponse({ success: true });
        } catch (err) {
          console.error("Split screen failed:", err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // Explicit ignored response to satisfy sendMessage callbacks
    sendResponse({ status: "ignored" });
    return false;

  } catch (criticalError) {
    console.error("CRITICAL BACKGROUND ERROR:", criticalError);
    try {
      sendResponse({ success: false, error: "Internal background error: " + criticalError.message });
    } catch (e) { /* channel likely dead */ }
    return false;
  }
});

/* @PROTECTED_REGION START: SPLIT_SCREEN_LIFECYCLE
   CRITICAL: Do NOT remove this lifecycle observer.
   See: .agent/skills/split-screen-governance/SKILL.md Rule 4 */
// --- SPLIT-SCREEN LIFECYCLE MANAGEMENT ---
// Zero-Regression: Clean up the connection state and orphaned windows
chrome.windows.onRemoved.addListener((windowId) => {
  if (!dedicatedBrowserWindowId && !sidebarWindowId) return;

  // Case 1: The user closed the Main LLM Browser Window
  // Action: The sidebar is now orphaned. Close it automatically.
  if (windowId === dedicatedBrowserWindowId) {
    if (sidebarWindowId) {
      chrome.windows.remove(sidebarWindowId).catch(() => { /* Already closed by user */ });
    }
    dedicatedBrowserWindowId = null;
    sidebarWindowId = null;
    chrome.storage.local.set({ dedicatedWindowId: null, sidebarWindowId: null });
    return;
  }

  // Case 2: The user closed the Sidebar Popup manually
  // Action: Just clear the state. Leave the main window alone (minimal-invasive).
  if (windowId === sidebarWindowId) {
    dedicatedBrowserWindowId = null;
    sidebarWindowId = null;
    chrome.storage.local.set({ dedicatedWindowId: null, sidebarWindowId: null });
    return;
  }
});
/* @PROTECTED_REGION END: SPLIT_SCREEN_LIFECYCLE */
// src/background.js (Hinzufügen am Ende der Datei)
// --- INTEGRATION: WEB-TO-EXTENSION INJEKTIONS-BRÜCKE ---
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // 1. Origin-Verifizierung (Ausschließlich HTTPS-Produktions- und Staging-Domains)
  const allowedOrigins = [
    "https://leanprompts-website.vercel.app",
    "https://leanprompts.app",
    "https://www.leanprompts.app", // WICHTIG: Explizit erlauben
    "https://leanprompts-zenix.vercel.app"
  ];
  
  const isAllowed = allowedOrigins.includes(sender.origin) || (sender.origin && sender.origin.startsWith("http://localhost"));
  if (!isAllowed) {
    sendResponse({ success: false, error: "ACCESS_DENIED: Origin not whitelisted." });
    return;
  }

  if (request.action === "IMPORT_EXTERNAL_WORKFLOW") {
    (async () => {
      try {
        const workflowData = request.data;
        
        // 2. Schema-Validierung vor jeder weiteren Verarbeitung
        if (!validateWorkflowPayload(workflowData)) {
          sendResponse({ success: false, error: "INVALID_SCHEMA: Malformed workflow payload." });
          return;
        }

        // 3. Konflikt-Ermittlung im aktuellen Datenbestand
        const prompts = await dbAPI.getAllPrompts();
        const snippets = await dbAPI.getAllSnippets();

        const conflicts = { snippets: [], knowledge: [] };
        if (workflowData.snippets && Array.isArray(workflowData.snippets)) {
          workflowData.snippets.forEach(incoming => {
            const existing = snippets.find(s => s.name === incoming.name);
            if (existing) conflicts.snippets.push({ incoming, existing });
          });
        }

        // 4. Import über den backupManager ausführen
        await backupManager.performWorkflowImport(workflowData, conflicts, () => {});
        
        sendResponse({ success: true, message: "Workflow successfully imported!" });
      } catch (err) {
        console.error("LeanPrompts: External import failed", err);
        sendResponse({ success: false, error: "Import failed: " + err.message });
      }
    })();
    return true; // Hält den asynchronen Antwortkanal offen
  }

  if (request.action === "GET_INSTALLED_WORKFLOW_IDS") {
    (async () => {
      try {
        const prompts = await dbAPI.getAllPrompts();
        // Map prompts directly to an array of objects containing id and title
        const installedWorkflows = (prompts || []).map(p => ({
          id: p.id,
          title: p.title
        }));
        sendResponse({ success: true, installedWorkflows });
      } catch (err) {
        console.error("[Handshake] Error reading prompts:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep asynchronous channel open
  }
});