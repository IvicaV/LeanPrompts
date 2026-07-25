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
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { formatLeanText } from '../../utils/leanFormat';
import usePromptStore from '../../stores/promptStore';
import { requestStoragePersistence } from '../../utils/storagePersistence';
import {
  Plus, Command, LayoutGrid, Settings, Trash2, Eye, EyeOff,
  History, Sparkles, Save, Check, Hash, X, Share2, Github, Coffee,
  Sun, Moon, StickyNote, Send, MessageSquare, Copy, ArrowUp, ArrowDown, AlertCircle, CheckCircle2,
  Wand2, ChevronLeft, ChevronRight, BookOpen, Lightbulb, ExternalLink, MoveRight, FileText, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// COMPONENTS (Modularized)
import Sidebar from './components/Sidebar.jsx';
import LibraryPanel from './components/LibraryPanel.jsx';
import Workspace from './components/Workspace.jsx';
import KnowledgeBase from './components/KnowledgeBase.jsx';
import InspectorPanel from './components/InspectorPanel.jsx';
import CommandPalette from '../../components/CommandPalette.jsx';
import FeedbackDrawer from '../../components/FeedbackDrawer.jsx';
import OnboardingFlow from '../../components/onboarding/OnboardingFlow.jsx';
import { DASHBOARD_TOUR_STEPS } from '../../config/onboardingConfig.jsx';
import useOnboardingStore from '../../stores/onboardingStore.js';

// SHARED COMPONENTS
import PromptEditor from '../../components/PromptEditor';
import VariableInspector from '../../components/VariableInspector';
import TagInput from '../../components/TagInput';
import VersionHistory from '../../components/VersionHistory';
import NoteEditor from '../../components/NoteEditor';
import SettingsView from './Settings';
import PromptList from '../../components/PromptList';
import SnippetLibrary from './SnippetLibrary';
import ShareModal from '../../components/ShareModal';
import ShareWorkflowModal from '../../components/ShareWorkflowModal';
import ConfirmationModal from '../../components/ConfirmationModal';

// UTILS
import { parseVariables, compilePrompt, resolveSnippets } from '../../utils/variableParser';
import { copyToClipboard } from '../../utils/clipboard';
import { enableDragSelectScroll } from '../../utils/scrollHelper';

import { triggerInjection } from '../../utils/injectionAPI';
import { getLlmConfig } from '../../utils/llmConstants';
import { backupManager } from '../../utils/backup';
import { dbAPI } from '../../utils/db'; // <-- Minimal-invasiver Import

export default function Dashboard() {
  // ---------------------------------------------------------------------------
  // 1. STORE & GLOBAL STATE
  // ---------------------------------------------------------------------------
  const {
    prompts, snippets, llms, settings, collections, activeCollectionId,
    activePromptId, isLoading,
    loadPrompts, savePrompt, deletePrompt, bulkDeletePrompts, setActivePrompt, createVersion, duplicatePrompt,
    updateStepNote, updateStepTitle, toggleVariableIgnore, moveStep,
    saveCollection, deleteCollection, setActiveCollection, assignToCollection,
    renameTag, deleteTag,
    knowledgeTiles, saveKnowledgeTile, deleteKnowledgeTile, bulkDeleteKnowledgeTiles,
    isSyncing, setEditing
  } = usePromptStore();

  // ---------------------------------------------------------------------------
  // 2. LOCAL STATE
  // ---------------------------------------------------------------------------

  // Lifted state for persistence (variables & files)
  const [variableValues, setVariableValues] = useState({});
  const [currentStepFiles, setCurrentStepFiles] = useState([]);
  const [activePresetName, setActivePresetName] = useState(null);

  const savePresetNameToDB = async (promptId, presetName) => {
    if (!promptId) return;
    try {
      const existingCache = (await dbAPI.getSessionCache(promptId)) || {};
      existingCache['_activePresetName'] = presetName;
      await dbAPI.saveSessionCache(promptId, existingCache);
    } catch (e) { }
  };

  // Lifted state for Snippet persistence
  const [snippetEditName, setSnippetEditName] = useState("");
  const [snippetEditContent, setSnippetEditContent] = useState("");
  const [snippetEditTags, setSnippetEditTags] = useState([]);
  const [snippetEditCollectionId, setSnippetEditCollectionId] = useState(null);
  const [snippetOriginalName, setSnippetOriginalName] = useState("");

  // Editor state (debouncing local content)
  const [localEditorContent, setLocalEditorContent] = useState("");
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Local title state to prevent cursor jumping
  const [localTitle, setLocalTitle] = useState("");

  // Local state for step titles to prevent cursor jumping
  const [localStepTitles, setLocalStepTitles] = useState({});

  // State for syntax scanner (query logic)
  const [syntaxSuggestions, setSyntaxSuggestions] = useState([]);

  // PANEL STATES (collapse logic)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPromptListCollapsed, setIsPromptListCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);

  // Timer Refs
  const debounceTimer = useRef(null);      // For Editor Content
  const titleDebounceTimer = useRef(null); // For Title
  const stepTitleDebounceTimer = useRef(null); // For Step Title
  const liveSyncTimer = useRef(null);

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState("vars");

  // Navigation
  const [currentView, setCurrentView] = useState('library');
  const [pendingSnippetId, setPendingSnippetId] = useState(null);
  const [pendingSnippetTab, setPendingSnippetTab] = useState(null);
  const [pendingKbId, setPendingKbId] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [activeStepId, setActiveStepId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [kbSearchQuery, setKbSearchQuery] = useState(""); // Lifted state for KB Search
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // === NEU: SHIELD GEGEN STALE CLOSURES ===
  const activeStateRef = useRef({ promptId: activePromptId, stepId: activeStepId });
  activeStateRef.current = { promptId: activePromptId, stepId: activeStepId };
  // ========================================

  // Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Responsive Width Detection
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowWidth(window.innerWidth);
      }, 250); // Debounce to prevent transient glitches (like OS file picker in Chrome) from triggering UI guards
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- ZERO-REGRESSION: LIVE SYNC RECEIVER & RECOVERY (Direct Store Reading) ---
  useEffect(() => {
    // 1. RECOVERY ON MOUNT (Fetch missed pings via chrome.storage.local)
    if (activePromptId) {
      chrome.storage.local.get(['lp_live_sync_ping']).then(data => {
        const payload = data.lp_live_sync_ping;
        if (payload && payload.source === 'popup' && payload.promptId === activePromptId && payload.type === 'text') {
          if (Date.now() - payload.timestamp < 3600000) {
            // Retrieve latest state directly from the store to prevent stale hook closures
            const latestPrompts = usePromptStore.getState().prompts || [];
            const latestPrompt = latestPrompts.find(p => p.id === activePromptId);
            const latestStepId = activeStepId || latestPrompt?.chain?.[0]?.id || activePromptId;

            setVariableValues(prev => {
              const merged = { ...prev };
              Object.keys(payload.values).forEach(k => merged[k] = payload.values[k]);
              saveValuesToCache(latestStepId, merged);
              return merged;
            });
          }
        }
      });
    }

    // 2. LIVE LISTENER
    const handleLiveSync = (changes, area) => {
      if (area !== 'local' || !changes.lp_live_sync_ping) return;
      const payload = changes.lp_live_sync_ping.newValue;
      if (!payload || payload.source === 'dashboard') return; // Ignore own echoes

      // THE ULTIMATE SHIELD: Do not overwrite if user is typing here
      if (document.hasFocus()) return;

      if (payload.promptId === activePromptId && payload.type === 'text') {
        try {
          // Retrieve latest state directly from the store to prevent stale hook closures
          const latestPrompts = usePromptStore.getState().prompts || [];
          const latestPrompt = latestPrompts.find(p => p.id === activePromptId);
          const latestStepId = activeStepId || latestPrompt?.chain?.[0]?.id || activePromptId;

          setVariableValues(prev => {
            const next = { ...prev };

            // SMART RESET: If payload values are completely empty, wipe all text variables!
            if (Object.keys(payload.values || {}).length === 0) {
              Object.keys(next).forEach(k => {
                if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                  delete next[k];
                }
              });
              saveValuesToCache(latestStepId, next);
              return next;
            }

            // Otherwise: Merge regular updates
            Object.keys(payload.values).forEach(k => {
              next[k] = payload.values[k];
            });
            saveValuesToCache(latestStepId, next);
            return next;
          });
        } catch (e) { /* silent fail */ }
      }
    };

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleLiveSync);
      return () => chrome.storage.onChanged.removeListener(handleLiveSync);
    }
  }, [activeStepId, activePromptId]);
  // --- END LIVE SYNC RECEIVER & RECOVERY ---

  // FIX: Prevent accidental tab navigation when user drops a file outside a dropzone
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  // Smart Deactivation: Exit Zen Mode when switching views
  useEffect(() => {
    if (isZenMode) {
      setIsZenMode(false);
    }
  }, [currentView]);

  const availableSpace = useMemo(() => {
    const sideWidth = isSidebarCollapsed ? 64 : 256;
    const libWidth = isPromptListCollapsed ? 0 : 320;
    const inspWidth = isInspectorCollapsed ? 0 : 320;
    return windowWidth - sideWidth - libWidth - inspWidth;
  }, [windowWidth, isSidebarCollapsed, isPromptListCollapsed, isInspectorCollapsed]);

  // PHASE 3: UI GUARD (Auto-collapse in split-screen/narrow views)
  useEffect(() => {
    // We only auto-collapse to PROTECT the workspace; we don't auto-expand
    if (windowWidth < 1100 && !isInspectorCollapsed) {
      setIsInspectorCollapsed(true);
    }
    if (windowWidth < 900 && !isPromptListCollapsed) {
      setIsPromptListCollapsed(true);
    }
    if (windowWidth < 700 && !isSidebarCollapsed) {
      setIsSidebarCollapsed(true);
    }
  }, [windowWidth]);

  const useZenLook = isZenMode || availableSpace > 900; // 50px buffer for comfort
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // Global Navigation Listener for deeply nested components (like Backlinks in PromptList/KnowledgeBase)
  useEffect(() => {
    const handleGlobalNavigation = (e) => {
      const { type, id, tab } = e.detail;
      if (type === 'prompt') {
        setCurrentView('library');
        handlePromptSelect(id);
      } else if (type === 'kb') {
        setCurrentView('guide');
        setPendingKbId(id);
      } else if (type === 'snippet') {
        setCurrentView('snippets');
        setPendingSnippetId(id);
        if (tab) setPendingSnippetTab(tab);
      }
    };
    window.addEventListener('NAVIGATE_TO', handleGlobalNavigation);
    return () => window.removeEventListener('NAVIGATE_TO', handleGlobalNavigation);
  }, []);

  const showNotification = (msg, type = 'success') => {
    let messageText = msg;
    let messageType = type;

    // Fängt Objekte ab und wandelt sie gefahrlos in Strings um
    if (msg && typeof msg === 'object') {
      messageText = msg.message || msg.msg || JSON.stringify(msg);
      messageType = msg.type || type || 'info';
    }

    setNotification({ msg: String(messageText || ''), type: messageType });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleClearPendingSnippet = useCallback(() => {
    setPendingSnippetId(null);
    setPendingSnippetTab(null);
  }, []);

  const handleClearPendingKb = useCallback(() => {
    setPendingKbId(null);
  }, []);

  // --- RECOVERY LAYER: Hydrate session files and text safely in background ---
  useEffect(() => {
    if (!activePromptId) return;

    let isCurrent = true; // Schutz-Flag gegen unkontrollierte Race Conditions

    const hydrateFiles = async () => {
      try {
        // Parallelisiertes Laden für maximale Performance und Latenz-Schutz (Unter 1ms)
        const [cachedFilesMapResult, storageData] = await Promise.all([
          dbAPI.getSessionCache(activePromptId),
          chrome.storage.local.get(['lp_last_session'])
        ]);

        if (!isCurrent) return;

        const cachedFilesMap = cachedFilesMapResult || {};
        const activePresetNameFromDB = cachedFilesMap['_activePresetName'] || null;

        const activeKey = activeStepId || (prompts.find(p => p.id === activePromptId)?.chain?.[0]?.id) || activePromptId;
        const tempCache = {};

        // 1. Bilder hydrieren
        for (const [key, fList] of Object.entries(cachedFilesMap)) {
          if (!fList || !Array.isArray(fList)) continue;

          const files = await Promise.all(fList.map(async (f) => {
            if (f.isGhost || !f.data) {
              return { name: f.name, type: f.type, size: f.size, isGhost: true };
            }
            try {
              const res = await fetch(f.data);
              const blob = await res.blob();
              return new File([blob], f.name, { type: f.type });
            } catch (err) {
              return { name: f.name, type: f.type, size: f.size, isGhost: true };
            }
          }));

          const isFileVar = key.startsWith('file:') || key.startsWith('!file:');

          if (isFileVar) {
            if (!tempCache[activeKey]) tempCache[activeKey] = { values: {}, files: [] };
            tempCache[activeKey].values[key] = files;
          } else {
            if (!tempCache[key]) tempCache[key] = { values: {}, files: [] };
            tempCache[key].files = files;
          }
        }

        // 2. Persistente Text-Variablen laden (Dashboard-to-Popup Cold Start Sync)
        const session = storageData.lp_last_session;
        if (session && session.promptId === activePromptId && session.values) {
          if (!tempCache[activeKey]) tempCache[activeKey] = { values: {}, files: [] };
          Object.keys(session.values).forEach(k => {
            if (!k.startsWith('file:') && !k.startsWith('!file:')) {
              tempCache[activeKey].values[k] = session.values[k];
            }
          });
        }

        if (isCurrent) {
          // --- DETECTED-RECOVERY DEEP MERGE ---
          const mergedCache = { ...sessionCache.current };

          Object.keys(tempCache).forEach(stepKey => {
            if (!mergedCache[stepKey]) {
              mergedCache[stepKey] = { values: {}, files: [] };
            }

            mergedCache[stepKey].files = tempCache[stepKey].files || [];
            mergedCache[stepKey].values = {
              ...mergedCache[stepKey].values,
              ...tempCache[stepKey].values
            };
          });

          sessionCache.current = mergedCache;

          if (activePresetNameFromDB) {
            mergedCache[activeKey].activePresetName = activePresetNameFromDB;
          }
          setActivePresetName(mergedCache[activeKey]?.activePresetName || null);

          // Aktuelle UI-States synchronisieren
          if (mergedCache[activeKey]) {
            setCurrentStepFiles(mergedCache[activeKey].files || []);
            setVariableValues(prev => {
              const next = { ...prev };
              // Bereinige alte Variablen
              Object.keys(next).forEach(k => {
                delete next[k];
              });
              // Führe alle neuen (Bilder und Texte) zusammen
              Object.keys(mergedCache[activeKey].values).forEach(vKey => {
                next[vKey] = mergedCache[activeKey].values[vKey];
              });
              return next;
            });
          }
        }
      } catch (e) {
        console.warn("LeanPrompts: Failed to hydrate session safely:", e);
      }
    };

    hydrateFiles();

    return () => {
      isCurrent = false; // Verhindert Race Conditions bei schneller Navigation
    };
  }, [activePromptId, activeStepId]); // CRITICAL: activeStepId dependency prevents empty-state overrides on step changes

  // --- REAL-TIME RECOVERY LAYER: Listen for file changes from Popup ---
  useEffect(() => {
    const handleSyncPing = (changes, area) => {
      if (area !== 'local' || !changes.lp_files_sync_ping) return;
      const payload = changes.lp_files_sync_ping.newValue;
      if (!payload || payload.source === 'dashboard') return; // Ignore own echoes

      if (activePromptId && payload.promptId === activePromptId) {
        // Safe async reload from IndexedDB
        dbAPI.getSessionCache(activePromptId).then(async (cachedFilesMapResult) => {
          const cachedFilesMap = cachedFilesMapResult || {};
          const activePresetNameFromDB = cachedFilesMap['_activePresetName'] || null;
          // --- DEFENSIVE ID-RESOLUTION: Always fall back to the first step's ID of the active prompt ---
          const activeKey = activeStepId || (prompts.find(p => p.id === activePromptId)?.chain?.[0]?.id) || activePromptId;
          const tempCache = {};

          for (const [key, fList] of Object.entries(cachedFilesMap)) {
            if (!fList || !Array.isArray(fList)) continue;
            const files = await Promise.all(fList.map(async (f) => {
              if (f.isGhost || !f.data) return { name: f.name, type: f.type, size: f.size, isGhost: true };
              try {
                const res = await fetch(f.data);
                const blob = await res.blob();
                return new File([blob], f.name, { type: f.type });
              } catch (err) {
                return { name: f.name, type: f.type, size: f.size, isGhost: true };
              }
            }));

            const isFileVar = key.startsWith('file:') || key.startsWith('!file:');
            if (isFileVar) {
              if (!tempCache[activeKey]) tempCache[activeKey] = { values: {}, files: [] };
              tempCache[activeKey].values[key] = files;
            } else {
              if (!tempCache[key]) tempCache[key] = { values: {}, files: [] };
              tempCache[key].files = files;
            }
          }

          // Deep merge to preserve text values
          const mergedCache = { ...sessionCache.current };

          // Clear files and file variables in mergedCache first to handle deletions/clears
          Object.keys(mergedCache).forEach(stepKey => {
            mergedCache[stepKey].files = [];
            Object.keys(mergedCache[stepKey].values || {}).forEach(vKey => {
              if (vKey.startsWith('file:') || vKey.startsWith('!file:')) {
                delete mergedCache[stepKey].values[vKey];
              }
            });
          });

          Object.keys(tempCache).forEach(stepKey => {
            if (!mergedCache[stepKey]) mergedCache[stepKey] = { values: {}, files: [] };
            mergedCache[stepKey].files = tempCache[stepKey].files || [];
            mergedCache[stepKey].values = {
              ...mergedCache[stepKey].values,
              ...tempCache[stepKey].values
            };
          });

          sessionCache.current = mergedCache;

          if (activePresetNameFromDB) {
            mergedCache[activeKey].activePresetName = activePresetNameFromDB;
          }
          setActivePresetName(mergedCache[activeKey]?.activePresetName || null);

          const stepData = mergedCache[activeKey] || { files: [], values: {} };
          setCurrentStepFiles(stepData.files || []);
          setVariableValues(prev => {
            const next = { ...prev };
            // Proaktiv alle alten Dateivariablen entfernen
            Object.keys(next).forEach(vKey => {
              if (vKey.startsWith('file:') || vKey.startsWith('!file:')) {
                delete next[vKey];
              }
            });
            // Neue Dateivariablen einpflegen
            Object.keys(stepData.values).forEach(vKey => {
              if (vKey.startsWith('file:') || vKey.startsWith('!file:')) {
                next[vKey] = stepData.values[vKey];
              }
            });
            return next;
          });
        }).catch(e => console.warn("Failed real-time file sync in Dashboard:", e));
      }
    };

    chrome.storage.onChanged.addListener(handleSyncPing);
    return () => chrome.storage.onChanged.removeListener(handleSyncPing);
  }, [activePromptId, activeStepId]);

  const [savingStepId, setSavingStepId] = useState(null);
  const [copyingStepId, setCopyingStepId] = useState(null);
  const [shareTargetStepId, setShareTargetStepId] = useState(null);


  // UI / Modals
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isShareWorkflowOpen, setIsShareWorkflowOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
    isDangerous: false,
    showInput: false,
    inputPlaceholder: "",
    isLarge: false,
    extraContent: "",
    showMultiInput: false
  });
  const [modalItems, setModalItems] = useState([]);

  // Theme
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  // 3. SESSION CACHE (PERSISTENCE & DEFENSIBER SINGLE-STEP DB SYNC)
  const sessionCache = useRef({});

  // Sichert die Dateien für genau einen Schritt asynchron im Hintergrund
  const saveStepFilesToDB = async (promptId, stepId, files) => {
    if (!promptId || !stepId) return;
    try {
      // Bestehenden Cache für diesen Prompt laden
      const existingCache = (await dbAPI.getSessionCache(promptId)) || {};

      // Defensiver Typ-Schutz: Normalisiere zu einem Array
      const filesArray = Array.isArray(files) ? files : (files ? [files] : []);

      // Serialisiere nur die geänderten Dateien
      const serialized = await Promise.all(filesArray.map(f => new Promise((resolve, reject) => {
        if (f.isGhost) {
          resolve({ name: f.name, type: f.type, size: f.size, isGhost: true });
          return;
        }
        if (f.data && typeof f.data === 'string') {
          resolve({ name: f.name, type: f.type, size: f.size, data: f.data });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: f.name, type: f.type, size: f.size, data: reader.result
        });
        reader.onerror = reject;
        reader.readAsDataURL(f);
      })));

      existingCache[stepId] = serialized;
      await dbAPI.saveSessionCache(promptId, existingCache);

      // --- NEW: Broadcast lightweight metadata ping to other windows ---
      chrome.storage.local.set({
        lp_files_sync_ping: {
          promptId,
          timestamp: Date.now(),
          source: 'dashboard'
        }
      });
    } catch (e) {
      console.warn("LeanPrompts: Failed to persist step files safely:", e);
    }
  };

  // --- NEW: BATCH ATOMIC SESSION CACHE PERSISTENCE (RACE-CONDITION FREE) ---
  const savePresetSessionCache = async (promptId, activeKey, values, stepFilesList) => {
    if (!promptId) return;
    try {
      const existingCache = (await dbAPI.getSessionCache(promptId)) || {};
      const targets = [];

      // A) Queue step-level attachments
      if (stepFilesList && stepFilesList.length > 0) {
        targets.push({ key: activeKey, files: stepFilesList });
      }

      // B) Queue individual file variables
      Object.entries(values || {}).forEach(([key, files]) => {
        if (key.startsWith('file:') || key.startsWith('!file:')) {
          const filesArray = Array.isArray(files) ? files : (files ? [files] : []);
          targets.push({ key, files: filesArray });
        }
      });

      // C) Serialize all files concurrently on the CPU
      const serializedResults = await Promise.all(targets.map(async (target) => {
        const serializedFiles = await Promise.all(target.files.map(f => new Promise((resolve, reject) => {
          if (f.isGhost) {
            resolve({ name: f.name, type: f.type, size: f.size, isGhost: true });
            return;
          }
          if (f.data && typeof f.data === 'string') {
            resolve({ name: f.name, type: f.type, size: f.size, data: f.data });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: f.name, type: f.type, size: f.size, data: reader.result
          });
          reader.onerror = reject;
          reader.readAsDataURL(f);
        })));
        return { key: target.key, files: serializedFiles.filter(Boolean) };
      }));

      // D) Apply all mutations in a single synchronous pass
      serializedResults.forEach(res => {
        existingCache[res.key] = res.files;
      });

      // E) Save the merged state once to IndexedDB and trigger the ping
      await dbAPI.saveSessionCache(promptId, existingCache);

      chrome.storage.local.set({
        lp_files_sync_ping: {
          promptId,
          timestamp: Date.now(),
          source: 'dashboard'
        }
      });
    } catch (e) {
      console.warn("LeanPrompts: Failed to batch persist preset files safely:", e);
    }
  };

  const saveValuesToCache = (promptId, values) => {
    if (!promptId) return;
    if (!sessionCache.current[promptId]) sessionCache.current[promptId] = { values: {}, files: [] };
    sessionCache.current[promptId].values = values;
  };

  const saveFilesToCache = (stepId, files) => {
    if (!stepId) return;
    if (!sessionCache.current[stepId]) sessionCache.current[stepId] = { values: {}, files: [] };
    sessionCache.current[stepId].files = files;
  };

  const loadFromCache = (promptId, stepId = null) => {
    const targetStep = stepId || activeStepId;

    if (promptId && sessionCache.current[promptId]) {
      setVariableValues(sessionCache.current[promptId].values || {});
      setActivePresetName(sessionCache.current[promptId]?.activePresetName || null);
    } else {
      setVariableValues({});
      setActivePresetName(null);
    }

    if (targetStep && sessionCache.current[targetStep]) {
      setCurrentStepFiles(sessionCache.current[targetStep].files || []);
    } else {
      setCurrentStepFiles([]);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. COMPUTED DATA
  // ---------------------------------------------------------------------------

  const activePrompt = prompts.find(p => p.id === activePromptId);

  useEffect(() => {
    if (activePrompt) {
      setLocalTitle(activePrompt.title);
      const titles = {};
      activePrompt.chain?.forEach(s => {
        titles[s.id] = s.title;
      });
      setLocalStepTitles(titles);
    }
  }, [activePrompt?.id]);

  // --- NAVIGATION LISTENER ---
  useEffect(() => {
    // 1. Initial URL Params Check (Deep Linking)
    const params = new URLSearchParams(window.location.search);
    const initialPromptId = params.get('promptId');
    if (initialPromptId) {
      // Small timeout to ensure prompts are loaded
      setTimeout(() => {
        setActivePrompt(initialPromptId);
        setCurrentView('library');
      }, 500);
    }

    // 2. Runtime Message Listener
    const handleMessage = (message, sender, sendResponse) => {
      // Keep legacy support just in case
      if (message.action === "NAVIGATE_TO" && message.targetId) {
        setCurrentView('library');
        setActivePrompt(message.targetId);
        window.focus();
        sendResponse({ success: true });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    // 3. STORAGE SIGNAL LISTENER (Robust Fallback)
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.lp_navigation_signal) {
        const signal = changes.lp_navigation_signal.newValue;
        if (signal && signal.targetId) {
          setCurrentView('library');
          setActivePrompt(signal.targetId);
          // Auto-select step if provided
          if (signal.targetStepId) {
            setActiveStepId(signal.targetStepId);
            loadFromCache(signal.targetStepId);
          }
          window.focus();
          chrome.storage.local.remove('lp_navigation_signal');
        }
        // Handle feedback open signal from Popup
        if (signal && signal.action === 'openFeedback') {
          setIsFeedbackOpen(true);
          window.focus();
          chrome.storage.local.remove('lp_navigation_signal');
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [setActivePrompt]);

  const activeStepContent = useMemo(() => {
    if (!activePrompt) return "";
    if (activeStepId) {
      const step = activePrompt.chain?.find(s => s.id === activeStepId);
      return step?.content || "";
    }
    if (activePrompt.chain && activePrompt.chain.length > 0) {
      return activePrompt.chain[0].content;
    }
    return activePrompt.content || "";
  }, [activePrompt, activeStepId]);

  // FIX: Sync React State with Database State when Active Step Content changes (e.g. from an Import Update)
  // We use `isSyncing` (from the global store) or an external dependency check to prevent cursor jumping
  // when the user is actively typing. 

  // Create a ref to track the last content that was explicitly typed by the user,
  // so we don't accidentally overwrite their work with a slightly older DB state during the 500ms debounce window.
  const lastTypedContent = useRef("");
  
  // NEW: Ref to hold pending data for the synchronous flush
  const pendingSaveData = useRef(null);

  // CRITICAL FIX: Synchronous flush of pending keystrokes to prevent data loss on context switch
  const flushPendingSave = useCallback(() => {
    if (debounceTimer.current && pendingSaveData.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;

        const { val, stepId, promptId } = pendingSaveData.current;
        setEditing(false);

        const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === promptId);
        if (latestPrompt) {
            const targetId = stepId || (latestPrompt.chain?.[0]?.id);
            if (targetId) {
                const newChain = latestPrompt.chain.map(step =>
                    step.id === targetId ? { ...step, content: val } : step
                );
                const isFirstStep = targetId === latestPrompt.chain[0]?.id;
                const updatedPrompt = {
                    ...latestPrompt,
                    chain: newChain,
                    ...(isFirstStep ? { content: val } : {})
                };
                
                // Defensiver Wrapper für synchrone und asynchrone Rückgabetypen
                try {
                    const saveResult = savePrompt(updatedPrompt);
                    if (saveResult instanceof Promise) {
                        saveResult.catch(err => {
                            console.error("LeanPrompts: Async Save failed inside flush", err);
                            if (showNotification) {
                                showNotification("Database write failed. Browser storage might be full!", "error");
                            }
                        });
                    }
                } catch (syncErr) {
                    console.error("LeanPrompts: Synchronous Save failed inside flush", syncErr);
                    if (showNotification) {
                        showNotification("Save failed due to system error.", "error");
                    }
                }
            }
        }
        pendingSaveData.current = null;
    }
  }, [savePrompt, showNotification]);

  // CRITICAL FIX: Garantiert, dass der Flush auch passiert, wenn die 
  // Komponente zerstört wird (Ansicht-Wechsel) oder das Browser-Fenster / Popup schließt.
  useEffect(() => {
    // 1. Browser Event: Wenn der Tab oder das Popup geschlossen wird
    const handleBeforeUnload = () => {
      flushPendingSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 2. React Event: Wenn die Ansicht gewechselt wird (Unmount)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    // Only overwrite localEditorContent if the incoming DB content is genuinely different from what the user just typed,
    // which indicates an external change (like an Intelligent Update via Import, or a Snapshot Restore)
    if (activeStepContent !== lastTypedContent.current) {
      // BUGFIX: SHIELD against delayed DB echoes. If the user is actively typing,
      // never overwrite their local editor state with an older DB snapshot coming back.
      if (isTypingRef.current) return;

      setLocalEditorContent(activeStepContent);
      lastTypedContent.current = activeStepContent; // Sync the ref so we don't infinitely loops
    }
  }, [activeStepContent]);

  const currentStepNote = useMemo(() => {
    if (!activePrompt) return "";
    const step = activeStepId
      ? activePrompt.chain?.find(s => s.id === activeStepId)
      : activePrompt.chain?.[0];
    return step?.notes || "";
  }, [activePrompt, activeStepId]);

  // SMART VARIABLE FOCUS: Tab switching orchestration
  useEffect(() => {
    // 1. Single Variable Focus
    const handleFocusEvent = (e) => {
      window.lp_pending_focus = e.detail.name;
      if (activeTab !== 'vars') setActiveTab('vars');
    };

    // 2. Snippet Group Focus (Amber Highlight)
    const handleSnippetFocus = (e) => {
      const snipName = e.detail.name;
      const snip = snippets.find(s => s.name === snipName);
      if (!snip) return;

      // Parse vars inside snippet content
      const varsInSnippet = parseVariables(snip.content);
      if (varsInSnippet.length === 0) return;

      if (activeTab !== 'vars') {
        // Queue for after tab switch
        window.lp_pending_highlight = { names: varsInSnippet, theme: 'amber' };
        setActiveTab('vars');
      } else {
        // Dispatch immediately
        window.dispatchEvent(new CustomEvent('lp-highlight-variables', {
          detail: { names: varsInSnippet, theme: 'amber' }
        }));
      }
    };

    window.addEventListener('lp-focus-variable', handleFocusEvent);
    window.addEventListener('lp-focus-snippet', handleSnippetFocus);

    return () => {
      window.removeEventListener('lp-focus-variable', handleFocusEvent);
      window.removeEventListener('lp-focus-snippet', handleSnippetFocus);
    };
  }, [activeTab, snippets]);

  // NAVIGATION LISTENER (From Popup)
  useEffect(() => {
    const handleMessage = (request, sender, sendResponse) => {
      if (request.action === "NAVIGATE_TO") {
        if (request.targetId) {
          const currentPrompts = usePromptStore.getState().prompts;
          const prompt = currentPrompts.find(p => p.id === request.targetId);
          if (prompt) {
            setActivePrompt(prompt.id);
            setCurrentView('fill');
          }
        } else {
          // Generic open -> Home
          setCurrentView('library');
        }
      }

      // NEW: Explicit View Switching
      if (request.action === "NAVIGATE_VIEW") {
        if (request.view) {
          setCurrentView(request.view);

          // If switching to library, clear active prompt to ensure clean slate
          if (request.view === 'library') {
            setActivePrompt(null);
          }
        }
      }

      // NEW: Create New Prompt Command
      if (request.action === "CREATE_NEW_PROMPT") {
        handleCreate();
      }

      // META-AUDIT FIX: Global Reload Signal for cross-tab sync
      if (request.action === "RELOAD_DATA") {
        loadPrompts();
        // Robust Layout Reset: Ensure sidebars and centered state re-evaluate after import
        setIsPromptListCollapsed(false);
        setIsInspectorCollapsed(false);
        setIsZenMode(false);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [loadPrompts]);

  // Removed redundant listener (handled by handleSyntaxEvent)

  // --- ZERO-REGRESSION: RAM Guard Notification ---
  useEffect(() => {
    const handleBatchLimit = () => {
      showNotification("Upload stopped at 100MB limit to prevent browser crashes.", "warning");
    };
    window.addEventListener('lp-batch-limit-hit', handleBatchLimit);
    return () => window.removeEventListener('lp-batch-limit-hit', handleBatchLimit);
  }, []);

  useEffect(() => {
    const handleConvert = (e) => {
      const { from, to } = e.detail;
      const newText = localEditorContent.replace(from, to);
      handleEditorChange(newText);
    };
    window.addEventListener('lp-convert-syntax', handleConvert);
    return () => window.removeEventListener('lp-convert-syntax', handleConvert);
  }, [localEditorContent]);

  // B. Zwischenablage-Paste
  useEffect(() => {
    const handlePasteFiles = (e) => {
      const files = e.detail.files;
      if (files && files.length > 0) {
        const filesArray = Array.isArray(files) ? files : [files];
        setCurrentStepFiles(prev => {
          const nextFiles = [...prev, ...filesArray];
          saveFilesToCache(activeStepId || activePromptId, nextFiles);
          saveStepFilesToDB(activePromptId, activeStepId || activePromptId, nextFiles);
          return nextFiles;
        });
        showNotification(`Attached ${files.length} file(s) from clipboard`, 'success');
        if (activeTab !== 'vars') setActiveTab('vars');
      }
    };
    window.addEventListener('lp-paste-files', handlePasteFiles);
    return () => window.removeEventListener('lp-paste-files', handlePasteFiles);
  }, [activeTab, activePromptId, variableValues, activeStepId]);

  useEffect(() => {
    const handleJumpToSnippet = (e) => {
      const { name } = e.detail;
      setCurrentView('snippets');
      // Store globally for SnippetLibrary to pick up
      window.lp_pending_snippet_search = name;
    };
    window.addEventListener('lp-navigate-to-snippet', handleJumpToSnippet);
    return () => window.removeEventListener('lp-navigate-to-snippet', handleJumpToSnippet);
  }, []);

  useEffect(() => {
    chrome.storage.local.get(['lp_knowledge_tiles', 'lp_prompts', 'lp_snippets', 'lp_settings'], (result) => {
      // DEFINE MASTER CONTENT
      const masterGuide = {
        id: 'guide-master',
        isPinned: true,
        updatedAt: '2026-03-20T10:00:00.000Z', // STABLE TIMESTAMP for Newest-Wins logic
        title: 'The Professional Guide to Lean Prompting',
        tags: ['Guide'],
        content: `# The Professional Guide to Lean Prompting

Welcome to your new Prompt Studio. Most users treat AI like a simple search engine; professionals treat it like a **high-performance engine that requires precise logic and high-quality fuel.** 

LeanPrompts is your **IDE (Integrated Development Environment)** for AI. This guide explains the core philosophy of professional prompt engineering and reveals how to use this tool to its absolute limits.

---

## 1. The Strategy: Identity, Intent, and Interface
To get consistent, high-end results, every prompt you build in this Studio should address three pillars:

*   **Identity (The "Who"):** Don't just say "Write a report." Start with: "You are a specialized consultant in [Field] with 15 years of experience." This sets the vocabulary and logic the AI will use.
*   **Intent (The "What"):** Be ruthlessly specific. Instead of "Help me with X," use "Your specific task is to extract, analyze, and summarize X from the provided data."
*   **Interface (The "How"):** Define the output format. Professionals use snippets to ensure the AI doesn't just "chat," but "delivers" (e.g., Markdown tables, JSON, valid code).

---

## 2. Dynamic Workflows with Variables {{...}}
Static prompts are fragile. Professionals build **Dynamic Templates**. By using \`{{brackets}}\` in your editor, you completely decouple the **Logic** of your prompt from the **Data**.

When you type a variable like \`{{Client_Industry}}\`, it automatically appears in the **Inspector (Right Sidebar)** as an input field. 
*   **The Benefit:** Keep your complex, 500-word prompt structure hidden and focus only on filling out the specific data needed right now.
*   **Required Fields:** Add an exclamation mark before a variable name (e.g. \`{{!Target_Audience}}\`) to make it mandatory. LeanPrompts will block injection until the field is filled!
*   **Form Presets:** Filled out a complex form with variables and files? Click **Save as Preset** in the Inspector to instantly recall that exact data state later!

---

## 3. Atomic Modularity: The Power of Snippets @
Repeating instructions (like "Be concise" or "Use my brand voice") in every prompt is a massive waste of time. In LeanPrompts, you use **Snippets**.

Think of Snippets as "Global Building Blocks."
*   **Create Once:** Save your "Standard Coding Rules" or "Persona: Expert Marketer" as a snippet.
*   **Invoke Anywhere:** Type \`@\` followed by the snippet name.
*   **Update Globally:** If you improve your brand voice snippet, **every single prompt** using that snippet updates instantly.

---

## 4. File Dropzones & Attachments {{file: ...}}
Need the AI to compare two specific documents? Don't just throw them blindly into the chat. 

Type \`{{file: Original}}\` and \`{{file: Revision}}\` directly into your prompt. LeanPrompts will create dedicated file dropzones in the Inspector. When you hit send, it automatically attaches the files to the AI and **seamlessly inserts the exact filenames right into your text** at that specific position.

**🔥 Pro Tip:** You can copy any image or document from your computer or the web and **paste it directly into the editor (\`Ctrl+V\`)**. LeanPrompts will automatically intercept the file and add it to your current session attachments!

---

## 5. Breaking Complexity: Prompt Chains
The AI is most powerful when it focuses on one logical step at a time. If you have a complex task, split it up.

1.  **Step 1:** Extract key insights and data points (The Foundation).
2.  **Step 2:** Critique those insights for accuracy (The Audit).
3.  **Step 3:** Transform the audited data into a final post (The Execution).

Inject each step one by one. This forces the AI to maintain a "Chain of Thought," drastically reducing hallucinations.

---

## 6. System Macros {{$...}}
Need today's date or a unique ID? Don't type it manually. LeanPrompts has built-in macros that auto-fill the exact moment you inject or copy your prompt. They will never ask for input in the Inspector.
*   **{{$date}}** / **{{$time}}**: Injects the current date and time.
*   **{{$day}}**: Injects the current weekday.
*   **{{$uuid}}**: Generates a random, unique ID (perfect for mock data).
*   **{{$language}}**: Injects your browser's locale (e.g. en-US, de-DE).

---

## 💡 Did You Know?
LeanPrompts has several features built specifically for flow-state work:

*   **Expand the Editor:** Double-click on any **Step Header** (where the step name is) to instantly expand the editor to full height. Double-click again to shrink it.
*   **Insert in the Middle:** Hover exactly *between* two existing steps in the workspace. A subtle \`+\` line will appear, allowing you to insert a new step right in the middle of your chain.
*   **Modifier Injections:** When clicking an AI icon (like ChatGPT or Claude) at the bottom:
    *   \`Click\` = Inject into active chat.
    *   \`Ctrl+Click\` / \`Cmd+Click\` = Open a **Fresh Chat** and inject.
    *   \`Shift+Click\` = **Open only** (brings you to the AI tab without injecting text).
*   **Zen Mode:** Press \`Alt+Shift+Z\` to collapse all sidebars instantly for pure, distraction-free writing.
*   **Secret Comments:** Want to leave notes in your prompt that the AI *won't* see? Use standard code comments like \`// your note\` or \`/* block note */\`, \`%% obsidian style %%\` or \`<!-- HTML style -->\`. LeanPrompts strips them out before sending the text to the LLM!

---

## 🔗 Live Demo: Internal Linking & Code
This Knowledge Base is fully Markdown-capable. You can build your own wiki here!

**Try clicking these internal links:**
If you type \`[\u200B[\` you can link directly to a prompt. Try clicking this one: [[✨ Welcome to LeanPrompts]]. 
If you type \`@\` you can link to a Snippet: @Expert. 
*LeanPrompts tracks "Backlinks" for you. Check the little book icon 📖 on your prompts to see where they are referenced!*

**You can also save syntax-highlighted code blocks right here in your notes:**

\`\`\`javascript
// LeanPrompts automatically highlights code blocks
const initiateWorkflow = async (promptId) => {
    console.log("Welcome to the top 1% of Prompt Engineers.");
    await system.inject(promptId);
};
\`\`\`

---

## 🚀 Professional Checklist
- [ ] **Identity Check:** Did I assign a specific role to the AI?
- [ ] **Variables:** Are my placeholders clearly labeled?
- [ ] **Snippets:** Did I replace repetitive text with a global Snippet?
- [ ] **Logic:** Should this be a single prompt, or a multi-step **Chain**?
- [ ] **Backup:** Have I exported my workspace recently? (Check Settings)`
      };

      if (!knowledgeTiles || knowledgeTiles.length === 0) {
        // First run or empty: Ensure master guide is present
        saveKnowledgeTile(masterGuide);
      } else {
        // Sync master guide check: update if missing or if content differs to ensure latest professional guide
        const currentMaster = knowledgeTiles.find(t => t.id === 'guide-master');
        if (!currentMaster || currentMaster.content !== masterGuide.content) {
          saveKnowledgeTile(masterGuide);
        }
      }
    });
  }, [knowledgeTiles, saveKnowledgeTile]);

  // (REMOVED: Synced via promptStore now)

  // ---------------------------------------------------------------------------
  // 5. INIT & EFFECTS
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const init = async () => {
      requestStoragePersistence(); // Safely request persistence post-mount
      await loadPrompts();

      // Theme Init (Storage -> System -> Default)
      chrome.storage.local.get(['lp_theme'], (result) => {
        let targetTheme = 'dark';
        if (result.lp_theme) {
          targetTheme = result.lp_theme;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
          targetTheme = 'light';
        }
        applyTheme(targetTheme);
      });

      const params = new URLSearchParams(window.location.search);
      const deepLinkId = params.get('id');
      const deepLinkView = params.get('view');
      const deepLinkSnippetId = params.get('snippetId');
      const deepLinkKbId = params.get('kbId');
      const deepLinkStepId = params.get('stepId');

      if (deepLinkId || deepLinkView || deepLinkSnippetId || deepLinkKbId) {
        if (deepLinkView) {
          // Normalize legacy/external view names
          let view = deepLinkView;
          if (view === 'knowledge') view = 'guide';
          setCurrentView(view);
        }
        if (deepLinkId) {
          setActivePrompt(deepLinkId);
          if (deepLinkStepId) {
            setActiveStepId(deepLinkStepId);
            loadFromCache(deepLinkStepId);
          }
        }
        if (deepLinkSnippetId) setPendingSnippetId(deepLinkSnippetId);
        if (deepLinkKbId) setPendingKbId(deepLinkKbId);

        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Check for pending navigation signal (set before Dashboard tab was created)
      chrome.storage.local.get(['lp_navigation_signal', 'lp_import_in_progress'], (result) => {
        const signal = result.lp_navigation_signal;
        if (signal && signal.action === 'openFeedback') {
          setIsFeedbackOpen(true);
          chrome.storage.local.remove('lp_navigation_signal');
        }

        if (result.lp_import_in_progress) {
          const { timestamp } = result.lp_import_in_progress;
          if (Date.now() - timestamp > 5 * 60 * 1000) {
            chrome.storage.local.remove('lp_import_in_progress');
          } else {
            setModalConfig({
              isOpen: true,
              title: "Import Interrupted",
              message: "An import process was interrupted unexpectedly. This can happen if the app was closed during the transaction. Your database is safe, but the last import may not have completed successfully.",
              onConfirm: () => {
                chrome.storage.local.remove('lp_import_in_progress');
                setModalConfig(prev => ({ ...prev, isOpen: false }));
              },
              isDangerous: false
            });
          }
        }
      });
    };
    init();

    // Theme Listener (Global Sync)
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.lp_theme) {
        applyTheme(changes.lp_theme.newValue);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      usePromptStore.getState().closeSyncChannel();
      if (liveSyncTimer.current) clearTimeout(liveSyncTimer.current);
    };
  }, []);

  // Dashboard Onboarding Trigger
  useEffect(() => {
    // 1. SYNC URL CHECK: Abort immediately if we are targeting ANY view other than library
    // This is critical because on initial load, currentView defaults to 'library' momentarily
    // even if the URL specifies ?view=snippets or ?view=settings.
    const params = new URLSearchParams(window.location.search);
    const targetView = params.get('view');
    if (targetView && targetView !== 'library') return;

    // 2. STATE CHECK: Only trigger in library view
    if (currentView !== 'library') return;

    const onboardingStore = useOnboardingStore.getState();
    if (onboardingStore.isTourActive) return;

    let isMounted = true;

    onboardingStore.loadOnboardingStatus().then(() => {
      // 3. ASYNC SAFETY: Re-check conditions after storage load
      // If the user navigated away while loading, isMounted will be false
      if (!isMounted) return;

      const latestState = useOnboardingStore.getState();
      if (latestState.hasCompletedDashboardOnboarding || latestState.isTourActive) return;

      if (!latestState.hasCompletedDashboardOnboarding) {
        // Auto-select first prompt to ensure the workspace-targeting steps work
        if (prompts.length > 0 && !activePromptId) {
          handlePromptSelect(prompts[0].id);
        }
        onboardingStore.startTour('dashboard');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [prompts.length, currentView]); // Re-run if prompts load late or view changes

  // ZEN MODE AUTO-DEACTIVATION LOGIC
  // 1. Deactivate Zen Mode when switching views (e.g. from Prompts to Snippets)
  useEffect(() => {
    if (isZenMode) {
      setIsZenMode(false);
    }
  }, [currentView]);

  // 2. Deactivate Zen Mode when all sidebars are manually expanded
  useEffect(() => {
    if (isZenMode && !isSidebarCollapsed && !isPromptListCollapsed && !isInspectorCollapsed) {
      setIsZenMode(false);
    }
  }, [isSidebarCollapsed, isPromptListCollapsed, isInspectorCollapsed, isZenMode]);

  useEffect(() => {
    setLocalEditorContent(activeStepContent);
    setSyntaxSuggestions([]);
  }, [activeStepId, activePromptId]);

  // SYNTAX SUGGESTION LISTENER
  useEffect(() => {
    const handleSyntaxEvent = (e) => {
      // e.detail contains { suggestions: [...] }
      const detail = e.detail || {};
      const suggestions = Array.isArray(detail) ? detail : (detail.suggestions || []);

      if (!Array.isArray(suggestions)) {
        console.warn("Syntax suggestions event received invalid data:", e.detail);
        return;
      }
      // Filter duplicates by text
      const unique = [...new Map(suggestions.filter(i => i && i.text).map(item => [item.text, item])).values()];
      setSyntaxSuggestions(unique);
    };
    window.addEventListener('lp-syntax-suggestion', handleSyntaxEvent);
    return () => window.removeEventListener('lp-syntax-suggestion', handleSyntaxEvent);
  }, []);

  const handleApplySuggestions = () => {
    let newContent = localEditorContent || "";
    const suggestionsToApply = (syntaxSuggestions || []).filter(
      s => s && s.text && !(activePrompt?.ignoredVariables || []).includes(s.text)
    );

    suggestionsToApply.forEach(s => {
      if (!s.text) return;
      // Replace [Var] or {Var} with {{Var}}
      // We use a global replace for the exact text
      // Escape special chars in s.text for regex
      try {
        const escaped = s.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        const standardVar = `{{${s.text.replace(/^\[+|\]+$/g, '').replace(/^\{+|\}+$/g, '')}}}`;
        newContent = newContent.replace(regex, standardVar);
      } catch (err) {
        console.error("Error applying suggestion:", s, err);
      }
    });

    handleEditorChange(newContent);
    setSyntaxSuggestions([]);
  };

  const handleIgnoreSuggestions = (textToIgnore) => {
    // ZERO-REGRESSION FIX: Stale Closure Protection
    // Nutzt die 'activeStateRef', um den absolut neusten Prompt direkt aus dem Store 
    // zu erzwingen. Dies verhindert, dass asynchrone React-Render-Zyklen (z.B. durch 
    // gleichzeitiges Tippen) die Ignorier-Liste mit alten Daten überschreiben.
    const currentPromptId = activeStateRef.current.promptId;
    const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === currentPromptId);
    if (!latestPrompt) return;

    const currentIgnored = latestPrompt.ignoredVariables || [];
    let newIgnored = [...currentIgnored];

    if (textToIgnore) {
      if (!newIgnored.includes(textToIgnore)) newIgnored.push(textToIgnore);
    } else {
      const currentTexts = (syntaxSuggestions || []).map(s => s.text).filter(Boolean);
      currentTexts.forEach(t => {
        if (!newIgnored.includes(t)) newIgnored.push(t);
      });
    }

    usePromptStore.getState().savePrompt({ ...latestPrompt, ignoredVariables: newIgnored });

    if (!textToIgnore) {
      setSyntaxSuggestions([]);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const isBlueprintPrompt = activePrompt?.isBlueprint || !!activePrompt?.importSessionId || !!activePrompt?.importedAt;
    if (isBlueprintPrompt) return [];

    const ignored = activePrompt?.ignoredVariables || [];
    return syntaxSuggestions.filter(s => !ignored.includes(s.text));
  }, [syntaxSuggestions, activePrompt?.ignoredVariables, activePrompt?.isBlueprint, activePrompt?.importSessionId, activePrompt?.importedAt]);

  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    setIsDarkMode(isDark);
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.classList.toggle('dark', isDark);
    // NEW: Sync with localStorage for Popup preloader consistency
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const toggleTheme = () => {
    document.documentElement.classList.add('theme-switching');
    const newTheme = !isDarkMode ? 'dark' : 'light';
    chrome.storage.local.set({ lp_theme: newTheme });
    localStorage.setItem('theme', newTheme);
    setTimeout(() => document.documentElement.classList.remove('theme-switching'), 50);
  };

  // ---------------------------------------------------------------------------
  // 6. NAVIGATION HANDLERS
  // ---------------------------------------------------------------------------

  const handlePromptSelect = (id) => {
    flushPendingSave(); // FLUSH BEFORE CONTEXT SWITCH

    if (activePromptId) {
      saveValuesToCache(activePromptId, variableValues);
      if (activeStepId) saveFilesToCache(activeStepId, currentStepFiles);
    }

    const targetPrompt = prompts.find(p => p.id === id);
    const targetStepId = (targetPrompt && targetPrompt.chain && targetPrompt.chain.length > 0)
      ? targetPrompt.chain[0].id
      : null;

    setActivePrompt(id);
    setActiveStepId(targetStepId);
    loadFromCache(id, targetStepId);
    setIsPreviewMode(false);
    // Robust Layout Reset: Ensure sidebars and centered state are visible when switching prompts
    setIsZenMode(false);
    setIsPromptListCollapsed(false);
    setIsInspectorCollapsed(false);
  };

  const handleStepFocus = (stepId) => {
    if (stepId === activeStepId) return;

    flushPendingSave(); // FLUSH BEFORE CONTEXT SWITCH

    if (activePromptId) saveValuesToCache(activePromptId, variableValues);
    if (activeStepId) saveFilesToCache(activeStepId, currentStepFiles);

    setActiveStepId(stepId);

    // Load step attachments without wiping variableValues
    if (stepId && sessionCache.current[stepId]) {
      setCurrentStepFiles(sessionCache.current[stepId].files || []);
    } else {
      setCurrentStepFiles([]);
    }

    // FIX: Read latest from store to prevent stale closure overwrites
    const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === activePromptId);
    if (latestPrompt) {
      const targetStep = latestPrompt.chain.find(s => s.id === stepId);
      if (targetStep) setLocalEditorContent(targetStep.content);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. COMPUTED HELPERS
  // ---------------------------------------------------------------------------

  const allTags = useMemo(() => {
    const tagMap = {};

    // 1. Tags from Prompts
    if (prompts && Array.isArray(prompts)) {
      for (const p of prompts) {
        if (p?.tags) {
          for (const t of p.tags) tagMap[t] = (tagMap[t] || 0) + 1;
        }
      }
    }

    // 2. Tags from Snippets
    if (snippets && Array.isArray(snippets)) {
      for (const s of snippets) {
        if (s?.tags) {
          for (const t of s.tags) tagMap[t] = (tagMap[t] || 0) + 1;
        }
      }
    }

    // 3. Tags from Knowledge Base
    if (knowledgeTiles && Array.isArray(knowledgeTiles)) {
      for (const t of knowledgeTiles) {
        if (t?.tags) {
          for (const tag of t.tags) tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
      }
    }

    return Object.entries(tagMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [prompts, snippets, knowledgeTiles]);

  // OPTIMIZED FILTERS: Use early exits and avoids redundant work
  const filteredSnippets = useMemo(() => {
    if (!snippets) return [];
    let result = snippets;

    if (activeCollectionId) {
      result = result.filter(s => s.collectionId === activeCollectionId);
    }

    if (selectedTags.length > 0) {
      result = result.filter(s => selectedTags.every(tag => s.tags?.includes(tag)));
    }

    return result;
  }, [snippets, activeCollectionId, selectedTags]);

  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];
    let result = prompts;

    if (activeCollectionId) {
      result = result.filter(p => p.collectionId === activeCollectionId);
    }

    if (selectedTags.length > 0) {
      result = result.filter(p => selectedTags.every(tag => p.tags?.includes(tag)));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.content && p.content.toLowerCase().includes(q))
      );
    }
    return result;
  }, [prompts, selectedTags, searchQuery, activeCollectionId]);

  const contentWithSnippets = useMemo(() => {
    try {
      return resolveSnippets(localEditorContent, snippets);
    } catch (e) {
      return localEditorContent; // Fallback to raw content if recursion fails
    }
  }, [localEditorContent, snippets]);

  // Aggregates content of all prompt steps (merging live localEditorContent for the active step)
  const fullPromptContent = useMemo(() => {
    if (!activePrompt) return "";
    return (activePrompt.chain || [])
      .map(s => (s.id === activeStepId ? (localEditorContent || "") : (s.content || "")))
      .join("\n");
  }, [activePrompt, activeStepId, localEditorContent]);

  // Resolves all snippets across full prompt content for prompt-wide schema inspection
  const fullResolvedContent = useMemo(() => {
    try {
      return resolveSnippets(fullPromptContent, snippets);
    } catch (e) {
      return fullPromptContent;
    }
  }, [fullPromptContent, snippets]);

  const detectedVariables = useMemo(() => {
    if (!contentWithSnippets) return [];
    try {
      return parseVariables(contentWithSnippets);
    } catch (e) {
      console.error("Variable Parsing Error:", e);
      return [];
    }
  }, [contentWithSnippets]);

  const snippetVariables = useMemo(() => {
    if (!contentWithSnippets || !localEditorContent) return new Set();
    try {
      const allVars = parseVariables(contentWithSnippets);
      const rawVars = parseVariables(localEditorContent);
      return new Set(allVars.filter(v => !rawVars.includes(v)));
    } catch (e) {
      console.error("Snippet Variable Detection Error:", e);
      return new Set();
    }
  }, [contentWithSnippets, localEditorContent]);

  const getPreviewForStep = (stepContent) => {
    try {
      const withSnippets = resolveSnippets(stepContent, snippets);
      return compilePrompt(withSnippets, variableValues, activePrompt?.ignoredVariables || []);
    } catch (e) {
      return compilePrompt(stepContent, variableValues, activePrompt?.ignoredVariables || []);
    }
  };

  const currentHistoryVersions = useMemo(() => {
    if (!activePrompt) return [];
    if (activeStepId) {
      const step = activePrompt.chain?.find(s => s.id === activeStepId);
      return step?.versions || [];
    }
    if (activePrompt.chain && activePrompt.chain.length > 0) {
      return activePrompt.chain[0].versions || [];
    }
    return activePrompt.versions || [];
  }, [activePrompt, activeStepId]);

  // --- ZERO-REGRESSION: ASYNC BACKLINK CALCULATION ---
  const [backlinksData, setBacklinksData] = useState({ prompt: {}, snippet: {}, kb: {} });
  const promptBacklinks = backlinksData.prompt;
  const snippetBacklinks = backlinksData.snippet;
  const kbBacklinks = backlinksData.kb;

  useEffect(() => {
    let isCancelled = false;
    
    // SHIELD: Do not calculate heavy regex if user is actively typing
    if (isTypingRef.current) return;

    // Debounce the heavy calculation by 1 second to keep UI snappy
    const timer = setTimeout(() => {
      // Yield to main thread
      requestAnimationFrame(() => {
        if (isCancelled || isTypingRef.current) return;

        const newPromptLinks = {}; 
        const newSnippetLinks = {};
        const newKbLinks = {};

        // 1. CALCULATE PROMPT BACKLINKS
        if (prompts && Array.isArray(prompts)) {
          if (knowledgeTiles && Array.isArray(knowledgeTiles)) {
            knowledgeTiles.forEach(tile => {
              if (!tile.content) return;
              const regex = /\[\[(.*?)\]\]/g;
              let match;
              while ((match = regex.exec(tile.content)) !== null) {
                const linkedTitle = match[1];
                const linkedPrompt = prompts.find(p => p.title === linkedTitle);
                if (linkedPrompt) {
                  if (!newPromptLinks[linkedPrompt.id]) newPromptLinks[linkedPrompt.id] = [];
                  if (!newPromptLinks[linkedPrompt.id].some(l => l.id === tile.id && l.type === 'kb')) {
                    newPromptLinks[linkedPrompt.id].push({ id: tile.id, title: tile.title, type: 'kb' });
                  }
                }
              }
            });
          }
          prompts.forEach(sourcePrompt => {
            if (!sourcePrompt.chain) return;
            sourcePrompt.chain.forEach(step => {
              if (!step.notes) return;
              const idRegex = /\[\[prompt:([a-zA-Z0-9_.-]+)\]\]/g;
              let match;
              while ((match = idRegex.exec(step.notes)) !== null) {
                const linkedId = match[1];
                const linkedPrompt = prompts.find(p => p.id === linkedId);
                if (linkedPrompt && linkedPrompt.id !== sourcePrompt.id) {
                  if (!newPromptLinks[linkedPrompt.id]) newPromptLinks[linkedPrompt.id] = [];
                  if (!newPromptLinks[linkedPrompt.id].some(l => l.id === sourcePrompt.id && l.type === 'prompt' && l.stepId === step.id)) {
                    newPromptLinks[linkedPrompt.id].push({ id: sourcePrompt.id, title: sourcePrompt.title, type: 'prompt', stepId: step.id });
                  }
                }
              }
            });
          });
          if (snippets && Array.isArray(snippets)) {
            snippets.forEach(sourceSnippet => {
              if (!sourceSnippet.notes) return;
              const idRegex = /\[\[prompt:([a-zA-Z0-9_.-]+)\]\]/g;
              let match;
              while ((match = idRegex.exec(sourceSnippet.notes)) !== null) {
                const linkedId = match[1];
                const linkedPrompt = prompts.find(p => p.id === linkedId);
                if (linkedPrompt) {
                  if (!newPromptLinks[linkedPrompt.id]) newPromptLinks[linkedPrompt.id] = [];
                  if (!newPromptLinks[linkedPrompt.id].some(l => l.id === sourceSnippet.id && l.type === 'snippet')) {
                    newPromptLinks[linkedPrompt.id].push({ id: sourceSnippet.id, title: sourceSnippet.name, type: 'snippet' });
                  }
                }
              }
            });
          }
        }

        // 2. CALCULATE SNIPPET BACKLINKS
        if (snippets && Array.isArray(snippets)) {
          const findSnippet = (name) => snippets.find(s => s.name === name);
          const nameRegex = /@([a-zA-Z0-9_-]+)|@\{([^}]+)\}/g;
          const idRegex = /@#([a-zA-Z0-9_.-]+)/g;

          if (knowledgeTiles && Array.isArray(knowledgeTiles)) {
            knowledgeTiles.forEach(tile => {
              if (!tile.content) return;
              let match;
              nameRegex.lastIndex = 0;
              while ((match = nameRegex.exec(tile.content)) !== null) {
                const snippetName = match[1] || match[2];
                const linkedSnippet = findSnippet(snippetName);
                if (linkedSnippet) {
                  if (!newSnippetLinks[linkedSnippet.id]) newSnippetLinks[linkedSnippet.id] = [];
                  if (!newSnippetLinks[linkedSnippet.id].some(l => l.id === tile.id && l.type === 'kb')) {
                    newSnippetLinks[linkedSnippet.id].push({ id: tile.id, title: tile.title, type: 'kb' });
                  }
                }
              }
            });
          }
          if (prompts && Array.isArray(prompts)) {
            prompts.forEach(sourcePrompt => {
              if (!sourcePrompt.chain) return;
              sourcePrompt.chain.forEach(step => {
                if (!step.notes) return;
                let match;
                idRegex.lastIndex = 0;
                while ((match = idRegex.exec(step.notes)) !== null) {
                  const snippetId = match[1];
                  const linkedSnippet = snippets.find(s => s.id === snippetId);
                  if (linkedSnippet) {
                    if (!newSnippetLinks[linkedSnippet.id]) newSnippetLinks[linkedSnippet.id] = [];
                    if (!newSnippetLinks[linkedSnippet.id].some(l => l.id === sourcePrompt.id && l.type === 'prompt' && l.stepId === step.id)) {
                      newSnippetLinks[linkedSnippet.id].push({ id: sourcePrompt.id, title: sourcePrompt.title, type: 'prompt', stepId: step.id });
                    }
                  }
                }
              });
            });
          }
          snippets.forEach(sourceSnippet => {
            if (!sourceSnippet.notes) return;
            let match;
            idRegex.lastIndex = 0;
            while ((match = idRegex.exec(sourceSnippet.notes)) !== null) {
              const linkedId = match[1];
              const linkedSnippet = snippets.find(s => s.id === linkedId);
              if (linkedSnippet && linkedSnippet.id !== sourceSnippet.id) {
                if (!newSnippetLinks[linkedSnippet.id]) newSnippetLinks[linkedSnippet.id] = [];
                if (!newSnippetLinks[linkedSnippet.id].some(l => l.id === sourceSnippet.id && l.type === 'snippet')) {
                  newSnippetLinks[linkedSnippet.id].push({ id: sourceSnippet.id, title: sourceSnippet.name, type: 'snippet' });
                }
              }
            }
          });
        }

        // 3. CALCULATE KNOWLEDGE BASE BACKLINKS
        if (knowledgeTiles && Array.isArray(knowledgeTiles)) {
          knowledgeTiles.forEach(sourceTile => {
            if (!sourceTile.content) return;
            const titleRegex = /\[\[(.*?)\]\]/g;
            let match;
            titleRegex.lastIndex = 0;
            while ((match = titleRegex.exec(sourceTile.content)) !== null) {
              if (match[1].startsWith('kb:') || match[1].startsWith('prompt:')) continue;
              const linkedTitle = match[1].trim();
              const linkedTile = knowledgeTiles.find(t => t.title === linkedTitle);
              if (linkedTile && linkedTile.id !== sourceTile.id) {
                if (!newKbLinks[linkedTile.id]) newKbLinks[linkedTile.id] = [];
                if (!newKbLinks[linkedTile.id].some(l => l.id === sourceTile.id && l.type === 'kb')) {
                  newKbLinks[linkedTile.id].push({ id: sourceTile.id, title: sourceTile.title, type: 'kb' });
                }
              }
            }
          });
          if (prompts && Array.isArray(prompts)) {
            prompts.forEach(sourcePrompt => {
              if (!sourcePrompt.chain) return;
              sourcePrompt.chain.forEach(step => {
                if (!step.notes) return;
                const kbIdRegex = /\[\[kb:([a-zA-Z0-9_.-]+)\]\]/g;
                let match;
                kbIdRegex.lastIndex = 0;
                while ((match = kbIdRegex.exec(step.notes)) !== null) {
                  const linkedId = match[1].trim();
                  const linkedTile = knowledgeTiles.find(t => t.id === linkedId);
                  if (linkedTile) {
                    if (!newKbLinks[linkedTile.id]) newKbLinks[linkedTile.id] = [];
                    if (!newKbLinks[linkedTile.id].some(l => l.id === sourcePrompt.id && l.type === 'prompt' && l.stepId === step.id)) {
                      newKbLinks[linkedTile.id].push({ id: sourcePrompt.id, title: sourcePrompt.title, type: 'prompt', stepId: step.id });
                    }
                  }
                }
              });
            });
          }
          if (snippets && Array.isArray(snippets)) {
            snippets.forEach(sourceSnippet => {
              if (!sourceSnippet.notes) return;
              const kbIdRegex = /\[\[kb:([a-zA-Z0-9_.-]+)\]\]/g;
              let match;
              kbIdRegex.lastIndex = 0;
              while ((match = kbIdRegex.exec(sourceSnippet.notes)) !== null) {
                const linkedId = match[1].trim();
                const linkedTile = knowledgeTiles.find(t => t.id === linkedId);
                if (linkedTile) {
                  if (!newKbLinks[linkedTile.id]) newKbLinks[linkedTile.id] = [];
                  if (!newKbLinks[linkedTile.id].some(l => l.id === sourceSnippet.id && l.type === 'snippet')) {
                    newKbLinks[linkedTile.id].push({ id: sourceSnippet.id, title: sourceSnippet.name, type: 'snippet' });
                  }
                }
              }
            });
          }
        }

        // Batch state update
        if (!isCancelled) {
          setBacklinksData({
            prompt: newPromptLinks,
            snippet: newSnippetLinks,
            kb: newKbLinks
          });
        }
      });
    }, 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [prompts, snippets, knowledgeTiles]); 
  // Note: We deliberately exclude isTypingRef.current from dependencies 
  // so we don't trigger re-runs on every keystroke. The condition inside handles it.

  const handleOpenPromptNote = (promptId, stepId) => {
    handlePromptSelect(promptId);
    if (stepId) {
      setTimeout(() => handleStepFocus(stepId), 10);
    }
    setActiveTab('notes');
    setCurrentView('library');
  };

  const handleOpenKnowledgeTile = (tileId) => {
    setCurrentView('guide');
    const tile = knowledgeTiles?.find(t => t.id === tileId);
    if (tile) setKbSearchQuery(tile.title);
  };


  // ---------------------------------------------------------------------------
  // 8. ACTIONS
  // ---------------------------------------------------------------------------

  // C. Datei-Variablen über den Inspector
  const persistActiveSessionText = (promptId, values) => {
    if (!promptId) return;
    try {
      const textOnlyVars = {};
      Object.keys(values || {}).forEach(k => {
        if (!k.startsWith('file:') && !k.startsWith('!file:')) {
          textOnlyVars[k] = values[k];
        }
      });
      chrome.storage.local.set({
        lp_last_session: {
          promptId: promptId,
          values: textOnlyVars
        }
      });
    } catch (e) { /* silent fail */ }
  };

  const handleVariableChange = (key, val) => {
    const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
    const newVars = { ...variableValues };
    
    const legacyKey = key !== cleanKey ? key : (key.startsWith('file:') ? key.replace('file:', '!file:') : `!${key}`);
    if (newVars[legacyKey] !== undefined) delete newVars[legacyKey];

    if (val === null || val === undefined) {
        delete newVars[cleanKey];
    } else {
        newVars[cleanKey] = val;
    }

    setVariableValues(newVars);
    saveValuesToCache(activePromptId, newVars);

    // Wenn es sich um eine Dateivariable handelt, sichere sie isoliert
    if (key.startsWith('file:') || key.startsWith('!file:')) {
      saveStepFilesToDB(activePromptId, key, val);
    }

    // Persistiert Textänderungen sofort für das Popup (Kaltstart-sicher)
    persistActiveSessionText(activePromptId, newVars);

    // Live Sync Broadcast (unverändert)
    if (liveSyncTimer.current) clearTimeout(liveSyncTimer.current);
    liveSyncTimer.current = setTimeout(() => {
      try {
        const textOnlyVars = {};
        Object.keys(newVars).forEach(k => {
          if (!k.startsWith('file:') && !k.startsWith('!file:')) {
            textOnlyVars[k] = newVars[k];
          }
        });
        chrome.storage.local.set({
          lp_live_sync_ping: {
            timestamp: Date.now(),
            source: 'dashboard',
            promptId: activePromptId,
            type: 'text',
            values: textOnlyVars
          }
        });
      } catch (e) { }
    }, 150);
  };

  // A. Normaler Datei-Upload/Drop über den Inspector
  const handleFilesChange = (newFiles) => {
    setCurrentStepFiles(newFiles);
    saveFilesToCache(activeStepId || activePromptId, newFiles);
    saveStepFilesToDB(activePromptId, activeStepId || activePromptId, newFiles);
  };

  const handleClearSession = async () => {
    // --- NEW: Cancel any pending live-sync broadcasts immediately to prevent overwriting ---
    if (liveSyncTimer.current) {
      clearTimeout(liveSyncTimer.current);
      liveSyncTimer.current = null;
    }

    setVariableValues({});
    setCurrentStepFiles([]);
    setActivePresetName(null);
    saveValuesToCache(activePromptId, {});
    saveFilesToCache(activeStepId || activePromptId, []);
    const activeKey = activeStepId || activePromptId;
    if (activeKey && sessionCache.current[activeKey]) {
      sessionCache.current[activeKey].activePresetName = null;
    }

    if (activePromptId) {
      try {
        // 1. Überschreibe den IndexedDB-Cache mit einem leeren Objekt
        await dbAPI.saveSessionCache(activePromptId, {});

        // 2. Kombiniere alle Pings in eine atomare storage.local.set Operation, um Race Conditions zu vermeiden
        chrome.storage.local.set({
          lp_files_sync_ping: {
            promptId: activePromptId,
            timestamp: Date.now(),
            source: 'dashboard'
          },
          lp_live_sync_ping: {
            timestamp: Date.now(),
            source: 'dashboard',
            promptId: activePromptId,
            type: 'text',
            values: {} // Leert alle Textfelder im Popup in Echtzeit
          },
          lp_last_session: {
            promptId: activePromptId,
            values: {}
          }
        });
      } catch (e) {
        console.warn("LeanPrompts: Failed to sync clear action safely:", e);
      }
    }
  };

  const handleSavePreset = async (name) => {
    if (!activePrompt) return;
    const { savePreset } = usePromptStore.getState();

    // BUGFIX: Raw File/Blob objects from the file picker have no .data property.
    // Without Base64 encoding here, savePreset stores metadata shells (data: undefined)
    // that are silently dropped during injection because they fail all processing branches.
    const processedFiles = await Promise.all(
      currentStepFiles.map(f => {
        if (f.data && typeof f.data === 'string') return f; // Already Base64
        if (f instanceof Blob) {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
              name: f.name, type: f.type, size: f.size,
              data: reader.result, lastModified: f.lastModified
            });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(f);
          });
        }
        return null; // Metadata-only object without data — cannot be preserved
      })
    );

    const finalFiles = processedFiles.filter(Boolean);
    await savePreset(activePrompt.id, name, variableValues, finalFiles);

    // --- PERSIST SAVED/UPDATED PRESET VALUES TO LAST SESSION & BROADCAST ---
    persistActiveSessionText(activePrompt.id, variableValues);

    const activeKey = activeStepId || activePromptId;
    savePresetSessionCache(activePrompt.id, activeKey, variableValues, finalFiles);

    // Broadcast live sync ping for text variables
    try {
      const textOnlyVars = {};
      Object.keys(variableValues).forEach(k => {
        if (!k.startsWith('file:') && !k.startsWith('!file:')) {
          textOnlyVars[k] = variableValues[k];
        }
      });
      chrome.storage.local.set({
        lp_live_sync_ping: {
          timestamp: Date.now(),
          source: 'dashboard',
          promptId: activePrompt.id,
          type: 'text',
          values: textOnlyVars
        }
      });
    } catch (e) { }
    // --------------------------------------------------------

    showNotification(`Preset "${name}" saved!`);

    setActivePresetName(name);
    savePresetNameToDB(activePrompt.id, name);
    if (activeKey) {
      if (!sessionCache.current[activeKey]) {
        sessionCache.current[activeKey] = { values: {}, files: [] };
      }
      sessionCache.current[activeKey].activePresetName = name;
    }
  };

  const handleDeletePreset = async (name) => {
    if (!activePrompt) return;
    const { deletePreset } = usePromptStore.getState();
    await deletePreset(activePrompt.id, name);
    showNotification(`Preset "${name}" deleted.`);

    if (name === activePresetName) {
      setActivePresetName(null);
      savePresetNameToDB(activePrompt.id, null);
      const activeKey = activeStepId || activePromptId;
      if (activeKey && sessionCache.current[activeKey]) {
        sessionCache.current[activeKey].activePresetName = null;
      }
    }
  };

  const handleRenamePreset = async (oldName, newName) => {
    if (!activePrompt || !activePrompt.presets || !activePrompt.presets[oldName]) return;
    if (oldName === newName) return;

    // Guard: prevent silently overwriting a preset with the same target name
    let finalNewName = newName;
    if (activePrompt.presets[newName]) {
      finalNewName = `${newName} (1)`;
    }

    // Key-swap: copy data verbatim — variables/files are untouched
    const newPresets = { ...activePrompt.presets };
    newPresets[finalNewName] = newPresets[oldName];
    delete newPresets[oldName];

    const { savePrompt: _savePrompt } = usePromptStore.getState();
    await _savePrompt({ ...activePrompt, presets: newPresets });
    showNotification(`Preset renamed to "${finalNewName}"`);

    if (oldName === activePresetName) {
      setActivePresetName(finalNewName);
      savePresetNameToDB(activePrompt.id, finalNewName);
      const activeKey = activeStepId || activePromptId;
      if (activeKey) {
        if (!sessionCache.current[activeKey]) {
          sessionCache.current[activeKey] = { values: {}, files: [] };
        }
        sessionCache.current[activeKey].activePresetName = finalNewName;
      }
    }
  };

  const handleLoadPreset = (name) => {
    if (!activePrompt || !activePrompt.presets || !activePrompt.presets[name]) return;
    const preset = activePrompt.presets[name];
    
    // 1. Update text variables
    const newValues = preset.values || {};
    setVariableValues(newValues);
    
    // 2. Update files (if present in preset)
    const newFiles = preset.files || [];
    if (newFiles.length > 0) {
      setCurrentStepFiles(newFiles);
    }
    
    // 3. Sync to cache
    saveValuesToCache(activePromptId, newValues);
    if (newFiles.length > 0) {
      saveFilesToCache(activeStepId || activePromptId, newFiles);
    }

    // --- PERSIST LOADED PRESET VALUES TO LAST SESSION & BROADCAST ---
    persistActiveSessionText(activePrompt.id, newValues);
    
    const activeKey = activeStepId || activePromptId;
    savePresetSessionCache(activePrompt.id, activeKey, newValues, newFiles);

    // Broadcast live sync ping for text variables
    try {
      const textOnlyVars = {};
      Object.keys(newValues).forEach(k => {
        if (!k.startsWith('file:') && !k.startsWith('!file:')) {
          textOnlyVars[k] = newValues[k];
        }
      });
      chrome.storage.local.set({
        lp_live_sync_ping: {
          timestamp: Date.now(),
          source: 'dashboard',
          promptId: activePrompt.id,
          type: 'text',
          values: textOnlyVars
        }
      });
    } catch (e) { }
    // --------------------------------------------------------

    showNotification(`Loaded preset "${name}"`);

    setActivePresetName(name);
    savePresetNameToDB(activePrompt.id, name);
    if (activeKey) {
      if (!sessionCache.current[activeKey]) {
        sessionCache.current[activeKey] = { values: {}, files: [] };
      }
      sessionCache.current[activeKey].activePresetName = name;
    }
  };

  // --- COLLECTIONS HANDLERS ---
  const handleCreateCollection = () => {
    setModalItems([]);
    setModalConfig({
      isOpen: true,
      title: "New Collections",
      message: "Add one or more collections. Press Enter after each name.",
      onConfirm: async (items) => {
        if (!items || items.length === 0) return;
        for (const name of items) {
          await saveCollection({ name });
        }
        showNotification(`Created ${items.length} collection(s)`);
      },
      showMultiInput: true,
      inputPlaceholder: "Collection name...",
      confirmText: "Create All"
    });
  };


  const handleSelectCollection = (id) => {
    setActiveCollection(id === activeCollectionId ? null : id);
  };

  const handleDeleteCollection = (id) => {
    const collection = collections.find(c => c.id === id);
    if (!collection) return;

    // 1. Calculate Usage
    const promptCount = (prompts || []).filter(p => p.collectionId === id).length;
    const snippetCount = (snippets || []).filter(s => s.collectionId === id).length;
    const totalCount = promptCount + snippetCount;

    // 2. Determine Message
    const title = "Delete Collection?";
    let message = `Are you sure you want to delete "${collection.name}"?`;

    if (totalCount > 0) {
      message = `This collection contains ${totalCount} item${totalCount === 1 ? '' : 's'} (${promptCount} prompts, ${snippetCount} snippets). Deleting it will move them to "Uncategorized". Continue?`;
    } else {
      message = `Are you sure you want to delete "${collection.name}"? It is currently empty.`;
    }

    confirmAction(
      title,
      message,
      () => deleteCollection(id),
      true,
      "Delete Collection"
    );
  };

  const handleRenameCollection = (id, newName) => {
    const col = collections.find(c => c.id === id);
    if (!col || !newName.trim()) return;
    saveCollection({ ...col, name: newName.trim() });
  };

  const handleRenameTag = async (oldTag, newTag) => {
    if (!newTag.trim() || oldTag === newTag) return;
    await renameTag(oldTag, newTag.trim());
  };

  const handleDeleteTag = (tagName, count) => {
    if (count === 0) {
      deleteTag(tagName);
      return;
    }

    confirmAction(
      "Remove Tag Globally?",
      `This tag is currently used by ${count} items. Do you want to remove this tag from all these items? (The prompts themselves will remain).`,
      async () => {
        await deleteTag(tagName);
      },
      true, // isDangerous
      "Remove Tag Everywhere"
    );
  };

  const handleCreate = async () => {
    flushPendingSave(); // FLUSH BEFORE CONTEXT SWITCH
    const id = crypto.randomUUID();
    const newPrompt = {
      id,
      title: "Untitled Prompt",
      chain: [{
        id: crypto.randomUUID(),
        title: "Main Prompt",
        content: "",
        notes: "",
        isVisible: true
      }],
      content: "",
      tags: ["New"],
      updatedAt: new Date().toISOString(),
      ignoredVariables: []
    };
    await savePrompt(newPrompt);
    setCurrentView('library');
    setActivePrompt(id);
    setActiveStepId(newPrompt.chain[0].id);
    setVariableValues({});
    setCurrentStepFiles([]);
    setLocalTitle("Untitled Prompt");
  };

  // Die unifizierte, hochperformante Speicher-Pipeline
  const handleEditorChange = (val, stepId) => {
    // IMMUNISIERUNG: Wir holen die absoluten Live-IDs aus der Ref, um Stale Closures durch React.memo zu ignorieren
    const { promptId: currentPromptId, stepId: currentStepId } = activeStateRef.current;
    
    const targetStepId = stepId || currentStepId;
    const capturedPromptId = currentPromptId;

    // PERFORMANCE BOOST: Aktualisiere den React-UI-State (localEditorContent) 
    // NUR, wenn wir im aktiven Step tippen. 
    if (targetStepId === currentStepId) {
        setLocalEditorContent(val);
        lastTypedContent.current = val;
    }
    
    setEditing(true); 

    // SCHUTZSCHILD: Verhindert, dass verzögerte Datenbank-Echos den Text überschreiben
    isTypingRef.current = true;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 1000);

    // Timer zurücksetzen
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    // Immer live aus dem Store abfragen (Stale Closure Schutz)
    if (usePromptStore.getState().isSyncing) return; 

    // DATEN SICHERN: Die getippten Daten in die Ref legen. 
    pendingSaveData.current = { val, stepId: targetStepId, promptId: capturedPromptId };

    // Wenn 500ms nichts passiert, normal im Hintergrund speichern
    debounceTimer.current = setTimeout(() => {
      flushPendingSave();
    }, 500);
  };



  const confirmAction = (title, message, onConfirm, isDangerous = true, confirmText = "Save changes") => {
    if (settings && !settings.confirmDelete) {
      onConfirm();
    } else {
      setModalConfig({
        isOpen: true,
        title,
        message,
        isDangerous,
        confirmText,
        onConfirm: () => {
          onConfirm();
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        }
      });
    }
  };

  const handleStepTitleChange = (stepId, newTitle) => {
    setLocalStepTitles(prev => ({ ...prev, [stepId]: newTitle }));
    setEditing(true);
    if (stepTitleDebounceTimer.current) clearTimeout(stepTitleDebounceTimer.current);
    if (isSyncing) return;

    stepTitleDebounceTimer.current = setTimeout(() => {
      setEditing(false);
      if (!activePrompt) return;
      updateStepTitle(activePrompt.id, stepId, newTitle);
    }, 500);
  };

  const handleAddStep = (insertAfterIndex) => {
    flushPendingSave(); // FLUSH BEFORE ADDING
    // LÖSUNG 2: Hole LATEST Prompt aus dem Store, nicht aus dem React-Render
    const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === activePromptId);
    if (!latestPrompt) return;

    const currentChain = latestPrompt.chain || [];
    const newStep = {
      id: crypto.randomUUID(),
      title: `Step ${currentChain.length + 1}`,
      content: "",
      notes: "",
      isVisible: true
    };

    let newChain;
    if (typeof insertAfterIndex === 'number') {
      newChain = [...currentChain];
      newChain.splice(insertAfterIndex + 1, 0, newStep);
    } else {
      newChain = [...currentChain, newStep];
    }

    savePrompt({ ...latestPrompt, chain: newChain });
    handleStepFocus(newStep.id);
  };

  const handleDeleteStep = (stepId) => {
    flushPendingSave(); // FLUSH BEFORE DELETING
    // LÖSUNG 2: Hole LATEST Prompt
    const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === activePromptId);
    if (!latestPrompt || !latestPrompt.chain || latestPrompt.chain.length <= 1) return;

    confirmAction(
      "Delete Prompt Step?",
      "Are you sure you want to remove this step? Content and notes will be lost.",
      () => {
        const newChain = latestPrompt.chain.filter(s => s.id !== stepId);
        const newLegacyContent = newChain.map(s => s.content).join('\n');
        savePrompt({ ...latestPrompt, chain: newChain, content: newLegacyContent });
        delete sessionCache.current[stepId];
        if (activeStepId === stepId) handleStepFocus(newChain[0].id);
      },
      true,
      "Delete Step"
    );
  };

  const handleSaveStep = async (stepId) => {
    if (!activePrompt) return;
    flushPendingSave(); // FLUSH BEFORE SNAPSHOT
    setSavingStepId(stepId);
    handleStepFocus(stepId);
    const step = activePrompt.chain.find(s => s.id === stepId);
    await createVersion(activePrompt.id, `Snapshot: ${step.title || 'Step'}`, stepId);
    setTimeout(() => setSavingStepId(null), 1000);
  };



  const handleCopyStep = async (stepId, stepContent) => {
    flushPendingSave(); // Ensure compiled copy gets latest data
    setCopyingStepId(stepId);
    const compiled = getPreviewForStep(stepContent);
    await copyToClipboard(compiled);
    setTimeout(() => setCopyingStepId(null), 1000);
  };

  const handleLaunchStep = async (stepContent, llm, isNewChat, isOpenOnly, stepId) => {
    flushPendingSave(); // FLUSH BEFORE LAUNCH to guarantee latest data injection

    // --- ZERO-REGRESSION: REQUIRED VARIABLE GATEKEEPER ---
    if (!isOpenOnly) {
        const withSnippets = resolveSnippets(stepContent, snippets);
        const stepVars = parseVariables(withSnippets);
        const missingReq = stepVars.filter(v => {
            if (!v.startsWith('!')) return false;
            if (activePrompt?.ignoredVariables?.includes(v)) return false;

            const isFile = v.toLowerCase().startsWith('!file:');
            const cleanV = v.replace(/^!/, '').replace(/^!file:/i, 'file:');
            const userVal = variableValues[cleanV] !== undefined ? variableValues[cleanV] : variableValues[v];

            if (isFile) return !userVal || !Array.isArray(userVal) || userVal.length === 0;
            if (userVal !== undefined && String(userVal).trim() !== "") return false;

            // Safe Regex check for Template Default
            try {
                const escapedV = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\{\\{\\s*${escapedV}\\s*:([^}]+)\\}\\}`, 'i');
                const match = withSnippets.match(regex);
                if (match && match[1] && match[1].trim() !== "") return false;
            } catch(e) { /* fallback to missing */ }

            return true;
        });

        if (missingReq.length > 0) {
            const names = missingReq.map(v => v.replace(/^!file:/i, '').replace(/^!/, ''));
            showNotification(`Required fields missing: ${names.join(', ')}`, 'error');

            // Switch Tab if necessary and pulse amber
            if (activeTab !== 'vars') setActiveTab('vars');
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('lp-highlight-variables', {
                    detail: { names: missingReq, theme: 'amber' }
                }));
            }, 50);
            return; // 🛑 HARD STOP BEFORE ANY INJECTION LOGIC RUNS
        }
    }
    // -----------------------------------------------------


    const config = getLlmConfig(llm); // Ensure this is imported!
    const targetUrl = isNewChat ? config.newChatUrl : config.url;

    // 2. Prepare Text
    const text = isOpenOnly ? null : getPreviewForStep(stepContent);

    // 3. Prepare Files (from current state — matches what the Inspector displays)
    let filesToUse = [];
    if (!isOpenOnly) {
      filesToUse = [...currentStepFiles];

      // ZERO-REGRESSION GUARD: On-the-fly Parsing für absolute Scope-Sicherheit
      const safeSnippets = snippets || [];
      const resolvedContent = resolveSnippets(stepContent || "", safeSnippets);
      const currentStepVars = parseVariables(resolvedContent) || [];
      const cleanStepVars = currentStepVars.map(v => v.replace(/^!/, '').replace(/^!file:/i, 'file:'));

      // Merge with files from variableValues (both file: and !file: prefixes)
      if (variableValues) {
        Object.keys(variableValues).forEach(key => {
          const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
          if (cleanKey.startsWith('file:') && cleanStepVars.includes(cleanKey)) {
            const varFiles = variableValues[key];
            if (Array.isArray(varFiles)) {
              filesToUse.push(...varFiles);
            } else if (varFiles) {
              filesToUse.push(varFiles);
            }
          }
        });
      }

      // Deduplicate
      filesToUse = filesToUse.filter((file, index, self) =>
        index === self.findIndex(f => f.name === file.name && f.size === file.size)
      );
    }

    const ghostFiles = filesToUse.filter(f => f.isGhost || (!f.data && !(f instanceof Blob)));

    const executeLaunch = async () => {
      let processedFiles = [];
      if (filesToUse.length > 0) {
        try {
          processedFiles = await Promise.all(
            filesToUse
              .filter(f => !f.isGhost || (f.isGhost && f.data)) // Omit missing Ghost files
              .map(f => new Promise((resolve, reject) => {
                // If it's already processed (Base64 from VariableInspector or Presets)
                if (f.data && typeof f.data === 'string') {
                  return resolve({
                    name: f.name,
                    type: f.type,
                    data: f.data
                  });
                }
                // If it's a raw File/Blob
                if (f instanceof Blob) {
                  const reader = new FileReader();
                  reader.onload = () => resolve({
                    name: f.name,
                    type: f.type,
                    data: reader.result // Base64 
                  });
                  reader.onerror = reject;
                  reader.readAsDataURL(f);
                } else {
                  // Fallback for metadata-only objects that might have slipped through
                  resolve(null);
                }
              }))
          );
          // Clean up any nulls from fallback
          processedFiles = processedFiles.filter(Boolean);
        } catch (e) {
          console.error("File processing failed:", e);
          showNotification("Failed to process attachment.", 'error');
          return;
        }
      }

      // 4. Notify
      const actionLabel = isOpenOnly ? "Opening" : "Injecting into";
      showNotification(`${actionLabel} ${llm.name}...`, 'info');

      // 5. Send Message (PROTECTED INTERFACE)
      /* @PROTECTED_REGION START: DASHBOARD_INJECTION_TRIGGER
         CRITICAL: Use ONLY injectionAPI. Do not bypass validation. */
      triggerInjection({
        url: targetUrl,
        text: text,
        files: processedFiles,
        forceNavigate: isNewChat,
        alternativeDomains: llm.alternativeDomains || config.alternativeDomains
      }, (resp) => {
        // Background handles success notifications, but we catch immediate errors
        if (resp && resp.error) showNotification(resp.error, 'error');
      });
      /* @PROTECTED_REGION END: DASHBOARD_INJECTION_TRIGGER */
    };

    if (ghostFiles.length > 0 && !isOpenOnly) {
        showNotification(`Skipped ${ghostFiles.length} missing file(s)`, 'warning');
    }

    executeLaunch();
  };

  const handleTitleChange = (e) => {
    if (!activePrompt) return;
    const val = e.target.value;
    setLocalTitle(val);
    setEditing(true);
    if (titleDebounceTimer.current) clearTimeout(titleDebounceTimer.current);
    if (isSyncing) return;

    // [DATA INTEGRITY FIX]: Read LATEST prompt from store in debounce to prevent stale chain overwrites
    const capturedPromptId = activePromptId;
    titleDebounceTimer.current = setTimeout(() => {
      setEditing(false);
      const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === capturedPromptId);
      if (!latestPrompt) return;
      savePrompt({ ...latestPrompt, title: val });
    }, 500);
  };

  const handleTagsChange = (newTags) => {
    // LÖSUNG 2: Hole LATEST Prompt
    const latestPrompt = usePromptStore.getState().prompts.find(p => p.id === activePromptId);
    if (!latestPrompt) return;
    
    const updatedPrompt = { ...latestPrompt, tags: newTags };
    savePrompt(updatedPrompt);
  };

  const handleManualSnapshot = useCallback(async (targetStepId = null) => {
    if (!activePromptId) return;
    flushPendingSave(); // FLUSH BEFORE SNAPSHOT
    setIsSaving(true);

    // If triggered via onClick={handleManualSnapshot}, targetStepId is an event. Normalize to null for global.
    const actualStepId = (typeof targetStepId === 'string') ? targetStepId : null;
    const note = actualStepId ? "Manual Snapshot" : "Global Snapshot";

    await createVersion(activePromptId, note, actualStepId);
    setTimeout(() => setIsSaving(false), 1000);
  }, [activePromptId, createVersion]);

  const handleDeletePrompt = () => {
    confirmAction(
      "Delete Prompt?",
      `Permanently delete "${activePrompt.title}"? This cannot be undone.`,
      () => { deletePrompt(activePrompt.id); },
      true,
      "Yes, delete"
    );
  };

  const handleDeletePromptById = (id) => {
    const prompt = prompts.find(p => p.id === id);
    if (!prompt) return;
    confirmAction(
      "Delete Prompt?",
      `Permanently delete "${prompt.title}"? This cannot be undone.`,
      () => { deletePrompt(id); },
      true,
      "Yes, delete"
    );
  };

  const handleDuplicatePrompt = async (id) => {
    const targetId = id || activePromptId;
    if (!targetId) return;

    // DEFENSIVE GUARD: Nur flushen, wenn wir den Prompt duplizieren, den wir gerade tippen!
    if (targetId === activePromptId) {
      flushPendingSave(); 
    }
    
    try {
      await duplicatePrompt(targetId);
      showNotification("Prompt duplicated!", "success");
      setVariableValues({});
      setCurrentStepFiles([]);
    } catch (err) {
      showNotification("Failed to duplicate prompt.", "error");
    }
  };

  const handleBulkDeletePrompts = (ids, onSuccess) => {
    if (!ids || ids.length === 0) return;
    confirmAction(
      `Delete ${ids.length} prompts?`,
      "This action cannot be undone.",
      () => {
        bulkDeletePrompts(ids);
        if (onSuccess) onSuccess();
      },
      true,
      "Yes, delete all"
    );
  };

  const handleResetNoteRequest = () => {
    confirmAction(
      "Clear Notes?",
      "This will permanently delete all notes for the current step.",
      () => {
        updateStepNote(activePrompt.id, activeStepId || activePrompt.chain[0].id, "");
      },
      true,
      "Clear Notes"
    );
  };

  const handleAddTile = (newTile) => {
    saveKnowledgeTile(newTile);
  };

  const handleEditTile = (updatedTile) => {
    saveKnowledgeTile(updatedTile);
  };

  const handleDeleteTile = (id) => {
    confirmAction("Delete Note?", "This action cannot be undone.", () => {
      deleteKnowledgeTile(id);
    }, true, "Yes, delete");
  };

  const handleBulkDeleteTiles = (ids) => {
    confirmAction(
      `Delete ${ids.length} Notes?`,
      "This action cannot be undone.",
      () => {
        bulkDeleteKnowledgeTiles(ids);
      },
      true,
      "Yes, delete all"
    );
  };

  const toggleTagSelection = (tagName) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  const preZenState = useRef(null);

  // Sync internal sidebars with global Zen Mode
  // Sync internal sidebars with global Zen Mode
  // NOTE: We use imperative logic in toggleAllSidebars instead of useEffect to avoid race conditions
  // and ensure we capture the state exactly BEFORE the toggle happens.

  const toggleAllSidebars = () => {
    if (!isZenMode) {
      // ENTERING Zen Mode
      // Capture current state synchronously before any updates
      preZenState.current = {
        sidebar: isSidebarCollapsed,
        promptList: isPromptListCollapsed,
        inspector: isInspectorCollapsed
      };

      // Collapse all
      setIsSidebarCollapsed(true);
      setIsPromptListCollapsed(true);
      setIsInspectorCollapsed(true);
      setIsZenMode(true);
    } else {
      // EXITING Zen Mode
      // Restore state if available
      if (preZenState.current) {
        setIsSidebarCollapsed(preZenState.current.sidebar);
        setIsPromptListCollapsed(preZenState.current.promptList);
        setIsInspectorCollapsed(preZenState.current.inspector);
        preZenState.current = null;
      }
      setIsZenMode(false);
    }
  };

  // --- HOTKEYS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K for Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }

      // GLOBAL Hotkeys (Work everywhere)
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleAllSidebars();
      }

      // VIEW SPECIFIC Hotkeys
      if (currentView === 'library' && activePromptId) {
        if (e.metaKey || e.ctrlKey) {
          if (e.key.toLowerCase() === 'd') { e.preventDefault(); setCurrentView('library'); }
          if (e.key.toLowerCase() === 's') { e.preventDefault(); if (!isSaving) handleManualSnapshot(); }
          if (e.key.toLowerCase() === 'p') { e.preventDefault(); setIsPreviewMode(prev => !prev); }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePromptId, currentView, isSaving, handleManualSnapshot, isSidebarCollapsed, isPromptListCollapsed, isInspectorCollapsed]);

  const handleCommandPaletteSelect = (item) => {
    if (item.type === 'prompt') {
      handlePromptSelect(item.id);
      setCurrentView('library');
    } else if (item.type === 'action') {
      if (item.id === 'action-full-backup') {
        backupManager.exportData(true).then(success => {
          if (success) {
            usePromptStore.getState().updateSettings({ lastBackupTime: new Date().toISOString() });
            showNotification("Full Backup successful", "success");
          }
        });
      } else if (item.id === 'action-open-hub') {
        window.open("https://leanprompts.app/explore/", "_blank");
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 10. RENDER UI
  // ---------------------------------------------------------------------------
  // META-AUDIT: Only show full-screen loader if we have NO prompts at all (initial boot)
  // If we already have data, a background refresh should NOT unmount the entire UI.
  if (isLoading && prompts.length === 0) {
    return (
      <div className="h-screen w-screen bg-bg flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-xl" />
          <div className="absolute inset-0 border-4 border-t-primary rounded-xl animate-spin" />
        </div>
        <div className="flex flex-col items-center gap-2 animate-pulse">
          <span className="text-xl font-bold tracking-tight text-text-main">LeanPrompts</span>
          <span className="text-xs text-text-muted font-medium uppercase tracking-widest">Initializing Environment...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-bg text-text-main font-sans overflow-hidden transition-colors duration-200">

      {/* 1. SIDEBAR */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentView={currentView}
        onViewChange={setCurrentView}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        onFeedbackOpen={() => setIsFeedbackOpen(true)}
        selectedTags={selectedTags}
        setSelectedTags={setSelectedTags}
        activeCollectionId={activeCollectionId}
        filteredSnippets={filteredSnippets}
        tags={allTags}
        onTagToggle={toggleTagSelection}
        collections={collections}
        onCreateCollection={handleCreateCollection}
        onCollectionSelect={handleSelectCollection}
        onCollectionDelete={handleDeleteCollection}
        onRenameCollection={handleRenameCollection}
        onRenameTag={handleRenameTag}
        onDeleteTag={handleDeleteTag}
        onBulkDeleteCollections={(ids) => {
          if (!ids || ids.length === 0) return;
          // 1. Calculate Usage
          let promptCount = 0;
          let snippetCount = 0;
          ids.forEach(id => {
            promptCount += (prompts || []).filter(p => p.collectionId === id).length;
            snippetCount += (snippets || []).filter(s => s.collectionId === id).length;
          });
          const totalCount = promptCount + snippetCount;

          // 2. Confirm
          const message = totalCount > 0
            ? `Deleting these ${ids.length} collections will move ${totalCount} item${totalCount === 1 ? '' : 's'} to "Uncategorized". Continue?`
            : `Are you sure you want to delete these ${ids.length} collections?`;

          confirmAction(
            "Delete Collections?",
            message,
            async () => {
              for (const id of ids) {
                await deleteCollection(id);
              }
            },
            true,
            "Delete All"
          );
        }}
        onBulkDeleteTags={(tagNames) => {
          if (!tagNames || tagNames.length === 0) return;
          // 1. Calculate Usage
          let totalCount = 0;
          tagNames.forEach(name => {
            const pCount = (prompts || []).filter(p => p.tags?.includes(name)).length;
            const sCount = (snippets || []).filter(s => s.tags?.includes(name)).length;
            totalCount += pCount + sCount;
          });

          // 2. Confirm
          const message = `Removing these ${tagNames.length} tags from ${totalCount} item${totalCount === 1 ? '' : 's'}?`;

          confirmAction(
            "Remove Tags?",
            message,
            async () => {
              for (const name of tagNames) {
                await deleteTag(name);
              }
            },
            true,
            "Remove All"
          );
        }}
      />

      {/* 2. CONTENT SWITCHER */}
      {currentView === 'settings' ? <SettingsView onViewChange={setCurrentView} /> :
        currentView === 'snippets' ? (
          <SnippetLibrary
            onNotification={showNotification}
            onViewChange={setCurrentView}
            filteredSnippets={filteredSnippets}
            activeCollectionId={activeCollectionId}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            tags={allTags}
            onCreateCollection={saveCollection}
            isZenMode={isZenMode}
            setIsZenMode={setIsZenMode}
            onToggleZenMode={toggleAllSidebars}
            isSidebarCollapsed={isSidebarCollapsed}
            // Lifted State
            editName={snippetEditName}
            setEditName={setSnippetEditName}
            editContent={snippetEditContent}
            setEditContent={setSnippetEditContent}
            editTags={snippetEditTags}
            setEditTags={setSnippetEditTags}
            editCollectionId={snippetEditCollectionId}
            setEditCollectionId={setSnippetEditCollectionId}
            originalName={snippetOriginalName}
            setOriginalName={setSnippetOriginalName}
            pendingSnippetId={pendingSnippetId}
            pendingSnippetTab={pendingSnippetTab}
            onClearPendingSnippet={handleClearPendingSnippet}
            backlinks={snippetBacklinks}
            onOpenKnowledgeTile={handleOpenKnowledgeTile}
            onOpenPromptNote={handleOpenPromptNote}
            onNavigate={({ type, id, tab }) => {
              if (type === 'prompt') {
                setCurrentView('library');
                handlePromptSelect(id);
              } else if (type === 'kb') {
                setCurrentView('guide');
                setPendingKbId(id);
              } else if (type === 'snippet') {
                setCurrentView('snippets');
                setPendingSnippetId(id);
                if (tab) setPendingSnippetTab(tab);
              }
            }}
            isDarkMode={isDarkMode}
          />
        ) :
          currentView === 'guide' ? (
            <KnowledgeBase
              onNotification={showNotification}
              tiles={knowledgeTiles}
              prompts={prompts}
              snippets={snippets}
              onAdd={handleAddTile}
              onEdit={handleEditTile}
              onDelete={handleDeleteTile}
              onBulkDelete={handleBulkDeleteTiles}
              activeCollectionId={activeCollectionId}
              selectedTags={selectedTags}
              onRemoveTag={(tag) => setSelectedTags(prev => prev.filter(t => t !== tag))} // <-- NEU
              onClearTags={() => setSelectedTags([])} // <-- NEU
              tags={allTags}
              collections={collections}
              onCreateCollection={saveCollection}
              searchQuery={kbSearchQuery}
              onSearchChange={setKbSearchQuery}
              pendingKbId={pendingKbId}
              onClearPendingKb={handleClearPendingKb}
              onNavigateToPrompt={(targetKey) => {
                if (!targetKey) return;
                const cleanKey = String(targetKey).trim();

                // Sucht nach exaktem Titel, Titel mit (imported) oder nach der ID
                const targetPrompt = prompts.find(p =>
                  p.title === cleanKey ||
                  p.title === `${cleanKey} (imported)` ||
                  p.title.replace(/\s*\(imported\)$/i, '') === cleanKey.replace(/\s*\(imported\)$/i, '') ||
                  p.id === cleanKey
                );

                if (targetPrompt) {
                  handlePromptSelect(targetPrompt.id);
                  setCurrentView('library');
                } else {
                  showNotification(`Prompt "${cleanKey}" not found`, 'error');
                }
              }}
              onNavigateToSnippet={(targetKey) => {
                if (!targetKey) return;
                const cleanKey = String(targetKey).trim();

                const targetSnippet = snippets.find(s =>
                  s.name === cleanKey ||
                  s.name === `${cleanKey} (imported)` ||
                  s.name.replace(/\s*\(imported\)$/i, '') === cleanKey.replace(/\s*\(imported\)$/i, '') ||
                  s.id === cleanKey
                );

                if (targetSnippet) {
                  setPendingSnippetId(targetSnippet.id);
                  setCurrentView('snippets');
                } else {
                  showNotification(`Snippet "${cleanKey}" not found`, 'error');
                }
              }}
              kbBacklinks={kbBacklinks}
              onOpenPromptNote={handleOpenPromptNote}
              isDarkMode={isDarkMode}
            />
          ) : (
            <>
              <LibraryPanel
                isCollapsed={isPromptListCollapsed}
                onToggleCollapse={() => setIsPromptListCollapsed(!isPromptListCollapsed)}
                prompts={filteredPrompts}
                activePromptId={activePromptId}
                onSelect={handlePromptSelect}
                onDeletePrompt={handleDeletePromptById}
                onDuplicatePrompt={handleDuplicatePrompt}
                onBulkDelete={handleBulkDeletePrompts}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onCreate={handleCreate}
                selectedTags={selectedTags}
                onClearTags={() => setSelectedTags([])}
                onRemoveTag={(tag) => setSelectedTags(prev => prev.filter(t => t !== tag))} // <-- NEU: Kapselung ohne globale State-Verschmutzung
                tags={allTags}
                onCreateCollection={saveCollection}
                backlinks={promptBacklinks}
                onOpenKnowledgeTile={handleOpenKnowledgeTile}
                onOpenPromptNote={handleOpenPromptNote}
              />

              <main className="flex-1 flex min-w-0 bg-bg relative overflow-hidden">
                <div className={`flex-1 flex min-w-0 h-full relative ${useZenLook ? 'justify-center overflow-y-auto custom-scrollbar bg-bg' : ''}`}>
                  {/* TOGGLE LIBRARY (Left Edge of focused area) - Only if prompt active */}
                  {activePrompt && (
                    <button
                      onClick={() => setIsPromptListCollapsed(!isPromptListCollapsed)}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1 bg-border/40 hover:bg-primary hover:text-white rounded-r-md transition-all shadow-md backdrop-blur-sm"
                      title={isPromptListCollapsed ? "Show Library" : "Hide Library"}
                    >
                      {isPromptListCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                  )}

                  <motion.div
                    layout
                    className={`flex-1 flex flex-col min-w-0 relative h-full overflow-hidden ${useZenLook && activePrompt ? 'max-w-[850px] border-x border-border shadow-2xl z-20 bg-bg-surface' : ''}`}
                  >
                    {activePrompt ? (
                      <Workspace
                        activePrompt={activePrompt}
                        activeStepId={activeStepId}
                        localTitle={localTitle}
                        onTitleChange={handleTitleChange}
                        onTagsChange={handleTagsChange}
                        onShare={(stepId = null) => {
                          setShareTargetStepId(stepId);
                          setIsShareOpen(true);
                        }}
                        onShareWorkflow={() => {
                          setIsShareWorkflowOpen(true);
                        }}
                        isZenMode={isZenMode}
                        setIsZenMode={setIsZenMode}
                        onToggleZenMode={toggleAllSidebars}

                        isPreviewMode={isPreviewMode}
                        onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
                        isSaving={isSaving}
                        onManualSnapshot={handleManualSnapshot}
                        onDeletePrompt={handleDeletePrompt}
                        localEditorContent={localEditorContent}
                        onEditorChange={handleEditorChange}
                        localStepTitles={localStepTitles}
                        onStepTitleChange={handleStepTitleChange}
                        onStepFocus={handleStepFocus}
                        onMoveStep={moveStep}
                        onCopyStep={handleCopyStep}
                        onSaveStep={handleSaveStep}
                        onDeleteStep={handleDeleteStep}
                        onAddStep={handleAddStep}
                        onLaunchStep={handleLaunchStep}
                        snippets={snippets}
                        prompts={prompts}
                        copyingStepId={copyingStepId}
                        savingStepId={savingStepId}
                        llms={llms}
                        getPreviewForStep={getPreviewForStep}
                        syntaxSuggestions={filteredSuggestions}
                        onApplySuggestions={handleApplySuggestions}
                        onIgnoreSuggestions={handleIgnoreSuggestions}
                        onAssignToCollection={assignToCollection}
                        onNotification={showNotification}
                        tags={allTags}
                        backlinks={promptBacklinks[activePrompt.id] || []}
                        onOpenKnowledgeTile={handleOpenKnowledgeTile}
                        onOpenPromptNote={handleOpenPromptNote}
                        isDarkMode={isDarkMode}
                      />
                    ) : (
                      /* MINIMALIST IDE WORKSPACE EMPTY STATE */
                      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none bg-bg text-center">
                        <div className="max-w-xs space-y-4">
                          
                          {/* IDE Icon Header (Restored Original Size 64) */}
                          <LayoutGrid size={64} strokeWidth={1} className="mx-auto opacity-40 text-text-muted" />

                          {/* Typography */}
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-text-main uppercase tracking-wider">
                              {prompts.length === 0 ? "Library Empty" : "No Prompt Selected"}
                            </h3>
                            <p className="text-xs text-text-muted leading-relaxed">
                              {prompts.length === 0
                                ? "Create your first prompt or import templates from the community hub."
                                : "Select an item from your library, press "}
                              {prompts.length > 0 && (
                                <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono font-bold text-text-main">
                                  Ctrl+K
                                </kbd>
                              )}
                              {prompts.length > 0 && " to search, or explore workflows."}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-2 flex justify-center gap-2">
                            <button
                              onClick={handleCreate}
                              className="px-3.5 py-1.5 bg-bg-elevated hover:bg-bg-hover border border-border hover:border-text-muted/40 text-xs font-semibold text-text-main rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Plus size={14} className="text-primary shrink-0" />
                              <span>{prompts.length === 0 ? "Create Prompt" : "New Prompt"}</span>
                            </button>

                            <button
                              onClick={() => window.open("https://leanprompts.app/explore/", "_blank")}
                              className="px-3.5 py-1.5 bg-bg-elevated hover:bg-bg-hover border border-border hover:border-text-muted/40 text-xs font-semibold text-text-muted hover:text-text-main rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                              title="Browse leanprompts.app"
                            >
                              <Globe size={13} className="text-indigo-400 shrink-0" />
                              <span>Workflow Hub</span>
                              <span className="text-[10px] text-text-faint font-mono">↗</span>
                            </button>
                          </div>

                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* TOGGLE INSPECTOR (Right Edge of focused area) - Only if prompt active */}
                  {activePrompt && (
                    <button
                      onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-30 p-1 bg-border/40 hover:bg-primary hover:text-white rounded-l-md transition-all shadow-md backdrop-blur-sm"
                      title={isInspectorCollapsed ? "Show Inspector" : "Hide Inspector"}
                    >
                      {isInspectorCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                </div>

                {/* INSPECTOR PANEL (At the edge of screen, sibling to main content) */}
                {activePrompt && (
                  <InspectorPanel
                    activePresetName={activePresetName}
                    isCollapsed={isInspectorCollapsed}
                    onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
                    onConfirmAction={confirmAction}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    activeStepId={activeStepId}
                    detectedVariables={detectedVariables}
                    snippetVariables={snippetVariables}
                    variableValues={variableValues}
                    onVariableChange={handleVariableChange}
                    currentStepFiles={currentStepFiles}
                    onFilesChange={handleFilesChange}
                    onClearSession={handleClearSession}
                    activeStepContent={activeStepContent}
                    llms={llms}
                    localEditorContent={localEditorContent}
                    resolvedEditorContent={fullResolvedContent}
                    fullResolvedContent={fullResolvedContent}
                    snippets={snippets}
                    activePrompt={activePrompt}
                    toggleVariableIgnore={toggleVariableIgnore}
                    currentStepNote={currentStepNote}
                    handleResetNoteRequest={handleResetNoteRequest}
                    currentHistoryVersions={currentHistoryVersions}
                    onRestoreVersion={(content) => {
                      usePromptStore.getState().restoreVersion(activePrompt.id, content, activeStepId);
                      setLocalEditorContent(content);
                    }}
                    onNotification={showNotification}
                    getPreviewForStep={getPreviewForStep}
                    onManualSnapshot={handleManualSnapshot}
                    isSaving={isSaving}
                    onSavePreset={handleSavePreset}
                    onDeletePreset={handleDeletePreset}
                    onLoadPreset={handleLoadPreset}
                    onRenamePreset={handleRenamePreset}
                    prompts={prompts}
                    knowledgeTiles={knowledgeTiles}
                    /* @PROTECTED_REGION START: NOTE_LINK_NAVIGATION
                       CRITICAL: Uses handlePromptSelect (NOT setActivePrompt) to ensure
                       the first step is selected when navigating via note links. */
                    onNoteNavigate={({ type, id }) => {
                      if (type === 'prompt') {
                        setCurrentView('library');
                        handlePromptSelect(id);
                      } else if (type === 'kb') {
                        setCurrentView('guide');
                        setPendingKbId(id);
                      } else if (type === 'snippet') {
                        setCurrentView('snippets');
                        setPendingSnippetId(id);
                      }
                    }}
                  /* @PROTECTED_REGION END: NOTE_LINK_NAVIGATION */
                  />
                )}
              </main>
            </>
          )
      }

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => {
          setIsShareOpen(false);
          setShareTargetStepId(null);
        }}
        prompt={activePrompt}
        snippets={snippets}
        initialStepId={shareTargetStepId}
      />

      <ShareWorkflowModal
        isOpen={isShareWorkflowOpen}
        onClose={() => setIsShareWorkflowOpen(false)}
        prompt={activePrompt}
        snippets={snippets}
        knowledgeTiles={knowledgeTiles}
      />

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={(val) => {
          if (modalConfig.isLarge) modalConfig.onConfirm({ title: val, content: document.getElementById('largeModalText')?.value });
          else modalConfig.onConfirm(val);
          setModalConfig(p => ({ ...p, isOpen: false }));
        }}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        confirmText={modalConfig.confirmText || "Save changes"}
        isDangerous={modalConfig.isDangerous}
        showInput={modalConfig.showInput}
        showMultiInput={modalConfig.showMultiInput}
        multiInputTags={modalItems}
        onMultiInputChange={setModalItems}
        inputPlaceholder={modalConfig.inputPlaceholder}
        defaultValue={modalConfig.defaultValue}
      >
        {modalConfig.isLarge && (
          <textarea
            id="largeModalText"
            ref={(el) => {
              if (el) enableDragSelectScroll(el);
            }}
            className="w-full h-[50vh] bg-bg border border-border rounded-xl p-5 mt-4 text-sm text-text-main focus:outline-none focus:border-primary/50 resize-none font-sans leading-relaxed shadow-inner"
            defaultValue={modalConfig.extraContent}
            placeholder="Note content..."
          />
        )}
      </ConfirmationModal>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`fixed bottom-8 right-8 z-[200] px-6 py-3 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] border flex items-center gap-3 backdrop-blur-md transition-all
              ${notification.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/50 dark:text-red-500'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/50 dark:text-emerald-500'
              }`}
          >
            {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-500" />}
            <span className="font-medium">{notification.msg}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 hover:opacity-70"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        prompts={prompts}
        snippets={snippets}
        onSelect={handleCommandPaletteSelect}
      />

      <FeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <OnboardingFlow
        type="dashboard"
        steps={DASHBOARD_TOUR_STEPS.map((step, index) => {
          let onActivate = undefined;
          
          if (index === 1) { // Step 2: Sidebar / Navigation
            onActivate = () => setIsSidebarCollapsed(false);
          } else if (index === 2) { // Step 3: Library
            onActivate = () => setIsPromptListCollapsed(false);
          } else if (index === 3) { // Step 4: Metadata & Tags (Workspace Header)
            onActivate = () => {
              setIsPromptListCollapsed(false);
              if (!activePromptId && prompts.length > 0) {
                handlePromptSelect(prompts[0].id);
              }
            };
          } else if (index === 4) { // Step 5: Editor & Smart Syntax
            onActivate = () => {
              if (!activePromptId && prompts.length > 0) {
                handlePromptSelect(prompts[0].id);
              }
            };
          } else if (index === 5) { // Step 6: Inspector Panel
            onActivate = () => {
              setIsInspectorCollapsed(false);
              if (!activePromptId && prompts.length > 0) {
                handlePromptSelect(prompts[0].id);
              }
            };
          } else if (index === 6 || index === 7) { // Step 7 & 8: Direct Inject Bar
            onActivate = () => {
              setIsInspectorCollapsed(false);
              if (!activePromptId && prompts.length > 0) {
                handlePromptSelect(prompts[0].id);
              }
            };
          } else if (index === 8) { // Step 9: Security Warning
            onActivate = () => {
              setIsPromptListCollapsed(false);
            };
          }

          return { ...step, onActivate };
        })}
      />
    </div >
  );
}