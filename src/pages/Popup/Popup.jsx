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
import React, { useEffect, useState, useMemo, useRef } from 'react';
import usePromptStore from '../../stores/promptStore';
import { requestStoragePersistence } from '../../utils/storagePersistence';
import {
    Search, Command, ArrowLeft, Copy, Check, Send, ExternalLink,
    Github, LayoutGrid, Sparkles, Settings, Info, UploadCloud,
    File as FileIcon, X, Save, Coffee, StickyNote, Eye, MessageSquare,
    Plus, FilePlus, AlertCircle, ChevronLeft, ChevronRight, Sun, Moon,
    Pin, Pencil, Wand2, PanelRight, Clock, ChevronDown, MousePointer2, AlertTriangle, HelpCircle, RefreshCw, Eraser, Maximize
} from 'lucide-react';
import { getLlmConfig, getInjectionTooltip, DEFAULT_LLMS } from '../../utils/llmConstants';
import { triggerInjection } from '../../utils/injectionAPI';
import { motion, AnimatePresence } from 'framer-motion';
import useModifierKeys from '../../hooks/useModifierKeys';
import { parseVariables, compilePrompt, resolveSnippets, stripComments } from '../../utils/variableParser';
import { LlmInjectLabel, LlmIconButton } from '../../components/llm/LlmInjectBar';
import { enableDragSelectScroll } from '../../utils/scrollHelper';

import { dbAPI } from '../../utils/db';
import { filterOversizedFiles, formatFileSize } from '../../utils/formatFileSize';
import OnboardingFlow from '../../components/onboarding/OnboardingFlow.jsx';
import { POPUP_TOUR_STEPS } from '../../config/onboardingConfig.jsx';
import useOnboardingStore from '../../stores/onboardingStore';
import ConfirmationModal from '../../components/ConfirmationModal';
import SearchInput from '../../components/SearchInput';

// NEW: Helper to get the correct active tab, even in Split-Screen Mode
// @PROTECTED_REGION START: getActiveTab
// CRITICAL: See .agent/skills/split-screen-governance/SKILL.md
// NEVER use standard chrome.tabs.query({currentWindow: true}) inside interactions
// that might occur within a Split-Screen sidebar environment.
const getActiveTab = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetWindowId = urlParams.get('targetWindow') ? parseInt(urlParams.get('targetWindow'), 10) : null;

    if (targetWindowId) {
        return await chrome.tabs.query({ active: true, windowId: targetWindowId });
    }
    return await chrome.tabs.query({ active: true, currentWindow: true });
};
// @PROTECTED_REGION END: getActiveTab

class MarkdownErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Rendering Error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return <div className="p-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 rounded">Preview Error</div>;
        }
        return this.props.children;
    }
}

export default function Popup() {
    // --- 1. STATE & STORE ---
    const store = usePromptStore();
    const prompts = store.prompts || [];
    const snippets = store.snippets || [];
    const llms = store.llms || [];
    const settings = store.settings || null;
    const loadPrompts = store.loadPrompts || (() => { });

    // BACKUP REMINDER: Intelligent — filtert Demo-Daten, Schonfrist 3 Tage
    const backupStatus = useMemo(() => {
        const userPrompts = (prompts || []).filter(p => !p.id?.startsWith('demo-'));
        const userSnippets = (snippets || []).filter(s => !s.id?.startsWith('demo-'));
        const hasUserData = userPrompts.length > 0 || userSnippets.length > 0;

        if (!hasUserData) return { show: false, message: "" };

        const now = Date.now();

        if (settings?.lastBackupTime) {
            const daysSince = Math.floor((now - new Date(settings.lastBackupTime).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > 14) {
                return { show: true, message: `Last backup was ${daysSince} days ago. Consider exporting a new one in Settings → Backup.` };
            }
            return { show: false, message: "" };
        }

        let oldestTime = now;
        for (const item of [...userPrompts, ...userSnippets]) {
            const t = new Date(item.createdAt || item.updatedAt || now).getTime();
            if (t < oldestTime) oldestTime = t;
        }
        const daysSinceStart = Math.floor((now - oldestTime) / (1000 * 60 * 60 * 24));
        if (daysSinceStart <= 3) return { show: false, message: "" };

        return { show: true, message: "You've been building your library for a few days — protect your work with a backup in Settings → Backup." };
    }, [prompts, snippets, settings?.lastBackupTime]);

    const [view, setView] = useState('list');
    const [search, setSearch] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [injectionTarget, setInjectionTarget] = useState(null);
    const [status, setStatus] = useState("idle");
    const [isSelecting, setIsSelecting] = useState(false); // NEW: Selection Mode State
    const [isConnecting, setIsConnecting] = useState(false); // NEW: Scanning/Connecting State
    const [isDragging, setIsDragging] = useState(false); // NEW: Global Drag State

    // State for Filling Mode
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [selectedStepId, setSelectedStepId] = useState(null); // NEW: Which step is selected for injection?
    const [variableValues, setVariableValues] = useState({});
    const [showInfo, setShowInfo] = useState(false);
    const [showConnectHelp, setShowConnectHelp] = useState(false);
    const [connectHelpReason, setConnectHelpReason] = useState("");

    // NEW: ID of the step where preview scrolling was enabled
    // NEW: ID of the step where preview scrolling was enabled
    const [scrollEnabledStepId, setScrollEnabledStepId] = useState(null);

    // THEME STATE
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

    // NEW: Split-Screen Toggle State
    const [isSplitScreen, setIsSplitScreen] = useState(false);

    // Check if we are currently in Split-Screen mode
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'sidebar') {
            setIsSplitScreen(true);
        } else {
            chrome.storage.local.get(['sidebarWindowId'], (res) => {
                if (res.sidebarWindowId) setIsSplitScreen(true);
            });
        }
    }, []);

    // PERSISTENCE STATE
    const [keepValues, setKeepValues] = useState(false);

    const [stepFiles, setStepFiles] = useState({});
    const fileInputRef = useRef(null);

    // QUICK PROMPT STATE
    const [quickPrompt, setQuickPrompt] = useState("");

    const [activeSource, setActiveSource] = useState('list'); // 'list' or 'quick' - Launcher priority
    const [quickPromptFiles, setQuickPromptFiles] = useState([]);
    const [notification, setNotification] = useState(null); // { type: 'success'|'warning'|'info', message: string }
    const [scrollPosition, setScrollPosition] = useState({ left: false, right: false });
    const [draggingVars, setDraggingVars] = useState({});

    // RECENT HISTORY STATE
    const [recentPrompts, setRecentPrompts] = useState([]);
    const [showHistory, setShowHistory] = useState(false); // Manual toggle state

    // QUICK-EDIT STATE
    const [editingId, setEditingId] = useState(null);
    const [editingStepId, setEditingStepId] = useState(null); // NEW: Editing a specific step
    const [editTitle, setEditTitle] = useState("");
    const [editContent, setEditContent] = useState("");

    // NEW: Track which pinned draft is currently active
    const [activeDraftId, setActiveDraftId] = useState(null);

    const [openDropdown, setOpenDropdown] = useState(null);
    const [highlightState, setHighlightState] = useState({ names: [], theme: 'primary' });

    const listRef = useRef(null);
    const inputRef = useRef(null);
    const llmScrollRef = useRef(null);
    const liveSyncTimer = useRef(null);

    // --- 2. INITIALIZATION ---
    useEffect(() => {
        requestStoragePersistence(); // Safely request persistence post-mount
        loadPrompts();
        checkContext();
        checkPersistentSelection(); // Check if a manual selection was made while popup was closed

        // Load Onboarding Status
        const onboardingStore = useOnboardingStore.getState();
        onboardingStore.loadOnboardingStatus().then(() => {
            if (!useOnboardingStore.getState().hasCompletedPopupOnboarding) {
                onboardingStore.startTour('popup');
            }
        });

        // Load Persistence Settings
        chrome.storage.local.get(['lp_keep_values']).then((data) => {
            const shouldKeep = data.lp_keep_values === true;
            setKeepValues(shouldKeep);
        });

        // Load Quick Prompt Draft
        chrome.storage.local.get(['lp_quick_prompt_draft', 'lp_recent_prompts']).then((data) => {
            if (data.lp_quick_prompt_draft) {
                setQuickPrompt(data.lp_quick_prompt_draft);
                setSearch(data.lp_quick_prompt_draft);
                setActiveSource('quick');
                // === FIX: 50ms warten bis React gerendert hat, dann Höhe anpassen ===
                setTimeout(() => {
                    if (inputRef.current) {
                        inputRef.current.style.height = '46px';
                        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
                    }
                }, 50);
            }
            if (data.lp_recent_prompts) setRecentPrompts(data.lp_recent_prompts);
        });

        inputRef.current?.focus();
        updateScrollButtons();
    }, []);

    // --- ZERO-REGRESSION: LIVE SYNC RECEIVER & RECOVERY ---
    useEffect(() => {
        // 1. RECOVERY ON MOUNT
        if (selectedPrompt) {
            chrome.storage.local.get(['lp_live_sync_ping']).then(data => {
                const payload = data.lp_live_sync_ping;
                if (payload && payload.source === 'dashboard' && payload.promptId === selectedPrompt.id && payload.type === 'text') {
                    // Verhindert veraltete Geister-Daten (> 1 Stunde)
                    if (Date.now() - payload.timestamp < 3600000) {
                        setVariableValues(prev => {
                            const merged = { ...prev };
                            // Strip existing non-file variables first
                            Object.keys(merged).forEach(k => {
                                if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                                    delete merged[k];
                                }
                            });
                            // Then merge the incoming text variables
                            Object.keys(payload.values).forEach(k => merged[k] = payload.values[k]);
                            return merged;
                        });
                    }
                }
            });
        }

        // 2. LIVE LISTENER
        const handleLiveSync = (changes, area) => {
            // UMGESCHALTET AUF 'local'
            if (area !== 'local' || !changes.lp_live_sync_ping) return;
            const payload = changes.lp_live_sync_ping.newValue;
            if (!payload || payload.source === 'popup') return; // Ignore own echoes

            // THE ULTIMATE SHIELD: Do not overwrite if user is typing here
            if (document.hasFocus()) return;

            if (selectedPrompt && payload.promptId === selectedPrompt.id && payload.type === 'text') {
                try {
                    setVariableValues(prev => {
                        const merged = { ...prev };

                        // --- SMART RESET: If payload values are completely empty, wipe all text variables! ---
                        if (Object.keys(payload.values || {}).length === 0) {
                            Object.keys(merged).forEach(k => {
                                if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                                    delete merged[k];
                                }
                            });
                            return merged;
                        }

                        // Strip existing non-file variables first
                        Object.keys(merged).forEach(k => {
                            if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                                delete merged[k];
                            }
                        });
                        // Then merge the incoming text variables
                        Object.keys(payload.values).forEach(k => merged[k] = payload.values[k]);
                        return merged;
                    });
                } catch (e) { /* silent fail */ }
            }
        };

        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener(handleLiveSync);
            return () => chrome.storage.onChanged.removeListener(handleLiveSync);
        }
    }, [selectedPrompt, selectedStepId]);
    // --- END LIVE SYNC RECEIVER & RECOVERY ---

    // --- REAL-TIME RECOVERY LAYER: Listen for file changes from Dashboard ---
    useEffect(() => {
        const handleSyncPing = (changes, area) => {
            if (area !== 'local' || !changes.lp_files_sync_ping) return;
            const payload = changes.lp_files_sync_ping.newValue;
            if (!payload || payload.source === 'popup') return;

            if (selectedPrompt && payload.promptId === selectedPrompt.id) {
                // Lade geänderte Sitzungsdateien im Hintergrund
                dbAPI.getSessionCache(selectedPrompt.id).then(async (cachedFilesMapResult) => {
                    const cachedFilesMap = cachedFilesMapResult || {};
                    const restoredValues = {};
                    const restoredStepFiles = {};

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
                            restoredValues[key] = files;
                        } else {
                            restoredStepFiles[key] = files;
                        }
                    }

                    // Text-Variablen schützen und nur Dateivariablen im State aktualisieren
                    setVariableValues(prev => {
                        const next = { ...prev };
                        // Proaktiv alte Dateivariablen entfernen
                        Object.keys(next).forEach(k => {
                            if (k.startsWith('file:') || k.startsWith('!file:')) {
                                delete next[k];
                            }
                        });
                        // Neue Dateivariablen einpflegen
                        Object.keys(restoredValues).forEach(k => {
                            next[k] = restoredValues[k];
                        });
                        return next;
                    });
                    setStepFiles(restoredStepFiles);
                }).catch(e => console.warn("Failed real-time file sync in Popup:", e));
            }
        };

        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener(handleSyncPing);
            return () => chrome.storage.onChanged.removeListener(handleSyncPing);
        }
    }, [selectedPrompt]);

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

    // Robust Scroll Detection (Fixes missing arrows on load/change)
    useEffect(() => {
        const timer = setTimeout(updateScrollButtons, 100);

        // Use ResizeObserver for definitive layout detection
        const observer = new ResizeObserver(() => updateScrollButtons());
        if (llmScrollRef.current) observer.observe(llmScrollRef.current);

        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [llms, view]);

    // AUTO-SCROLL TO ACTIVE STEP ON RESTORE OR CLICK
    useEffect(() => {
        if (view === 'fill' && selectedStepId && listRef.current) {
            // 50ms Delay: Durch den Instant-Close des alten Steps ist die Y-Koordinate jetzt sofort stabil.
            // Der Scroll startet parallel mit dem Aufklappen nach unten.
            const timer = setTimeout(() => {
                const container = listRef.current;
                const el = document.getElementById(`step-${selectedStepId}`);
                
                if (container && el) {
                    const containerRect = container.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect();
                    
                    const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - 16;
                    
                    container.scrollTo({
                        top: Math.max(0, targetScroll),
                        behavior: 'smooth'
                    });
                }
            }, 50); 
            return () => clearTimeout(timer);
        }
    }, [view, selectedStepId]); 

    const [hasRestoredSession, setHasRestoredSession] = useState(false);

    // AUTO-RESTORE SESSION (Location always, Data if keepValues is true)
    useEffect(() => {
        if (prompts.length > 0 && !hasRestoredSession && view === 'list') {
            chrome.storage.local.get(['lp_last_session', 'lp_popup_nav']).then((data) => {
                const session = data.lp_last_session;
                const nav = data.lp_popup_nav;

                // 1. Try restoring specific location (View + Prompt + Step)
                if (nav) {
                    if (nav.view === 'fill' && nav.promptId) {
                        const prompt = prompts.find(p => p.id === nav.promptId);
                        if (prompt) {
                            setHasRestoredSession(true);
                            handleSelectPrompt(prompt, nav.stepId);
                            return;
                        }
                    } else if (nav.view === 'list') {
                        // User was on the list (or Quick Prompt area)
                        setHasRestoredSession(true);
                        // If they were on the list, DO NOT fall back to legacy Keep-prompt navigation
                        // But we still want to restore the text if Keep is on
                        if (keepValues && session && session.promptId === 'quick') {
                            setQuickPrompt(session.values?.quickText || "");
                        }
                        return;
                    }
                }

                // 2. Legacy Fallback: Only if no specific nav state or first run
                if (keepValues && session && session.promptId) {
                    if (session.promptId === 'quick') {
                        setHasRestoredSession(true);
                        setQuickPrompt(session.values?.quickText || "");
                        // Restore files for quick prompt
                                                dbAPI.getSessionCache('quick').then(async (cachedFiles) => {
                            if (cachedFiles) {
                                const files = await Promise.all(cachedFiles.map(async (f) => {
                                    // SAFE-GUARD: Prevent fetch crashes on ghost files
                                    if (!f.data) {
                                        return { name: f.name, type: f.type, size: f.size, isGhost: true };
                                    }
                                    try {
                                        const res = await fetch(f.data);
                                        const blob = await res.blob();
                                        return new File([blob], f.name, { type: f.type });
                                    } catch (err) {
                                        console.warn("LeanPrompts: Failed to restore quick file from data URL, falling back to ghost placeholder", err);
                                        return { name: f.name, type: f.type, size: f.size, isGhost: true };
                                    }
                                }));
                                setQuickPromptFiles(files);
                            }
                        });
                    } else {
                        const prompt = prompts.find(p => p.id === session.promptId);
                        if (prompt) {
                            setHasRestoredSession(true);
                            handleSelectPrompt(prompt);
                        }
                    }
                } else {
                    // Mark as restored even if nothing to restore, so saving can start
                    setHasRestoredSession(true);
                }
            });
        }
    }, [prompts, keepValues, hasRestoredSession]);

    // SAVE NAVIGATION STATE (Always, independent of Keep)
    useEffect(() => {
        if (!hasRestoredSession) return;

        const nav = {
            view: view,
            promptId: view === 'fill' ? selectedPrompt?.id : null,
            stepId: view === 'fill' ? selectedStepId : null
        };
        chrome.storage.local.set({ lp_popup_nav: nav });
    }, [view, selectedPrompt?.id, selectedStepId, hasRestoredSession]);

    const checkPersistentSelection = async () => {
        const [tab] = await getActiveTab();
        if (!tab?.id) return;

        const key = `lp_manual_selection_${tab.id}`;
        const data = await chrome.storage.local.get([key]);
        if (data[key]) {
            const selection = data[key];
            // Only use if recent (within last 5 minutes)
            if (Date.now() - selection.timestamp < 300000) {
                setInjectionTarget(selection.name || "Selected Field");
                // Clear it so it doesn't stick forever if they refresh or navigating
                chrome.storage.local.remove([key]);
            }
        }
    };

    // DRAFT CHIPS STATE
    const [savedDrafts, setSavedDrafts] = useState([]);

    // MODAL STATE
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: null,
        isDangerous: false,
        confirmText: ""
    });

    // DEBUG OVERLAY STATE (Ctrl+Shift+D)
    const [debugInfo, setDebugInfo] = useState(null);

    // --- EFFECTS ---
    useEffect(() => {
        // Initial Theme Load
        chrome.storage.local.get(['lp_theme', 'lp_saved_drafts'], (result) => {
            if (result.lp_theme) {
                const isDark = result.lp_theme === 'dark';
                setIsDarkMode(isDark);
                document.documentElement.classList.toggle('dark', isDark);
                // Sync to localStorage for next time (Preloader Fix)
                localStorage.setItem('theme', result.lp_theme);
            }
            // Load Drafts
            if (result.lp_saved_drafts) {
                setSavedDrafts(result.lp_saved_drafts);
            }
        });

        // RESTORED: Initial Connection Check
        checkContext();

        // Listener for Theme Changes (Global Sync)
        const handleStorageChange = (changes, area) => {
            if (area === 'local' && (changes.lp_theme || changes.lp_saved_drafts || changes.lp_quick_prompt_draft)) {
                if (changes.lp_theme) {
                    const newTheme = changes.lp_theme.newValue;
                    const isDark = newTheme === 'dark';
                    setIsDarkMode(isDark);
                    document.documentElement.classList.toggle('dark', isDark);
                    document.documentElement.classList.toggle('light', !isDark);
                    localStorage.setItem('theme', isDark ? 'dark' : 'light');
                }
                if (changes.lp_saved_drafts) {
                    setSavedDrafts(changes.lp_saved_drafts.newValue || []);
                }
                // Echtzeit-Sync für Split-Screen
                if (changes.lp_quick_prompt_draft) {
                    const newText = changes.lp_quick_prompt_draft.newValue || "";
                    setQuickPrompt(newText);
                    setSearch(newText);
                    setActiveSource(newText ? 'quick' : 'list');
                    // === FIX: 50ms warten bis React gerendert hat ===
                    setTimeout(() => {
                        if (inputRef.current) {
                            inputRef.current.style.height = '46px';
                            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
                        }
                    }, 50);
                }
            }

            // Listen for manual selection success from other components/scripts
            const [tab] = chrome.tabs?.query ? [{ id: null }] : []; // Placeholder check
            // Actually, we already have a message listener below for reactive updates.
            // But storage listener is good for cross-window sync if needed.
        };
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
            if (liveSyncTimer.current) clearTimeout(liveSyncTimer.current);
        };
    }, []);

    // ZERO-REGRESSION: Dynamic Connection State Listener
    // Observes the target window. If the user navigates away or switches tabs, instantly update the green/red dot.
    useEffect(() => {
        let debounceTimer;

        const evaluateTabChange = async (tabId) => {
            try {
                const [activeTab] = await getActiveTab();
                // We only care if the event happened in the tab we are currently targeting
                if (activeTab && activeTab.id === tabId) {
                    clearTimeout(debounceTimer);
                    // Slight debounce to allow the new page's content script to load before pinging
                    debounceTimer = setTimeout(() => {
                        checkContext(false);
                    }, 500);
                }
            } catch (e) { /* ignore */ }
        };

        const handleTabUpdated = (tabId, changeInfo) => {
            // Only trigger on meaningful URL changes or when a page finishes loading
            if (changeInfo.url || changeInfo.status === 'complete') {
                evaluateTabChange(tabId);
            }
        };

        const handleTabActivated = (activeInfo) => {
            evaluateTabChange(activeInfo.tabId);
        };

        if (chrome.tabs && chrome.tabs.onUpdated) {
            chrome.tabs.onUpdated.addListener(handleTabUpdated);
            chrome.tabs.onActivated.addListener(handleTabActivated);
        }

        return () => {
            clearTimeout(debounceTimer);
            if (chrome.tabs && chrome.tabs.onUpdated) {
                chrome.tabs.onUpdated.removeListener(handleTabUpdated);
                chrome.tabs.onActivated.removeListener(handleTabActivated);
            }
        };
    }, []);

    // Listener for Manual Selection Success (from standalone script)
    useEffect(() => {
        const handleMessage = (message) => {
            if (message.action === "MANUAL_SELECTION_SUCCESS") {
                setInjectionTarget(message.name || "Selected Field");
                showNotify(`Connected to ${message.name || "field"}`, "success");
                setIsSelecting(false);
                setShowConnectHelp(false);
            }
        };
        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    // --- ZERO-REGRESSION: RAM Guard Notification ---
    useEffect(() => {
        const handleBatchLimit = () => {
            showNotify("Upload stopped at 100MB limit to prevent browser crashes.", "warning");
        };
        window.addEventListener('lp-batch-limit-hit', handleBatchLimit);
        return () => window.removeEventListener('lp-batch-limit-hit', handleBatchLimit);
    }, []);

    // DEBUG: Export State Shortcut (Ctrl+Shift+Y)
    useEffect(() => {
        const handleKeyDown = async (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'y') {
                try {
                    const [tab] = await getActiveTab();
                    const urlParams = new URLSearchParams(window.location.search);
                    const debugInfo = {
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent,
                        isSidebar: urlParams.get('mode') === 'sidebar',
                        targetWindowId: urlParams.get('targetWindow'),
                        activeTabId: tab?.id,
                        activeTabUrl: tab?.url,
                        injectionTarget,
                        isConnecting,
                        status,
                        connectHelpReason
                    };
                    await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                    showNotify("Debug info copied to clipboard!", "success");
                } catch (err) {
                    console.error("Debug export failed:", err);
                    showNotify("Failed to copy debug info", "error");
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [injectionTarget, isConnecting, status, connectHelpReason]);

    // Save Keep State Switch
    const toggleKeepValues = () => {
        const newVal = !keepValues;
        setKeepValues(newVal);
        chrome.storage.local.set({ lp_keep_values: newVal });

        if (!newVal) {
            chrome.storage.local.remove('lp_last_session');
        } else {
            // Save immediately if data already exists
            saveSessionData(variableValues, stepFiles, selectedPrompt?.id, true);
        }
    };

    const showNotify = (message, type = 'info', duration = 3000) => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), duration);
    };

    const toggleTheme = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        document.documentElement.classList.toggle('dark', newMode);
        document.documentElement.classList.toggle('light', !newMode);
        chrome.storage.local.set({ lp_theme: newMode ? 'dark' : 'light' });
        localStorage.setItem('theme', newMode ? 'dark' : 'light'); // Sync for Preloader
    };

    const updateScrollButtons = () => {
        if (llmScrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = llmScrollRef.current;
            setScrollPosition({
                left: scrollLeft > 10,
                right: scrollLeft + clientWidth < scrollWidth - 10
            });
        }
    };

    const addToHistory = (text) => {
        if (!text || !text.trim()) return;
        const cleanText = text.trim();
        const newHistory = [cleanText, ...recentPrompts.filter(t => t !== cleanText)].slice(0, 5);
        setRecentPrompts(newHistory);
        chrome.storage.local.set({ lp_recent_prompts: newHistory });
    };

    const removeFromHistory = (e, index) => {
        e.stopPropagation();
        e.preventDefault();
        const newHistory = recentPrompts.filter((_, i) => i !== index);
        setRecentPrompts(newHistory);
        chrome.storage.local.set({ lp_recent_prompts: newHistory });
    };

    // Helper: Save session (Text + Files per step)
    const saveSessionData = async (vars, currentStepFiles, promptId, forceSave = false) => {
        if ((!keepValues && !forceSave) || !promptId) return;

        try {
            // 1. Filter out file variables to prevent serialization issues in chrome.storage
            const serializableVars = {};
            if (vars) {
                Object.keys(vars).forEach(key => {
                    if (!key.startsWith('file:') && !key.startsWith('!file:')) {
                        serializableVars[key] = vars[key];
                    }
                });
            }

            // 2. Serialization of files per step (and file-variables) to Base64 for storage
            const combinedFiles = { ...currentStepFiles };
            if (vars) {
                Object.keys(vars).forEach(key => {
                    if ((key.startsWith('file:') || key.startsWith('!file:')) && Array.isArray(vars[key])) {
                        combinedFiles[key] = vars[key];
                    }
                });
            }

                        const serializedFiles = {};
            for (const [id, files] of Object.entries(combinedFiles)) {
                serializedFiles[id] = await Promise.all(files.map(f => new Promise((resolve, reject) => {
                    // SAFE-GUARD: Resolve ghost files immediately without FileReader crash
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
                        name: f.name,
                        type: f.type,
                        size: f.size,
                        data: reader.result
                    });
                    reader.onerror = reject;
                    reader.readAsDataURL(f);
                })));
            }

            await chrome.storage.local.set({
                lp_last_session: {
                    promptId: promptId,
                    values: serializableVars,
                }
            });

            // Save files to IndexedDB (unlimited quota)
            const targetDbKey = promptId === 'quick' ? 'quick' : promptId;
            await dbAPI.saveSessionCache(targetDbKey, serializedFiles);

            // --- Sende Signal an andere geöffnete Fenster (z.B. das Dashboard) ---
            chrome.storage.local.set({
                lp_files_sync_ping: {
                    promptId: targetDbKey,
                    timestamp: Date.now(),
                    source: 'popup'
                }
            });
        } catch (e) {
            console.error("Save session failed:", e);
        }
    };

    const checkContext = async (showFeedback = false) => {
        if (showFeedback) setIsConnecting(true);
        try {
            const [tab] = await getActiveTab();
            if (!tab?.id) return;

            // Simple ping to check if main script is alive
            chrome.tabs.sendMessage(tab.id, { action: "CHECK_COMPATIBILITY_v105" }, (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    setInjectionTarget(null);
                    if (showFeedback) {
                        // If it fails on click, we trigger the "Hard" logic
                        handleHardConnect(tab);
                    }
                } else if (response && response.isSupported && response.hasInput) {
                    setInjectionTarget(response.name);
                    if (showFeedback) showNotify(`Connected to ${response.name}`, "success");
                } else {
                    setInjectionTarget(null);
                    if (showFeedback) {
                        const msg = response?.reason === "LOGIN_REQUIRED"
                            ? "Field locked."
                            : (response?.isSupported ? "Click into the field." : "Page not supported.");
                        showNotify(msg, response?.reason === "LOGIN_REQUIRED" ? "warning" : "info");
                    }
                }
                if (showFeedback) setIsConnecting(false);
            });
        } catch (e) {
            if (showFeedback) setIsConnecting(false);
        }
    };

    const isKnownLLM = (url) => {
        if (!url) return false;
        const low = url.toLowerCase();

        // Zero-Regression: Ensure Bing fallback remains active even if hidden from DEFAULT_LLMS
        if (low.includes('bing.com')) return true;

        return DEFAULT_LLMS.some(llm => {
            const cleanHost = llm.url.replace(/^https?:\/\//, '').toLowerCase();
            if (low.includes(cleanHost)) return true;
            if (llm.alternativeDomains && llm.alternativeDomains.some(alt => low.includes(alt.toLowerCase()))) return true;
            return false;
        });
    };

    // @PROTECTED_REGION START: handleHardConnect
    // CRITICAL (UI Deadlock Protection): See .agent/skills/split-screen-governance/SKILL.md
    // NEVER remove the inner try...finally block. It strictly guarantees setIsConnecting(false) 
    // executes if the target tab completely crashes or the port disconnects mid-flight.
    const handleHardConnect = async (tab) => {
        setIsConnecting(true);

        try {
            // 1. Try standard message again just in case
            chrome.tabs.sendMessage(tab.id, { action: "CHECK_COMPATIBILITY_v105" }, async (response) => {
                const lastErr = chrome.runtime.lastError;

                if (!lastErr && response?.hasInput) {
                    setInjectionTarget(response.name);
                    setIsConnecting(false);
                    return;
                }

                // 2. FAILED -> Attempt "Direct Probe" (Can we inject at all?)
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => { return !!document.body; }
                    });

                    // PROBE SUCCESS -> We can inject, but main script is missing.
                    if (isKnownLLM(tab.url)) {
                        setConnectHelpReason("STALE_LLM_TAB");
                    } else {
                        setConnectHelpReason("FIELD_NOT_FOUND_BUT_INJECTABLE");
                    }
                    setShowConnectHelp(true);
                } catch (err) {
                    // PROBE FAILED -> Actually blocked by browser/CSP
                    setConnectHelpReason("BROWSER_RESTRICTED");
                    setShowConnectHelp(true);
                } finally {
                    // Inner finally ensures UI reset even if probe fails internally
                    setIsConnecting(false);
                }
            });
        } catch (err) {
            console.error("Hard connect failed catastrophically:", err);
            setIsConnecting(false); // Safety fallback
        }
    };
    // @PROTECTED_REGION END: handleHardConnect

    const handleConnect = async (e) => {
        if (e) e.stopPropagation();

        if (isSelecting) {
            setIsSelecting(false);
            const [tab] = await getActiveTab();
            if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, { action: "STOP_SELECTION_MODE" }, () => {
                    if (chrome.runtime.lastError) { /* ignore */ }
                });
            }
            return;
        }

        if (injectionTarget) {
            startSelectionMode(); // Allow changing target if already connected
            return;
        }

        const [tab] = await getActiveTab();
        if (!tab?.id) return;

        handleHardConnect(tab);
    };

    const startSelectionMode = async () => {
        const [tab] = await getActiveTab();
        if (!tab?.id) return;

        setIsSelecting(true);

        // Helper for direct injection fallback (Fail-proof)
        const runFallback = async () => {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => {
                        if (window.LP_SELECTION_ACTIVE) return;
                        window.LP_SELECTION_ACTIVE = true;

                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(59,130,246,0.15);z-index:2147483647;pointer-events:none;';

                        const toast = document.createElement('div');
                        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:12px;font-family:sans-serif;font-size:15px;font-weight:bold;z-index:2147483647;pointer-events:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1);';
                        toast.innerText = "Select Mode Active: Click input. (Esc to cancel)";

                        const style = document.createElement('style');
                        style.textContent = '*{cursor:crosshair !important;} body::after{content:"";position:fixed;top:0;left:0;right:0;bottom:0;border:4px solid #3b82f6;pointer-events:none;z-index:2147483646;box-shadow:inset 0 0 20px rgba(59,130,246,0.2);}';

                        document.body.appendChild(overlay);
                        document.body.appendChild(toast);
                        document.head.appendChild(style);

                        const cleanup = () => {
                            overlay.remove(); toast.remove(); style.remove();
                            window.removeEventListener('click', clickHandler, true);
                            window.removeEventListener('keydown', escHandler, true);
                            window.LP_SELECTION_ACTIVE = false;
                        };

                        const clickHandler = (e) => {
                            e.stopPropagation(); e.preventDefault();
                            const target = e.target;
                            const isInput = target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea' || target.isContentEditable;
                            if (!isInput) return;

                            target.setAttribute('data-lp-manual-target', 'true');
                            chrome.runtime.sendMessage({ action: "MANUAL_SELECTION_SUCCESS", name: target.tagName, mark: true });
                            cleanup();
                        };

                        const escHandler = (e) => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                e.preventDefault();
                                cleanup();
                            }
                        };

                        window.addEventListener('click', clickHandler, true);
                        window.addEventListener('keydown', escHandler, true);
                    }
                });
            } catch (err) {
                console.error("LeanPrompts: Injection fallback failed", err);
                setIsSelecting(false);
                setShowConnectHelp(true);
                setConnectHelpReason("BROWSER_RESTRICTED");
            }
        };

        chrome.tabs.sendMessage(tab.id, { action: "START_SELECTION_MODE" }, (response) => {
            if (chrome.runtime.lastError) {
                console.info("LeanPrompts: Standard message blocked, using Direct Injection.");
                runFallback();
                return;
            }

            if (response?.started) {
                const urlParams = new URLSearchParams(window.location.search);
                const isSidebar = urlParams.get('mode') === 'sidebar';
                if (!isSidebar) window.close();
            } else {
                runFallback();
            }
        });
    };



    // --- 3. FILTER LOGIC ---
    const filteredPrompts = useMemo(() => {
        if (view !== 'list') return prompts;
        if (!search) return prompts;
        const q = search.toLowerCase();
        return prompts.filter(p =>
            (p.title && p.title.toLowerCase().includes(q)) ||
            (p.content && p.content.toLowerCase().includes(q)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
        );
    }, [prompts, search, view]);

    useEffect(() => { setSelectedIndex(0); }, [search, view]);

    // SCROLL RESET ON VIEW CHANGE
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = 0;
        }
    }, [view]);

    // @PROTECTED_REGION START: SPLIT_SCREEN_DEBUG_SHORTCUT
    // CRITICAL: Do NOT remove. See .agent/skills/split-screen-governance/SKILL.md Rule 10
    // DEBUG SHORTCUT: Ctrl+Shift+D — Split-Screen diagnostics overlay
    useEffect(() => {
        const handler = (e) => {
            // Open debug overlay
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                chrome.runtime.sendMessage({ action: "DEBUG_SPLIT_SCREEN" }, (resp) => {
                    if (chrome.runtime.lastError) {
                        setDebugInfo({ error: chrome.runtime.lastError.message });
                    } else if (resp?.success) {
                        setDebugInfo(resp.debug);
                    } else {
                        setDebugInfo({ error: resp?.error || 'Unknown error' });
                    }
                });
                return;
            }
            // Dismiss debug overlay on any other key
            if (debugInfo) {
                setDebugInfo(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [debugInfo]);
    // @PROTECTED_REGION END: SPLIT_SCREEN_DEBUG_SHORTCUT

    // --- 4. ACTION HANDLERS ---

    const handleSelectPrompt = async (prompt, restoredStepId = null) => {
        if (!prompt) return;

        setActiveSource('list');
        setSelectedPrompt(prompt);
        setSelectedStepId(restoredStepId || prompt.chain?.[0]?.id || null); // Restore or pre-select first step
        setShowInfo(false);
        setScrollEnabledStepId(null); // Reset scroll status

        let restoredValues = {};
        let restoredStepFiles = {};

        // RESTORE LOGIC (Async!)
        if (keepValues) {
            try {
                // 1. Dateien IMMER aus der IndexedDB laden, wenn vorhanden (Dashboard-Sync)
                const cachedFilesMap = await dbAPI.getSessionCache(prompt.id) || {};
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
                        restoredValues[key] = files;
                    } else {
                        restoredStepFiles[key] = files;
                    }
                }
            } catch (e) {
                console.warn("LeanPrompts: Failed to load files from IndexedDB in Popup:", e);
            }

            try {
                // 2. Text-Variablen nur laden, wenn die letzte aktive Sitzung übereinstimmt (Decoupled)
                const data = await chrome.storage.local.get(['lp_last_session']);
                const session = data.lp_last_session;
                if (session && session.promptId === prompt.id) {
                    Object.keys(session.values || {}).forEach(k => {
                        if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                            restoredValues[k] = session.values[k];
                        }
                    });
                }
            } catch (e) {
                console.warn("LeanPrompts: Failed to restore text session safely in Popup:", e);
            }
        }

        setVariableValues(restoredValues);
        setStepFiles(restoredStepFiles);
        setView('fill');
    };

    // FILE HANDLERS PER STEP
    const handleDrop = (e, stepId) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        const accepted = filterOversizedFiles(droppedFiles, (f) => {
            showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
        });
        if (accepted.length === 0) return;
        const currentFiles = stepFiles[stepId] || [];
        const nextStepFiles = { ...stepFiles, [stepId]: [...currentFiles, ...accepted] };
        setStepFiles(nextStepFiles);
        saveSessionData(variableValues, nextStepFiles, selectedPrompt?.id);
    };

    const handleFileRemove = (stepId, index) => {
        const currentFiles = stepFiles[stepId] || [];
        const nextStepFiles = { ...stepFiles, [stepId]: currentFiles.filter((_, i) => i !== index) };
        setStepFiles(nextStepFiles);
        saveSessionData(variableValues, nextStepFiles, selectedPrompt?.id);
    };

    const handleManualFileSelect = (e) => {
        if (!selectedStepId) return;
        const selected = Array.from(e.target.files);
        const accepted = filterOversizedFiles(selected, (f) => {
            showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
        });
        if (accepted.length === 0) { e.target.value = ''; return; }
        const currentFiles = stepFiles[selectedStepId] || [];
        const nextStepFiles = { ...stepFiles, [selectedStepId]: [...currentFiles, ...accepted] };
        setStepFiles(nextStepFiles);
        saveSessionData(variableValues, nextStepFiles, selectedPrompt?.id);
        // Clear input so same file can be selected again
        e.target.value = '';
    };

    const executePromptAction = async (text, incomingFiles = [], specificLlmUrl = null, forceNavigate = false) => {
        let filesForInjection = [...incomingFiles];

        // Merge with files from variableValues if injecting from a saved prompt
        if (activeSource === 'list' && variableValues && text !== null) {
            // ZERO-REGRESSION GUARD: Parse den finalen Injection-Text
            const safeSnippets = snippets || [];
            const resolvedText = resolveSnippets(text || "", safeSnippets);
            const currentVars = parseVariables(resolvedText) || [];
            const cleanVars = currentVars.map(v => v.replace(/^!/, '').replace(/^!file:/i, 'file:'));

            Object.keys(variableValues).forEach(key => {
                const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
                if (cleanKey.startsWith('file:') && cleanVars.includes(cleanKey)) {
                    const varFiles = variableValues[key];
                    if (Array.isArray(varFiles)) {
                        filesForInjection.push(...varFiles);
                    } else if (varFiles) {
                        filesForInjection.push(varFiles);
                    }
                }
            });
            // Deduplicate
            filesForInjection = filesForInjection.filter((file, index, self) =>
                index === self.findIndex(f => f.name === file.name && f.size === file.size)
            );
        }

        const hasFiles = filesForInjection.length > 0;
        /* @PROTECTED_REGION: Window targeting - DO NOT MODIFY
           Ensures LLMs open in the correct browser window.
           - Sidebar: uses targetWindow from URL
           - Normal popup: uses current browser window
           See: .agent/skills/split-screen-governance/SKILL.md */
        const urlParams = new URLSearchParams(window.location.search);
        const isSidebar = urlParams.get('mode') === 'sidebar';

        // Get target window: from URL (sidebar) or current window (normal popup)
        let targetWindowId = urlParams.get('targetWindow') ? parseInt(urlParams.get('targetWindow'), 10) : null;

        // Normal popup: get the current browser window to ensure LLM opens there
        if (!targetWindowId && !isSidebar) {
            try {
                const currentWindow = await chrome.windows.getCurrent();
                targetWindowId = currentWindow.id;
            } catch (e) { /* popup might not have access, fallback to null */ }
        }

        const ghostFiles = filesForInjection.filter(f => f.isGhost || (!f.data && !(f instanceof Blob)));

        const executeLaunch = async () => {
            // 1. OPEN & INJECT (LLM BUTTONS)
            if (specificLlmUrl) {
                // Safe Name Resolution
                const foundLlm = llms.find(l => l.url === specificLlmUrl || getLlmConfig(l).newChatUrl === specificLlmUrl);
                const llmName = foundLlm?.name || 'AI';

                // Shift+Click Mode (Text is null)
                if (!text && !hasFiles) {
                    showNotify(`Opening ${llmName}...`, 'info');
                } else {
                    showNotify(`Injecting into ${llmName}...`, 'info');
                }

                                let processedFiles = [];
                if (hasFiles) {
                    setStatus("processing");
                    
                    // Filter out any ghost files (missing Base64 data) to prevent FileReader crashes
                    const validFiles = filesForInjection.filter(f => !f.isGhost && (f instanceof Blob || f.data));
                    
                    processedFiles = await Promise.all(validFiles.map(f => new Promise((resolve, reject) => {
                        // Support pre-processed Base64 data immediately
                        if (f.data && typeof f.data === 'string') {
                            resolve({ name: f.name, type: f.type, data: f.data });
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => resolve({
                            name: f.name,
                            type: f.type,
                            data: reader.result
                        });
                        reader.onerror = reject;
                        reader.readAsDataURL(f);
                    })));
                }

                /* @PROTECTED_REGION START: POPUP_LAUNCH_TRIGGER
                CRITICAL: Use ONLY injectionAPI. */
                triggerInjection({
                    action: "OPEN_AND_INJECT",
                    url: specificLlmUrl,
                    text, // will be null if Shift+Click
                    files: processedFiles,
                    forceNavigate, // NEW: Force new chat if Ctrl+clicked
                    alternativeDomains: foundLlm?.alternativeDomains || [],
                    targetWindowId // Multi-monitor: target the window this sidebar belongs to
                }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
                /* @PROTECTED_REGION END: POPUP_LAUNCH_TRIGGER */


                if (!isSidebar) setTimeout(() => window.close(), 1500);
                return;
            }

            // 2. DIRECT INJECT / CLIPBOARD (GENERIC)
            if (!text && !hasFiles) {
                showNotify(`Nothing to inject or copy.`, 'warning');
                return;
            }

            // Process files for generic injection if needed
                        let processedFiles = [];
            if (hasFiles) {
                setStatus("processing");
                
                // Filter out any ghost files (missing Base64 data) to prevent FileReader crashes
                const validFiles = filesForInjection.filter(f => !f.isGhost && (f instanceof Blob || f.data));
                
                processedFiles = await Promise.all(validFiles.map(f => new Promise((resolve, reject) => {
                    // Support pre-processed Base64 data immediately
                    if (f.data && typeof f.data === 'string') {
                        resolve({ name: f.name, type: f.type, data: f.data });
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        name: f.name,
                        type: f.type,
                        data: reader.result
                    });
                    reader.onerror = reject;
                    reader.readAsDataURL(f);
                })));
            }

            if (injectionTarget) {
                setStatus("success");
                setTimeout(() => setStatus("idle"), 2000); // <-- NEU: Setzt den Button nach 2 Sek. zurück
                
                showNotify(`Injected into ${injectionTarget}`, 'success');
                triggerInjection({
                    action: "INJECT_CURRENT",
                    text,
                    files: processedFiles
                }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
                if (!isSidebar) setTimeout(() => window.close(), 800);
            } else {
                setStatus("success");
                setTimeout(() => setStatus("idle"), 2000); // <-- NEU: Setzt den Button nach 2 Sek. zurück
                
                showNotify("Copied to clipboard!", 'success');
                if (text) await navigator.clipboard.writeText(text);
                if (!isSidebar) setTimeout(() => window.close(), 1000);
            }
        };

        if (ghostFiles.length > 0 && text !== null) {
            showNotify(`Skipped ${ghostFiles.length} missing file(s)`, 'warning');
        }

        executeLaunch();
    };

    const handleSplitScreen = async () => {
        // NEW: Undo / Fullscreen Logic
        if (isSplitScreen) {
            chrome.runtime.sendMessage({ action: "UNDO_SPLIT_SCREEN" });
            // Das setTimeout verhindert, dass React versucht, State auf einem ungemounteten DOM zu setzen,
            // während der Background-Worker das Fenster schließt.
            setTimeout(() => window.close(), 50);
            return;
        }

        // EXISTING LOGIC (Unangetastet ab hier)
        try {
            const currentWindow = await chrome.windows.getCurrent();
            const screenLeft = window.screen.availLeft || 0;
            const screenTop = window.screen.availTop || 0;
            const screenWidth = window.screen.availWidth;
            const screenHeight = window.screen.availHeight;
            const sidebarWidth = 450;
            const browserWidth = screenWidth - sidebarWidth;

            // Capture the timeout ID
            const fallbackTimer = setTimeout(() => window.close(), 1000);

            chrome.runtime.sendMessage({
                action: "TRIGGER_SPLIT_SCREEN",
                currentWindowId: currentWindow.id,
                screenLeft,
                screenTop,
                browserWidth,
                screenHeight,
                sidebarWidth
            }, (response) => {
                clearTimeout(fallbackTimer); // Clear the safety timer!

                if (chrome.runtime.lastError) {
                    console.error("Split-screen init failed:", chrome.runtime.lastError.message);
                } else if (response && response.success === false) {
                    // Prevent closing and show error toast
                    showNotify(response.error, "error");
                    return; 
                }
                window.close(); // Only close on success
            });
        } catch (error) {
            console.error("Split screen triggers failed:", error);
        }
    };

    // --- ZERO-REGRESSION: VALIDATION HELPER ---
    const validateRequiredVariables = (promptContent) => {
        if (!promptContent) return true;

        const withSnippets = resolveSnippets(promptContent, snippets);
        const stepVars = parseVariables(withSnippets);
        const missingReq = stepVars.filter(v => {
            if (!v.startsWith('!')) return false;
            if (selectedPrompt?.ignoredVariables?.includes(v)) return false;
            const isFile = v.toLowerCase().startsWith('!file:');
            const cleanV = v.replace(/^!/, '').replace(/^!file:/i, 'file:');
            const userVal = variableValues[cleanV] !== undefined ? variableValues[cleanV] : variableValues[v];

            if (isFile) return !userVal || !Array.isArray(userVal) || userVal.length === 0;
            if (userVal !== undefined && String(userVal).trim() !== "") return false;

            try {
                const escapedV = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\{\\{\\s*${escapedV}\\s*:([^}]+)\\}\\}`, 'i');
                const match = withSnippets.match(regex);
                if (match && match[1] && match[1].trim() !== "") return false;
            } catch(e) {}

            return true;
        });

        if (missingReq.length > 0) {
            const names = missingReq.map(v => v.replace(/^!file:/i, '').replace(/^!/, ''));
            showNotify(`Required fields missing: ${names.join(', ')}`, 'error');

            setHighlightState({ names: missingReq, theme: 'amber' });
            setTimeout(() => {
                setHighlightState({ names: [], theme: 'primary' });
            }, 2000);

            // Smoothly scroll and focus the first missing required variable
            const firstMissing = missingReq[0];
            const cleanKey = firstMissing.replace(/^!/, '').replace(/^!file:/i, 'file:');
            const varEl = document.getElementById(`var-field-${cleanKey}`);
            if (varEl && listRef.current) {
                const container = listRef.current;
                const containerRect = container.getBoundingClientRect();
                const elRect = varEl.getBoundingClientRect();
                
                container.scrollTo({
                    top: container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2),
                    behavior: 'smooth'
                });

                const inputTarget = varEl.querySelector('textarea, button, select');
                if (inputTarget) inputTarget.focus({ preventScroll: true });
            }

            window.dispatchEvent(new CustomEvent('lp-highlight-variables', {
                detail: { names: missingReq, theme: 'amber' }
            }));
            return false; // Validation Failed
        }
        return true; // Validation Passed
    };
    // ------------------------------------------

    const handleLaunch = (llm, e, explicitText = null, explicitFiles = null) => {
        let textToUse = "";
        let filesToUse = [];

        // MODIFIER LOGIC
        const isShift = e.shiftKey;
        const isNewChat = e.ctrlKey || e.metaKey;

        // --- VALIDATION GUARD ---
        if (!isShift && view === 'fill' && selectedPrompt && explicitText === null) {
            const activeStep = stepsWithVariables.find(s => s.id === selectedStepId);
            if (!validateRequiredVariables(activeStep?.content)) return; // 🛑 HARD STOP
        }
        // ------------------------

        // Configuration Resolution (Modular Safe)
        const config = getLlmConfig(llm);
        const targetUrl = isNewChat ? config.newChatUrl : config.url;

        // 1. Explicit Content (e.g. from specific Step Bar)
        if (explicitText !== null || explicitFiles !== null) {
            textToUse = isShift ? null : (explicitText || "");
            filesToUse = isShift ? [] : (explicitFiles || []);
        }
        // 2. Default Context (Global State)
        else if (view === 'fill' && selectedPrompt) {
            const activeStep = stepsWithVariables.find(s => s.id === selectedStepId);
            textToUse = isShift ? null : (activeStep?.compiled || "");
            filesToUse = isShift ? [] : [...(stepFiles[selectedStepId] || [])];

            // --- INTEGRATION: Resolve and merge file-variables on raw content ---
            if (!isShift && activeStep) {
                const safeSnippets = snippets || [];
                const resolvedContent = resolveSnippets(activeStep.content || "", safeSnippets);
                const currentStepVars = parseVariables(resolvedContent) || [];
                const cleanStepVars = currentStepVars.map(v => v.replace(/^!/, '').replace(/^!file:/i, 'file:'));

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
            // --------------------------------------------------------------------
        } else if (activeSource === 'quick' && quickPrompt.trim()) {
            textToUse = isShift ? null : quickPrompt;
            filesToUse = isShift ? [] : quickPromptFiles;
            if (!isShift) addToHistory(quickPrompt);
        } else {
            textToUse = isShift ? null : (filteredPrompts[selectedIndex]?.content || "");
            filesToUse = [];
        }

        executePromptAction(textToUse, filesToUse, targetUrl, isNewChat);
    };

    const handleVariableChange = (key, val) => {
        const cleanKey = key.replace(/^!/, '').replace(/^!file:/i, 'file:');
        const newValues = { ...variableValues };
        
        const legacyKey = key !== cleanKey ? key : (key.startsWith('file:') ? key.replace('file:', '!file:') : `!${key}`);
        if (newValues[legacyKey] !== undefined) delete newValues[legacyKey];

        if (val === null || val === undefined) {
            delete newValues[cleanKey];
        } else {
            newValues[cleanKey] = val;
        }

        setVariableValues(newValues);
        saveSessionData(newValues, stepFiles, selectedPrompt?.id);

        // --- ZERO-REGRESSION LIVE SYNC BROADCAST ---
        if (liveSyncTimer.current) clearTimeout(liveSyncTimer.current);
        liveSyncTimer.current = setTimeout(() => {
            try {
                // FILTER: Remove File objects to prevent DataCloneError
                const textOnlyVars = {};
                Object.keys(newValues).forEach(k => {
                    if (!k.startsWith('file:') && !k.startsWith('!file:')) {
                        textOnlyVars[k] = newValues[k];
                    }
                });

                // UMGESCHALTET AUF 'local'
                chrome.storage.local.set({
                    lp_live_sync_ping: {
                        timestamp: Date.now(),
                        source: 'popup',
                        promptId: selectedPrompt?.id,
                        type: 'text',
                        values: textOnlyVars
                    }
                });
            } catch (e) { /* silent fail */ }
        }, 150);
    };

    const handleWheelScroll = (e) => {
        if (llmScrollRef.current) {
            llmScrollRef.current.scrollLeft += e.deltaY;
            updateScrollButtons();
        }
    };

    const scrollLlmBar = (direction) => {
        if (llmScrollRef.current) {
            // Scroll by less to prevent skipping icons (was 200)
            const amount = direction === 'left' ? -60 : 60;
            llmScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
            setTimeout(updateScrollButtons, 350);
        }
    };

    const handleQuickPromptFileSelect = (e) => {
        const files = Array.from(e.target.files);
        addQuickPromptFiles(files);
        e.target.value = '';
    };

    const addQuickPromptFiles = (incomingFiles) => {
        if (!incomingFiles || incomingFiles.length === 0) return;
        const accepted = filterOversizedFiles(incomingFiles, (f) => {
            showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
        });
        if (accepted.length === 0) return;
        const nextFiles = [...quickPromptFiles, ...accepted];
        setQuickPromptFiles(nextFiles);
        setActiveSource('quick');

        // PERSIST QUICK PROMPT FILES AS WELL (Uses special ID 'quick')
        saveSessionData({}, { 'quick': nextFiles }, 'quick');
    };

    const handlePaste = (e) => {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const files = Array.from(e.clipboardData.files);
            addQuickPromptFiles(files);
            showNotify(`Attached ${files.length} file(s) from clipboard`, 'success');
        }
    };

    const handleVariablePaste = (e, stepId) => {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const pastedFiles = Array.from(e.clipboardData.files);
            const accepted = filterOversizedFiles(pastedFiles, (f) => {
                showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
            });
            if (accepted.length === 0) return;
            const currentFiles = stepFiles[stepId] || [];
            const nextStepFiles = { ...stepFiles, [stepId]: [...currentFiles, ...accepted] };
            setStepFiles(nextStepFiles);
            saveSessionData(variableValues, nextStepFiles, selectedPrompt?.id);
            showNotify(`Attached ${accepted.length} file(s) from clipboard`, 'success');
        }
    };

    const removeQuickPromptFile = (index) => {
        const nextFiles = quickPromptFiles.filter((_, i) => i !== index);
        setQuickPromptFiles(nextFiles);
        saveSessionData({}, { 'quick': nextFiles }, 'quick');
    };

    const handleQuickPromptChange = (val) => {
        setQuickPrompt(val);
        setActiveSource('quick');
        chrome.storage.local.set({ lp_quick_prompt_draft: val });

        // Also save for Keep persistence
        if (keepValues) {
            saveSessionData({ quickText: val }, { 'quick': quickPromptFiles }, 'quick');
        }
    };

    // @PROTECTED_REGION START: handleSearchChange
    // CRITICAL: Maintains unified search logic for OmniBar (Merge Search & Quick Prompt)
    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearch(val);
        setQuickPrompt(val);
        setActiveSource(val ? 'quick' : 'list');

        // Logic for history and auto-expand (if target is the omnibar)
        if (val) setShowHistory(false);
        
        // === PROTECTED ADDITION: Sync empty state with storage ===
        if (!val) {
            chrome.storage.local.remove('lp_quick_prompt_draft');
        }
        // =========================================================
        
        if (e.target.tagName === 'TEXTAREA') {
            e.target.style.height = '46px';
            e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
        }
    };
    // @PROTECTED_REGION END: handleSearchChange

    const handleSaveQuickPrompt = async () => {
        if (!quickPrompt.trim()) return;
        const id = crypto.randomUUID();
        const newPrompt = {
            id,
            title: `Quick Note: ${quickPrompt.substring(0, 20)}...`,
            content: quickPrompt,
            tags: ["QuickPrompt"],
            updatedAt: new Date().toISOString(),
            chain: [{
                id: crypto.randomUUID(),
                title: "Draft",
                content: quickPrompt,
                notes: "",
                versions: [],
                isVisible: true
            }],
            versions: [],
            ignoredVariables: []
        };
        await store.savePrompt(newPrompt);

        // Reset UI nach dem Speichern (Zero-Regression DOM Reset)
        setSearch("");
        setQuickPrompt("");
        setQuickPromptFiles([]);
        setActiveDraftId(null);
        setActiveSource('list');
        chrome.storage.local.remove('lp_quick_prompt_draft');
        
        // 50ms Delay garantiert, dass React den DOM geleert hat, bevor die HÃ¶he berechnet wird
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.style.height = '46px';
            }
        }, 50);
        setStatus("success");
        showNotify("Saved to library!", "success");
        setTimeout(() => setStatus("idle"), 2000);
    };

    const handleSaveQuickSnippet = async () => {
        if (!quickPrompt.trim()) return;
        const id = crypto.randomUUID();
        // Generiere einen validen Snippet-Namen (keine Leerzeichen, kurz)
        const rawName = quickPrompt.substring(0, 15).trim();
        const cleanName = rawName.replace(/[^a-zA-Z0-9]/g, '_') || "Quick_Snippet";

        const newSnippet = {
            id,
            name: cleanName,
            content: quickPrompt,
            tags: ["Quick"],
            rating: 0,
            usageCount: 0,
            isPinned: false
        };

        await store.saveSnippet(newSnippet);

        // Reset UI nach dem Speichern (Zero-Regression DOM Reset)
        setSearch("");
        setQuickPrompt("");
        setQuickPromptFiles([]);
        setActiveDraftId(null);
        setActiveSource('list');
        chrome.storage.local.remove('lp_quick_prompt_draft');
        
        // 50ms Delay garantiert, dass React den DOM geleert hat, bevor die HÃ¶he berechnet wird
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.style.height = '46px';
            }
        }, 50);
        setStatus("success");
        showNotify("Saved to snippets!", "success");
        setTimeout(() => setStatus("idle"), 2000);
    };

    // DRAFTS LOGIC
    const handlePinDraft = async () => {
        if (!quickPrompt.trim()) return;

        // SERIALIZE FILES TO BASE64 FOR STORAGE (BUNDLING)
        let serializedFiles = [];
        if (quickPromptFiles.length > 0) {
            serializedFiles = await Promise.all(quickPromptFiles.map(f => new Promise((resolve) => {
                // GUARD: If it's already serialized (bundled), just keep it
                if (f.data && typeof f.data === 'string') {
                    resolve(f);
                    return;
                }

                // GUARD: If it's not a Blob/File, skip it to prevent crash
                if (!(f instanceof Blob)) {
                    console.warn("Skipping invalid file object during pin:", f);
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onload = () => resolve({
                    name: f.name,
                    type: f.type,
                    data: reader.result // Base64 string
                });
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(f);
            })));

            // Filter out nulls (failed reads or invalid objects)
            serializedFiles = serializedFiles.filter(Boolean);
        }

        const newDraft = { id: crypto.randomUUID(), text: quickPrompt, files: serializedFiles };
        const updatedDrafts = [newDraft, ...savedDrafts].slice(0, 5); // Max 5 Drafts
        setSavedDrafts(updatedDrafts);

        // Reset UI
        setQuickPrompt("");
        setSearch("");
        setQuickPromptFiles([]);
        setActiveDraftId(null); // Clear active state on new pin

        inputRef.current?.focus();
        chrome.storage.local.set({ lp_saved_drafts: updatedDrafts });
        chrome.storage.local.remove('lp_quick_prompt_draft');
        showNotify("Draft pinned!", "success");
    };

    const handleRestoreDraft = async (draft) => {
        setQuickPrompt(draft.text);
        setSearch(draft.text);

        // DESERIALIZE FILES BACK TO FILE OBJECTS
        if (draft.files && draft.files.length > 0) {
            try {
                // Check if already File objects (legacy) or Base64 (new)
                const restoredFiles = await Promise.all(draft.files.map(async (f) => {
                    if (f instanceof File) return f; // Legacy safety
                    if (f.data) {
                        const res = await fetch(f.data);
                        const blob = await res.blob();
                        return new File([blob], f.name, { type: f.type });
                    }
                    return null;
                }));
                setQuickPromptFiles(restoredFiles.filter(Boolean));
            } catch (e) {
                console.error("Failed to restore draft files", e);
                setQuickPromptFiles([]);
            }
        } else {
            // Handle legacy "files" array that might be empty or raw
            setQuickPromptFiles([]);
        }

        setActiveSource('quick');
        setActiveDraftId(draft.id); // Set the clicked draft as active

        // FIX: Force immediate height recalculation to prevent "jumping"
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.style.height = 'auto'; // Reset
                const newHeight = Math.min(inputRef.current.scrollHeight, 150);
                inputRef.current.style.height = `${newHeight}px`;
                inputRef.current.focus();
            }
        });
    };

    const handleRemoveDraft = (id) => {
        const updated = savedDrafts.filter(d => d.id !== id);
        setSavedDrafts(updated);
        chrome.storage.local.set({ lp_saved_drafts: updated });
    };

    const handleOpenDashboard = () => {
        let targetId = null;
        if (view === 'fill' && selectedPrompt) {
            targetId = selectedPrompt.id;
        }

        // ULTRA-ROBUST FOCUS LOGIC (Scan all tabs)
        chrome.tabs.query({}, (tabs) => {
            const runtimeUrl = chrome.runtime.getURL('');
            // Find any tab belonging to this extension (index.html or other, but NOT popup)
            const dashboardTab = tabs.find(t => t.url && t.url.startsWith(runtimeUrl) && !t.url.includes('popup.html'));

            if (dashboardTab) {
                chrome.tabs.update(dashboardTab.id, { active: true });
                chrome.windows.update(dashboardTab.windowId, { focused: true });

                // TRIGGER NAVIGATION VIA STORAGE (More Robust)
                chrome.storage.local.set({
                    lp_navigation_signal: {
                        targetId,
                        targetStepId: selectedStepId, // Pass step ID for precise selection
                        timestamp: Date.now()
                    }
                });

            } else {
                const stepParam = selectedStepId ? `&stepId=${selectedStepId}` : '';
                const url = chrome.runtime.getURL(`index.html${targetId ? `?promptId=${targetId}${stepParam}` : ''}`);
                chrome.tabs.create({ url });
            }
        });
    };

    const handleLogoClick = () => {
        if (view !== 'list') {
            setView('list');
        } else if (search.trim() !== '') {
            setSearch("");
            setQuickPrompt("");
            setQuickPromptFiles([]);
            inputRef.current?.focus();
        } else {
            handleOpenDashboard();
        }
    };

    const startEditing = (e, prompt, stepId = null) => {
        e.stopPropagation();
        setEditingId(prompt.id);
        setEditingStepId(stepId);
        setEditTitle(prompt.title || "");

        // Content logic: if stepId is provided, use that step's content
        if (stepId && prompt.chain) {
            const step = prompt.chain.find(s => s.id === stepId);
            setEditContent(step?.content || "");
        } else {
            setEditContent(prompt.content || "");
        }
    };

    const cancelEditing = (e) => {
        e.stopPropagation();
        setEditingId(null);
        setEditingStepId(null);
    };

    const saveEdit = async (e, prompt) => {
        e.stopPropagation();
        const updatedLabel = editingStepId ? "Template updated!" : "Changes saved!";

        let updated = {
            ...prompt,
            updatedAt: new Date().toISOString()
        };

        if (editingStepId) {
            // Update specific step in the chain
            const newChain = prompt.chain.map(s =>
                s.id === editingStepId ? { ...s, content: editContent } : s
            );
            updated.chain = newChain;

            // If it's the first step, also update the global prompt content for list preview
            if (newChain[0].id === editingStepId) {
                updated.content = editContent;
            }
        } else {
            // Global edit (List View)
            updated.title = editTitle;
            updated.content = editContent;

            // Update first step for consistency
            if (updated.chain && updated.chain.length > 0) {
                const newChain = [...updated.chain];
                newChain[0] = { ...newChain[0], content: editContent };
                updated.chain = newChain;
            }
        }

        await store.savePrompt(updated);
        setEditingId(null);
        setEditingStepId(null);
        showNotify(updatedLabel, "success");

        // If we are in fill view, update the selectedPrompt state to reflect changes immediately
        if (view === 'fill' && selectedPrompt?.id === updated.id) {
            setSelectedPrompt(updated);
        }
    };




    // Logic: Zuordnung Variablen zu Steps (Lazy Grouping)
    const stepsWithVariables = useMemo(() => {
        if (!selectedPrompt) return [];
        let seenVars = new Set();
        const ignored = selectedPrompt.ignoredVariables || [];

        return selectedPrompt.chain.map((step) => {
            const rootVars = parseVariables(step.content);
            const withSnippets = resolveSnippets(step.content, snippets);
            const allVars = parseVariables(withSnippets);

            const relevantForThisStep = allVars
                .filter(v => !ignored.includes(v) && !seenVars.has(v))
                .map(v => {
                    seenVars.add(v);
                    return {
                        name: v,
                        isFromSnippet: !rootVars.includes(v)
                    };
                });

            return {
                ...step,
                relevantVars: relevantForThisStep,
                compiled: compilePrompt(withSnippets, variableValues, ignored)
            };
        });
    }, [selectedPrompt, snippets, variableValues]);

    const handleKeyDown = (e) => {
        // QUICK-EDIT KEYBOARD SHORTCUTS
        if (editingId) {
            if (e.key === 'Escape') {
                e.preventDefault();
                setEditingId(null);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                const prompt = (view === 'fill' && selectedPrompt?.id === editingId)
                    ? selectedPrompt
                    : filteredPrompts.find(p => p.id === editingId);
                if (prompt) saveEdit(e, prompt);
                return;
            }
        }

        // FIX: Allow default behavior in Inputs/Textareas (e.g. Enter for new line)
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            // Hotkeys while typing
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleOpenDashboard();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                return;
            }

            // Exception: Allow Arrow navigation from Search Input
            if (e.target.tagName === 'INPUT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                // Pass through to navigation logic
            } else {
                return;
            }
        }

        // Global Hotkeys
        if ((e.ctrlKey || e.metaKey)) {
            if (e.key === 'd') {
                e.preventDefault();
                handleOpenDashboard();
            }
            if (e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        }

        if (view === 'list') {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
                setSelectedIndex(nextIdx);
                document.getElementById(`item-${nextIdx}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const nextIdx = Math.max(selectedIndex - 1, 0);
                setSelectedIndex(nextIdx);
                document.getElementById(`item-${nextIdx}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredPrompts[selectedIndex]) handleSelectPrompt(filteredPrompts[selectedIndex]);
            }
        } else if (view === 'fill') {
            if (e.key === 'Escape') { setView('list'); }
        }
    };

    // --- RENDER ---
    const handleOpenSettings = () => {
        // Delegate to background script to handle focus/open logic
        chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD', view: 'settings' }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    };

    return (
        <>
            {/* @PROTECTED_REGION START: Popup UI Architecture */}
            {/* CRITICAL: Defines the Canvas-on-Card elevation (Zinc Canvas / Zinc-900 Elevation) 
                - Canvas: Zinc 50/50 (Light) / #09090b (Dark)
                - Modal/Card: White (Light) / #131316 (Dark)
            */}
            <div
                className="fixed inset-0 h-screen w-screen flex justify-center bg-zinc-50/50 dark:bg-[#09090b] overflow-hidden font-sans selection:bg-primary/30"
                onKeyDown={handleKeyDown}
            >
                <div className="w-full max-w-[450px] flex flex-col h-full relative bg-white dark:bg-[#09090b] !important shadow-2xl dm-modal">
                    {/* @PROTECTED_REGION END: Popup UI Architecture */}

                {/* === HEADER === */}
                <div className={`shrink-0 h-16 px-5 flex items-center justify-between bg-bg-surface z-20 select-none transition-colors duration-200`}>
                    <div id="popup-status-chip" onClick={handleLogoClick} className="flex items-center gap-2 cursor-pointer group">
                        {/* Interactive Connection Dot Engine */}
                        <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform relative`}
                            onMouseEnter={() => {
                                if (injectionTarget && !isSelecting) {
                                    getActiveTab().then((tabs) => {
                                        if (tabs[0]) {
                                            chrome.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_TARGET" }, () => {
                                                if (chrome.runtime.lastError) { /* ignore */ }
                                            });
                                        }
                                    });
                                }
                            }}
                            onMouseLeave={() => {
                                if (injectionTarget && !isSelecting) {
                                    getActiveTab().then((tabs) => {
                                        if (tabs[0]) {
                                            chrome.tabs.sendMessage(tabs[0].id, { action: "REMOVE_HIGHLIGHT" }, () => {
                                                if (chrome.runtime.lastError) { /* ignore */ }
                                            });
                                        }
                                    });
                                }
                            }}
                        >
                            <img src="/icon48.png" alt="Logo" className="w-full h-full object-contain" />

                            <div
                                onClick={handleConnect}
                                className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-125 transition-all border border-white dark:border-zinc-950 shadow-sm z-10 ${isSelecting || isConnecting ? 'bg-orange-500 animate-ping' :
                                    injectionTarget ? 'bg-emerald-500 hover:bg-emerald-400' :
                                        'bg-zinc-400 hover:bg-zinc-500' // Grey for disconnected
                                    }`}
                                title={isSelecting ? "Click to Cancel Selection Mode" :
                                    isConnecting ? "Scanning page..." :
                                        injectionTarget ? `Connected to ${injectionTarget}. Click to change manually.` :
                                            "Click to connect automatically or manually"}
                            />
                        </div>
                        <div className="flex flex-col justify-center gap-0.5">
                            <span className="text-[15px] font-bold dark:text-white text-zinc-900 tracking-tight leading-none">LeanPrompts</span>
                            {view === 'list' ? (
                                injectionTarget ? (
                                    <span className="text-[10px] font-semibold text-emerald-500 animate-fade-in">
                                        Connected to {injectionTarget}
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-medium text-text-faint leading-none">
                                        Library
                                    </span>
                                )
                            ) : (
                                <span className="text-[10px] font-semibold text-indigo-600 dark:text-purple-400 animate-fade-in flex items-center gap-1">
                                    <ArrowLeft size={10} /> Back to Library
                                </span>
                            )}
                        </div>
                    </div>

                    {view === 'list' ? (
                        <>
                            <div className="flex items-center gap-1">
                                {/* Theme Toggle */}
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 rounded-lg dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-indigo-600 dark:hover:text-purple-400 transition-all"
                                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                                >
                                    {isDarkMode ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
                                </button>

                                <button
                                    id="popup-dash-btn"
                                    onClick={handleOpenDashboard}
                                    className="p-2 rounded-lg dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-indigo-600 dark:hover:text-purple-400 transition-all"
                                    title="Open Dashboard"
                                >
                                    <LayoutGrid size={18} strokeWidth={2} />
                                </button>

                                <button
                                    id="popup-split-btn"
                                    onClick={handleSplitScreen}
                                    className={`p-2 rounded-lg transition-all ${
                                        isSplitScreen 
                                        ? 'bg-primary/10 text-primary dark:text-primary dark:bg-primary/20 hover:bg-primary/20' 
                                        : 'dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-indigo-600 dark:hover:text-purple-400'
                                    }`}
                                    title={isSplitScreen ? "Exit Split Screen & Maximize Browser" : "Tip: \"Use Split Screen to keep LeanPrompts always visible next to your Chat\""}
                                >
                                    {isSplitScreen ? <Maximize size={18} strokeWidth={2} /> : <PanelRight size={18} strokeWidth={2} />}
                                </button>
                                <button
                                    onClick={handleOpenSettings}
                                    className="p-2 rounded-lg dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-primary transition-all relative"
                                    title={backupStatus.show ? backupStatus.message : "Settings"}
                                >
                                    <Settings size={18} strokeWidth={2} />
                                    {backupStatus.show && (
                                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-zinc-900 shadow-sm" />
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex-1 flex justify-center overflow-hidden px-4">
                                <div className="font-semibold text-[14px] dark:text-zinc-100 text-zinc-800 truncate">
                                    {selectedPrompt?.title}
                                </div>
                            </div>

                            <button
                                onClick={handleOpenDashboard}
                                className="p-2 rounded-lg dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-indigo-600 transition-all"
                                title="Edit Prompt in Dashboard"
                            >
                                <LayoutGrid size={18} strokeWidth={2} />
                            </button>

                            {/* FRESH REBUILT INFO BUTTON */}
                            <button
                                onClick={() => setShowInfo(!showInfo)}
                                className={`p-2 rounded-lg transition-all ${showInfo
                                    ? 'bg-indigo-600 dark:bg-purple-600 text-white shadow-md'
                                    : 'dark:text-zinc-400 text-text-muted dark:hover:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:text-zinc-100 hover:text-indigo-600 dark:hover:text-purple-400'
                                    }`}
                                title="Quick Guide"
                            >
                                <Info size={18} strokeWidth={2.5} />
                            </button>
                        </>
                    )}
                </div>

                {/* === FIXED SEARCH AREA (Integrated Header) === */}
                <div className="px-4 pb-2 pt-2 border-b border-border bg-bg-surface/90 dark:bg-zinc-900/30 backdrop-blur-md transition-colors duration-200 z-10 relative">
                    {view === 'fill' ? (
                        <SearchInput
                            id="popup-search-input"
                            ref={inputRef}
                            autoFocus
                            value={search}
                            onChange={handleSearchChange}
                            onClear={() => {
                                setSearch("");
                                setQuickPrompt("");
                                setQuickPromptFiles([]);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search library or type a prompt..."
                            className="!bg-zinc-100/80 dark:!bg-black/40 !border-zinc-200/80 dark:!border-white/10 hover:!border-zinc-300 dark:hover:!border-white/20 px-4 pl-11 py-2.5 text-[13px] font-medium focus:!border-primary/50 dark:focus:!border-primary/50 focus:!ring-1 focus:!ring-primary/20 shadow-inner transition-all"
                        />
                    ) : (
                        <div className="relative group/search z-50">
                            <Search className={`absolute left-3.5 top-3.5 text-text-faint transition-colors pointer-events-none ${search ? 'opacity-40' : ''}`} size={16} />

                            <textarea
                                id="popup-search-input"
                                ref={(el) => {
                                    inputRef.current = el;
                                    if (el) enableDragSelectScroll(el);
                                }}
                                autoFocus
                                className="w-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-800/50 rounded-xl py-3 pl-10 pr-28 text-[13px] text-text-main placeholder-text-faint focus:outline-none focus:ring-0 focus:border-indigo-400 dark:focus:border-purple-500/40 transition-colors duration-200 font-medium shadow-inner resize-none overflow-y-auto custom-scrollbar"
                                placeholder="Search library or type a prompt..."
                                value={search}
                                onChange={handleSearchChange}
                                onFocus={(e) => {
                                    setActiveSource('quick');
                                    // === FIX: Höhe auf 46px zurücksetzen, um die echte scrollHeight zu ermitteln ===
                                    e.target.style.height = '46px';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; // Max 150px damit das Popup nicht platzt
                                }}
                                onClick={() => {
                                    if (!search) setShowHistory(true);
                                }}
                                onBlur={(e) => {
                                    setTimeout(() => setShowHistory(false), 200);
                                    if (!search) e.target.style.height = '46px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                        if (filteredPrompts.length > 0) {
                                            e.preventDefault();
                                            setSelectedIndex(0);
                                            document.getElementById(`item-0`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                        }
                                    }
                                }}
                                style={{ minHeight: '46px', height: '46px' }}
                            />

                            {/* HISTORY DROPDOWN */}
                            <AnimatePresence>
                                {showHistory && !search && recentPrompts.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                        exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                                        className="mt-2 rounded-xl border border-border/60 overflow-hidden bg-bg-secondary/90 backdrop-blur-xl ring-1 ring-black/5"
                                    >
                                        <div className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border/60 flex items-center justify-between">
                                            <span>Recent History</span>
                                            <span className="text-[9px] opacity-60">Last 5</span>
                                        </div>
                                        {recentPrompts.map((item, idx) => (
                                            <div
                                                key={idx}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setSearch(item);
                                                    setQuickPrompt(item);
                                                    setActiveSource('quick');
                                                    setShowHistory(false);
                                                    inputRef.current?.focus();
                                                }}
                                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover cursor-pointer group transition-colors"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-bg-elevated/50 flex items-center justify-center text-zinc-400 group-hover:text-primary shrink-0">
                                                    <Clock size={13} />
                                                </div>
                                                <span className="text-sm text-text-muted truncate font-medium group-hover:text-text-main flex-1">
                                                    {item}
                                                </span>
                                                <button
                                                    onMouseDown={(e) => removeFromHistory(e, idx)}
                                                    className="p-1 px-1.5 rounded-md hover:bg-red-500/10 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ACTION BUTTONS GROUP */}
                            <div className="absolute right-2 top-2 flex items-center gap-1">
                                {!search && recentPrompts.length > 0 && (
                                    <button
                                        onClick={() => setShowHistory(!showHistory)}
                                        className={`p-1.5 rounded-lg transition-all ${showHistory ? 'text-primary bg-primary-subtle/50' : 'text-text-faint hover:text-text-main'}`}
                                    >
                                        <ChevronDown size={15} className={`transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                                {search && (
                                    <>
                                        <button
                                            onClick={() => { 
                                                // 1. React States synchron updaten
                                                setSearch(""); 
                                                setQuickPrompt(""); 
                                                setQuickPromptFiles([]); 
                                                setActiveDraftId(null); 
                                                
                                                // === PROTECTED ADDITION: Text auch aus der Datenbank löschen! ===
                                                chrome.storage.local.remove('lp_quick_prompt_draft');
                                                // ================================================================

                                                // 2. DOM-Manipulation verschieben
                                                setTimeout(() => {
                                                    if (inputRef.current) {
                                                        inputRef.current.style.height = '46px';
                                                        inputRef.current.focus();
                                                    }
                                                }, 0);
                                            }}
                                            className="p-1.5 rounded-lg transition-all text-text-muted hover:text-red-400 hover:bg-red-500/10"
                                            title="Clear draft"
                                        >
                                            <X size={15} />
                                        </button>
                                        <button onClick={handlePinDraft} className="p-1.5 rounded-lg transition-all text-text-muted hover:text-amber-400 hover:bg-amber-500/10" title="Save as Pinned Draft">
                                            <Pin size={15} />
                                        </button>
                                        <button onClick={() => fileInputRef.current?.click()} className={`p-1.5 rounded-lg transition-all ${quickPromptFiles.length > 0 ? 'bg-primary-subtle text-primary' : 'text-text-muted hover:text-zinc-300'}`} title="Attach files to draft">
                                            {quickPromptFiles.length > 0 ? <div className="w-5 h-5 font-bold text-[10px] flex items-center justify-center">{quickPromptFiles.length}</div> : <Plus size={16} strokeWidth={2.5} />}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* === MAIN CONTENT === */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-3 pb-[50vh] bg-zinc-50/50 dark:bg-[#09090b] relative" ref={listRef} style={{ overflowAnchor: 'none' }}>

                    {view === 'fill' && selectedPrompt ? (
                        <>
                            {/* ONBOARDING BOX - MOVED OUTSIDE OF space-y-6 TO PREVENT LAYOUT SHIFT */}
                            {/* COMPACT & CONSISTENT SMART FILL GUIDE (REVERTED TO UNDERSTATED SCALE) */}
                            {showInfo && (
                                <div className="fixed top-20 left-4 right-4 z-[200] animate-slide-up">
                                    <div className="bg-zinc-50 dark:bg-zinc-800 border border-border/50 shadow-2xl rounded-xl p-5 relative overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
                                        {/* Subtle Background Gradient for Depth */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                                        <button
                                            onClick={() => setShowInfo(false)}
                                            className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-zinc-600 dark:text-text-muted dark:hover:text-zinc-300 transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                                        >
                                            <X size={14} />
                                        </button>

                                        <div className="flex items-center gap-2 mb-5">
                                            <div className="bg-indigo-50 dark:bg-purple-500/10 p-1.5 rounded-md text-indigo-600 dark:text-purple-400 ring-1 ring-indigo-200 dark:ring-purple-500/20">
                                                <Sparkles size={14} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-sm text-text-main tracking-tight leading-none">Workflow Guide</h4>
                                                <span className="text-[10px] font-medium text-text-muted">How to use Smart Fill</span>
                                            </div>
                                        </div>

                                        {/* Timeline Layout */}
                                        <div className="relative pl-2 space-y-5">
                                            {/* Vertical Connector Line */}
                                            <div className="absolute left-[19px] top-2 bottom-4 w-[1.5px] bg-border/60 dark:bg-zinc-700/50" />

                                            {/* Step 1 */}
                                            <div className="relative flex gap-4 items-start">
                                                <div className="relative z-10 w-8 h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-faint shadow-sm shrink-0">
                                                    <Pencil size={13} strokeWidth={2.5} />
                                                </div>
                                                <div className="pt-0.5">
                                                    <h5 className="text-xs font-bold text-text-main">Variables</h5>
                                                    <p className="text-[11px] text-text-muted leading-tight mt-0.5">Complete the highlighted fields in the form.</p>
                                                </div>
                                            </div>

                                            {/* Step 2 */}
                                            <div className="relative flex gap-4 items-start">
                                                <div className="relative z-10 w-8 h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-faint shadow-sm shrink-0">
                                                    <Eye size={13} strokeWidth={2.5} />
                                                </div>
                                                <div className="pt-0.5">
                                                    <h5 className="text-xs font-bold text-text-main">Preview</h5>
                                                    <p className="text-[11px] text-text-muted leading-tight mt-0.5">See the final prompt update in real-time.</p>
                                                </div>
                                            </div>

                                            {/* Step 3 */}
                                            <div className="relative flex gap-4 items-start">
                                                <div className="relative z-10 w-8 h-8 rounded-full bg-bg-elevated border border-indigo-200 dark:border-purple-500/30 flex items-center justify-center text-indigo-600 dark:text-purple-400 shadow-sm shadow-indigo-500/10 dark:shadow-purple-500/10 shrink-0">
                                                    <Wand2 size={13} strokeWidth={2.5} />
                                                </div>
                                                <div className="pt-0.5">
                                                    <h5 className="text-xs font-bold text-indigo-600 dark:text-purple-400">Inject</h5>
                                                    <p className="text-[11px] text-text-muted leading-tight mt-0.5">Launch efficiently into your favorite AI.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}


                            <div className="flex items-center justify-between pb-3 pt-1 border-b border-border">
                                {/* STEP INDICATOR - HEADER FOR THE INJECTION SECTION */}
                                <div className="text-xs font-bold text-text-muted flex items-center gap-2.5">
                                    <span className="bg-bg-elevated border border-border px-2 py-1 rounded-md text-text-main shadow-sm transition-all">
                                        Step {Math.max(1, stepsWithVariables.findIndex(s => s.id === selectedStepId) + 1)}/{stepsWithVariables.length}
                                    </span>
                                    <span className="opacity-80">Configure Variables</span>
                                </div>
                                {(Object.keys(variableValues).some(k => variableValues[k]) || Object.keys(stepFiles).some(k => stepFiles[k]?.length > 0)) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setVariableValues({});
                                            setStepFiles({});
                                            saveSessionData({}, {}, selectedPrompt?.id);
                                        }}
                                        className="text-text-muted hover:text-red-400 p-1 transition-colors"
                                        title="Clear all inputs and files"
                                    >
                                        <Eraser size={14} />
                                    </button>
                                )}
                            </div>

                            {/* STEPS LIST with Variables and Attachments per Step */}
                            <div className="space-y-3">
                                {stepsWithVariables.map((step, idx) => {
                                    const isActive = selectedStepId === step.id;
                                    const isScrollable = scrollEnabledStepId === step.id;
                                    return (
                                        <div
                                            key={step.id}
                                            id={`step-${step.id}`}
                                            onClick={() => {
                                                setSelectedStepId(step.id);
                                                if (scrollEnabledStepId !== step.id) setScrollEnabledStepId(null);
                                            }}
                                            className={`transition-all duration-300 group border ${isActive
                                                ? 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-white/10 shadow-xl ring-1 ring-black/5 dark:ring-white/5 p-5 -mx-2 relative z-10 rounded-2xl' 
                                                : 'bg-white/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800/60 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-md p-4 cursor-pointer shadow-sm rounded-xl' 
                                                }`}
                                        >
                                            {/* STEP HEADER */}
                                            <div className={`flex items-center gap-3 ${isActive ? 'mb-4' : 'select-none m-0'}`}>
                                                <div className={`h-6 px-2.5 rounded text-[11px] font-bold flex items-center justify-center border whitespace-nowrap shrink-0 transition-colors ${isActive 
                                                    ? 'bg-indigo-50 dark:bg-purple-500/10 text-indigo-600 dark:text-purple-400 border-indigo-200 dark:border-purple-500/20' 
                                                    : 'bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-black/5 dark:border-white/5 group-hover:border-black/10 dark:group-hover:border-white/10 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                                                    }`}>
                                                    STEP {idx + 1}
                                                </div>
                                                <span className={`text-sm font-semibold truncate transition-colors ${isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'}`}>
                                                    {step.title || 'Untitled Step'}
                                                </span>
                                            </div>

                                            {/* COLLAPSIBLE BODY (Zero-Regression Accordion) */}
                                            <AnimatePresence initial={false}>
                                                {isActive && (
                                                    <motion.div
                                                        key="step-body"
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
                                                        exit={{ height: 0, opacity: 0, transition: { duration: 0 } }}
                                                        className="overflow-hidden"
                                                    >
                                                        {/* Variables per Step */}
                                                        {step.relevantVars.length > 0 && (
                                                            <div className="space-y-5 mb-6 pl-1 pt-1">
                                                                {step.relevantVars.map(v => {
                                                                    const isRequired = v.name.startsWith('!');
                                                                    const isFileVar = v.name.toLowerCase().startsWith('file:') || v.name.toLowerCase().startsWith('!file:');
                                                                    let displayName = v.name;
                                                                    if (v.name.toLowerCase().startsWith('!file:')) displayName = v.name.substring(6).trim();
                                                                    else if (v.name.toLowerCase().startsWith('file:')) displayName = v.name.substring(5).trim();
                                                                    else if (isRequired) displayName = v.name.substring(1).trim();
                                                                    
                                                                    const cleanKey = v.name.replace(/^!/, '').replace(/^!file:/i, 'file:');
                                                                    const userVal = variableValues[cleanKey] !== undefined ? variableValues[cleanKey] : variableValues[v.name];
                                                                    const varFiles = isFileVar ? (userVal || []) : [];
                                                                    const isIgnored = selectedPrompt?.ignoredVariables?.includes(v.name);

                                                                    // --- DEEP PARSING FOR DROPDOWNS & DEFAULT VALUES ---
                                                                    let rawDefault = "";
                                                                    const stepContentResolved = resolveSnippets(step.content || "", snippets);
                                                                    if (!isFileVar && stepContentResolved) {
                                                                        try {
                                                                            const escapedVarName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                                            const regex = new RegExp(`\\{\\{\\s*${escapedVarName}\\s*:(.*?)\\}\\}`, 'i');
                                                                            const match = stepContentResolved.match(regex);
                                                                            if (match && match[1] && match[1].trim()) {
                                                                                rawDefault = match[1].trim();
                                                                            }
                                                                        } catch (e) { }
                                                                    }

                                                                    const dropdownOptions = rawDefault.includes('|') 
                                                                        ? rawDefault.split('|').map(s => s.trim()).filter(Boolean) 
                                                                        : [];
                                                                    const isDropdown = dropdownOptions.length > 1;
                                                                    const defaultVal = isDropdown ? dropdownOptions[0] : "";
                                                                    // ----------------------------------------------------

                                                                    const isHighlighted = highlightState.names.includes(v.name);
                                                                    const themeClass = highlightState.theme === 'amber'
                                                                        ? 'border-amber-400 ring-2 ring-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                                                                        : 'border-primary ring-2 ring-primary bg-primary-subtle shadow-lg shadow-primary/10';

                                                                    return (
                                                                        <div key={v.name} id={`var-field-${cleanKey}`} className="space-y-2 group/var transition-all">
                                                                            <div className="flex items-center justify-between px-0.5">
                                                                                <label className={`text-[10px] font-bold uppercase tracking-wider select-none flex items-center gap-2 transition-colors ${userVal ? 'text-green-500' : 'text-text-muted group-hover/var:text-text-main'}`}>
                                                                                    {displayName}
                                                                                    {isRequired && <span className="text-red-500 shrink-0" title="Required">*</span>}
                                                                                    {isFileVar && (
                                                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-500 dark:bg-blue-400/10 dark:text-blue-400 text-[8px] rounded-full border border-blue-500/20 font-bold shrink-0">
                                                                                            FILE
                                                                                        </span>
                                                                                    )}
                                                                                    {v.isFromSnippet && (
                                                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] rounded-full border border-amber-500/20 font-bold shrink-0">
                                                                                            SNIPPET
                                                                                        </span>
                                                                                    )}
                                                                                </label>
                                                                            </div>

                                                                            {isFileVar ? (
                                                                                <div className="space-y-2">
                                                                                    {Array.isArray(varFiles) && varFiles.length > 0 && (
                                                                                        <div className="space-y-1">
                                                                                            {varFiles.map((file, idx) => (
                                                                                                <div key={idx} className="flex items-center justify-between p-1.5 bg-bg-elevated rounded border border-border text-xs text-text-main">
                                                                                                    <div className="flex items-center gap-2 truncate">
                                                                                                        <FileIcon size={12} className="text-primary shrink-0" />
                                                                                                        <span className="truncate">{file.name}</span>
                                                                                                    </div>
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const next = varFiles.filter((_, i) => i !== idx);
                                                                                                            handleVariableChange(v.name, next.length > 0 ? next : null);
                                                                                                        }}
                                                                                                        className="text-text-muted hover:text-red-400 p-1"
                                                                                                    >
                                                                                                        <X size={12} />
                                                                                                    </button>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}

                                                                                    <div
                                                                                        data-droppable="true"
                                                                                        className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all duration-200 ${
                                                                                            isHighlighted ? themeClass : draggingVars[v.name]
                                                                                                ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/5'
                                                                                                : 'border-border hover:bg-bg-elevated hover:border-primary/50'
                                                                                        }`}
                                                                                        onDragOver={e => e.preventDefault()}
                                                                                        onDragEnter={e => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            setDraggingVars(prev => ({ ...prev, [v.name]: true }));
                                                                                        }}
                                                                                        onDragLeave={e => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            if (e.currentTarget.contains(e.relatedTarget)) return;
                                                                                            setDraggingVars(prev => ({ ...prev, [v.name]: false }));
                                                                                        }}
                                                                                        onDrop={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            setDraggingVars(prev => ({ ...prev, [v.name]: false }));
                                                                                            const droppedFiles = Array.from(e.dataTransfer.files);
                                                                                            const accepted = filterOversizedFiles(droppedFiles, (f) => {
                                                                                                showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                                                                            });
                                                                                            if (accepted.length > 0) {
                                                                                                const existing = Array.isArray(varFiles) ? varFiles : [];
                                                                                                handleVariableChange(v.name, [...existing, ...accepted]);
                                                                                            }
                                                                                        }}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const input = document.createElement('input');
                                                                                            input.type = 'file';
                                                                                            input.multiple = true;
                                                                                            input.onchange = (ev) => {
                                                                                                const selected = Array.from(ev.target.files);
                                                                                                const accepted = filterOversizedFiles(selected, (f) => {
                                                                                                    showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                                                                                });
                                                                                                if (accepted.length > 0) {
                                                                                                    const existing = Array.isArray(varFiles) ? varFiles : [];
                                                                                                    handleVariableChange(v.name, [...existing, ...accepted]);
                                                                                                }
                                                                                            };
                                                                                            input.click();
                                                                                        }}
                                                                                    >
                                                                                        <div className={`text-[10px] uppercase tracking-wider font-bold pointer-events-none transition-colors ${draggingVars[v.name] ? 'text-primary' : 'text-text-muted'}`}>
                                                                                            {draggingVars[v.name] ? "Drop files now!" : `+ Add files for "${displayName}"`}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ) : isDropdown ? (
                                                                                // --- ENUM SELECTION RENDERER (Dashboard Parity) ---
                                                                                <div className="relative">
                                                                                    <button
                                                                                        disabled={isIgnored}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            if (!isIgnored) setOpenDropdown(openDropdown === v.name ? null : v.name);
                                                                                        }}
                                                                                        className={`w-full bg-bg-elevated border rounded-lg pl-3 pr-8 py-2 text-xs text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm font-sans flex items-center justify-between group/dropdown hover:border-primary/50 text-left ${
                                                                                            isHighlighted ? themeClass : 'border-border'
                                                                                        } ${
                                                                                            isIgnored ? 'bg-bg cursor-not-allowed border-dashed opacity-50' : ''
                                                                                        }`}
                                                                                    >
                                                                                        <span className="truncate">{userVal || defaultVal}</span>
                                                                                        <ChevronDown size={14} className={`text-text-muted group-hover/dropdown:text-primary transition-all duration-200 absolute right-3 top-1/2 -translate-y-1/2 ${openDropdown === v.name ? 'rotate-180 text-primary' : ''}`} />
                                                                                    </button>

                                                                                    {openDropdown === v.name && (
                                                                                        <>
                                                                                            <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}></div>
                                                                                            <div className="absolute left-0 right-0 top-full mt-1.5 bg-bg-surface border border-border rounded-xl shadow-2xl z-[70] p-1.5 animate-in fade-in slide-in-from-top-2 duration-150 dm-dropdown">
                                                                                                <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                                                                                    {dropdownOptions.map((opt, i) => {
                                                                                                        const isSelected = (userVal || defaultVal) === opt;
                                                                                                        return (
                                                                                                            <button
                                                                                                                key={i}
                                                                                                                onClick={(e) => {
                                                                                                                    e.stopPropagation();
                                                                                                                    handleVariableChange(v.name, opt);
                                                                                                                    setOpenDropdown(null);
                                                                                                                }}
                                                                                                                className={`w-full flex items-start justify-between px-3 py-2 rounded-lg text-xs transition-all text-left ${
                                                                                                                    isSelected
                                                                                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                                                                                        : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                                                                }`}
                                                                                                            >
                                                                                                                <span className="line-clamp-2 leading-relaxed pr-2">{opt}</span>
                                                                                                                {isSelected && <Check size={12} className="ml-auto shrink-0 mt-0.5" />}
                                                                                                            </button>
                                                                                                        );
                                                                                                    })}
                                                                                                </div>
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <textarea
                                                                                    ref={(el) => {
                                                                                        if (el) enableDragSelectScroll(el);
                                                                                    }}
                                                                                    disabled={isIgnored}
                                                                                    placeholder={isRequired ? "Required..." : (rawDefault ? `Default: ${rawDefault}` : "Value...")}
                                                                                    className={`w-full bg-bg-elevated border rounded-lg px-3 py-2 text-xs text-text-main placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-y min-h-[60px] font-sans leading-relaxed shadow-sm ${
                                                                                        isHighlighted ? themeClass : 'border-border'
                                                                                    } ${
                                                                                        isIgnored ? 'bg-bg cursor-not-allowed border-dashed opacity-50' : ''
                                                                                    }`}
                                                                                    value={isIgnored ? "" : (userVal || '')}
                                                                                    onChange={e => handleVariableChange(v.name, e.target.value)}
                                                                                    onFocus={() => setSelectedStepId(step.id)}
                                                                                    onPaste={(e) => handleVariablePaste(e, step.id)}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                         {/* Live Preview & Attachments Action */}
                                                         <div className="space-y-2 relative group/preview">
                                                             {/* 1. Header-Zeile (Sauber separiert und dynamisch) */}
                                                             <div className="flex items-center justify-between pl-1">
                                                                 <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">
                                                                     {stepFiles[step.id] && stepFiles[step.id].length > 0 
                                                                         ? "Attachments & Preview" 
                                                                         : "Live Preview"}
                                                                 </div>

                                                                 <div className="flex items-center gap-1">
                                                                     {/* CONTEXTUAL EDIT ACTIONS */}
                                                                     {isActive && (
                                                                         <div className="flex items-center gap-1 animate-fade-in mr-2 pr-2 border-r border-border">
                                                                             {editingStepId === step.id ? (
                                                                                 <>
                                                                                     <button onClick={(e) => cancelEditing(e)} className="p-1 rounded hover:bg-red-500/10 text-red-400" title="Cancel"><X size={14} /></button>
                                                                                     <button onClick={(e) => saveEdit(e, selectedPrompt)} className="p-1 rounded hover:bg-emerald-500/10 text-emerald-400" title="Save Template (Ctrl+Enter)"><Save size={14} /></button>
                                                                                 </>
                                                                             ) : (
                                                                                 <button onClick={(e) => startEditing(e, selectedPrompt, step.id)} className="p-1.5 rounded-lg hover:bg-indigo-500/10 dark:hover:bg-purple-500/10 text-indigo-600 dark:text-purple-400 opacity-60 hover:opacity-100 transition-all" title="Edit Step Template"><Pencil size={14} strokeWidth={2.5} /></button>
                                                                             )}
                                                                         </div>
                                                                     )}

                                                                     {/* ATTACHMENT PLUS BUTTON */}
                                                                     <button
                                                                         onClick={(e) => {
                                                                             e.stopPropagation();
                                                                             setSelectedStepId(step.id);
                                                                             fileInputRef.current?.click();
                                                                         }}
                                                                         className="text-text-faint hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded transition-colors"
                                                                         title="Attach files to this step"
                                                                     >
                                                                         <Plus size={14} strokeWidth={3} />
                                                                     </button>
                                                                 </div>
                                                             </div>

                                                             {/* 2. Vertikal gestapelte Dateiliste (Exakte Design-Parität mit dem Inspector) */}
                                                             {stepFiles[step.id] && stepFiles[step.id].length > 0 && (
                                                                 <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-1 mb-2">
                                                                     {stepFiles[step.id].map((file, fIdx) => (
                                                                         <div key={fIdx} className={`flex items-center justify-between p-1.5 bg-bg-elevated rounded border text-xs text-text-main animate-fade-in ${file.isGhost ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
                                                                             <div className="flex items-center gap-2 truncate" title={file.name}>
                                                                                 <div className={file.isGhost ? 'text-amber-500' : 'text-primary'}>
                                                                                     <FileIcon size={12} className="shrink-0" />
                                                                                 </div>
                                                                                 <span className={`truncate max-w-[180px] ${file.isGhost ? 'text-amber-500 font-medium' : ''}`}>
                                                                                     {file.name}
                                                                                 </span>
                                                                             </div>
                                                                             <div className="flex items-center gap-2 shrink-0">
                                                                                 {file.isGhost ? (
                                                                                     <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">Missing</span>
                                                                                 ) : (
                                                                                     <span className="text-[10px] text-text-faint">{formatFileSize(file.size)}</span>
                                                                                 )}
                                                                                 <button
                                                                                     onClick={(e) => {
                                                                                         e.stopPropagation();
                                                                                         handleFileRemove(step.id, fIdx);
                                                                                     }}
                                                                                     className="p-1 hover:bg-bg rounded-md text-text-muted hover:text-red-400 transition-all"
                                                                                 >
                                                                                     <X size={12} />
                                                                                 </button>
                                                                             </div>
                                                                         </div>
                                                                     ))}
                                                                 </div>
                                                             )}

                                                            {editingStepId === step.id ? (
                                                                <textarea
                                                                    ref={(el) => {
                                                                        if (el) enableDragSelectScroll(el);
                                                                    }}
                                                                    autoFocus
                                                                    value={editContent}
                                                                    onChange={e => setEditContent(e.target.value)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onKeyDown={handleKeyDown}
                                                                    className="w-full bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-3 text-[12px] text-text-main placeholder:text-text-muted/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all min-h-[90px] font-mono shadow-inner resize-y leading-relaxed"
                                                                    placeholder="Step Template (Edit mode)"
                                                                />
                                                            ) : (
                                                                <div
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedStepId(step.id); // Ensure step is activated
                                                                        setScrollEnabledStepId(step.id);
                                                                    }}
                                                                    className={`text-[12px] text-text-muted font-mono leading-relaxed bg-bg-secondary/20 p-4 rounded-xl border border-border whitespace-pre-wrap break-words min-h-[60px] max-h-[140px] transition-all relative shadow-inner ${isScrollable ? 'overflow-y-auto custom-scrollbar ring-1 ring-border' : 'overflow-hidden cursor-pointer hover:bg-bg-surface/80 hover:border-border'
                                                                        }`}
                                                                    style={{
                                                                        backgroundImage: 'radial-gradient(circle, var(--border-main) 1.5px, transparent 1.5px)',
                                                                        backgroundSize: '12px 12px'
                                                                    }}
                                                                >
                                                                    <MarkdownErrorBoundary>
                                                                        {step.compiled || <span className="opacity-30 italic">Preview will appear here...</span>}
                                                                    </MarkdownErrorBoundary>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* GLOBAL ATTACHMENTS (Session Level) */}
                            <div className="mt-6 space-y-2 px-1">
                                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                                    <UploadCloud size={12} /> Attachments <span className="text-[9px] opacity-50 font-normal">(Session only)</span>
                                </div>

                                <div
                                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${isDragging
                                        ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/5'
                                        : 'border-border hover:bg-bg-elevated hover:border-primary/50'
                                        }`}
                                    onDragOver={e => e.preventDefault()}
                                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                                    onDragLeave={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        if (e.currentTarget.contains(e.relatedTarget)) return;
                                        setIsDragging(false);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setIsDragging(false);
                                        const droppedFiles = Array.from(e.dataTransfer.files);
                                        const accepted = filterOversizedFiles(droppedFiles, (f) => {
                                            showNotify(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                        });
                                        if (accepted.length > 0 && selectedStepId) {
                                            const currentFiles = stepFiles[selectedStepId] || [];
                                            const nextStepFiles = { ...stepFiles, [selectedStepId]: [...currentFiles, ...accepted] };
                                            setStepFiles(nextStepFiles);
                                            saveSessionData(variableValues, nextStepFiles, selectedPrompt?.id);
                                        }
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className={`text-xs pointer-events-none transition-colors ${isDragging ? 'text-primary font-bold' : 'text-text-muted'}`}>
                                        {isDragging ? "Drop files now!" : "Drag files here or click to upload"}
                                    </div>
                                </div>
                            </div>

                            {/* GLOBAL FILE INPUT */}
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleManualFileSelect}
                            />
                        </>
                    ) : filteredPrompts.length === 0 && !search ? (
                        /* EMPTY STATE (Initial) */
                        <div className="h-full flex flex-col items-center justify-center text-text-faint gap-4 opacity-50 animate-fade-in">
                            <Command size={48} strokeWidth={1} />
                            <span className="text-sm font-medium">No prompts loaded.</span>
                        </div>

                    ) : (
                        /* LIST MODE */
                        <div className="space-y-3 animate-fade-in pb-12">

                            {/* SAVED DRAFT LINKS (Design-Conform & Minimal-Invasive) */}
                            {savedDrafts.length > 0 && (
                                <div className="flex flex-col gap-1 px-1 animate-fade-in">
                                    {savedDrafts.map((draft) => {
                                        const isDraftActive = activeDraftId === draft.id;
                                        return (
                                            <div
                                                key={draft.id}
                                                className={`group/link flex items-center justify-between py-2 px-3 rounded-xl transition-colors ${isDraftActive
                                                    ? 'bg-primary/10'
                                                    : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                                                    }`}
                                            >
                                                <div
                                                    onClick={() => handleRestoreDraft(draft)}
                                                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                                    title="Restore this draft"
                                                >
                                                    <Clock size={14} className={`shrink-0 transition-colors ${isDraftActive ? 'text-primary' : 'text-zinc-400 group-hover/link:text-primary'}`} />

                                                    <span className={`text-xs font-medium truncate transition-colors ${isDraftActive ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400 group-hover/link:text-zinc-800 dark:group-hover/link:text-zinc-200'}`}>
                                                        {stripComments(draft.text).substring(0, 50) || 'Empty Draft'}...
                                                    </span>

                                                    {draft.files && draft.files.length > 0 && (
                                                        <div className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ml-1 flex-shrink-0 transition-colors ${isDraftActive ? 'bg-primary-subtle text-primary' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                                                            <FileIcon size={10} /> <span className="font-semibold">{draft.files.length}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveDraft(draft.id);
                                                    }}
                                                    className={`p-1.5 rounded-md transition-all ${isDraftActive
                                                        ? 'text-primary hover:bg-primary/20 opacity-100'
                                                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover/link:opacity-100'}`}
                                                    title="Delete Draft"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}


                            {/* ATTACHED FILES CHIPS (Visual Enhancement) */}
                            {quickPromptFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4 px-1 animate-fade-in">
                                    {quickPromptFiles.map((file, index) => (
                                        <div key={index} className="flex items-center justify-between p-1.5 bg-bg-elevated rounded border border-border text-xs text-text-main w-full">
                                            <div className="flex items-center gap-2 truncate">
                                                <FileIcon size={12} className="text-primary shrink-0" />
                                                <span className="truncate max-w-[200px]" title={file.name}>{file.name}</span>
                                                <span className="text-[10px] text-text-faint ml-auto shrink-0">{formatFileSize(file.size)}</span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeQuickPromptFile(index);
                                                }}
                                                className="text-text-muted hover:text-red-400 p-1"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ACTION HINT if typing but no results (Quick Prompt Mode) */}
                            {search && filteredPrompts.length === 0 && (
                                <div className="mb-4 px-2 flex items-center justify-between animate-fade-in text-[11px] text-text-muted">
                                    <span className="opacity-70">New Draft</span>
                                    <div className="flex gap-1.5 items-center">
                                        <button onClick={handleSaveQuickSnippet} className="px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all text-[11px] font-bold" title="Save as Snippet">Save to Snippets</button>
                                        <div className="w-px h-3 bg-border/60 bg-border/60 my-auto"></div>
                                        <button onClick={handleSaveQuickPrompt} className="px-2 py-1 rounded-lg text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all text-[11px] font-bold" title="Save this as a Prompt">Save to Library</button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                {filteredPrompts.map((prompt, index) => {
                                    const isSelected = index === selectedIndex;
                                    const isPinned = prompt.isPinned || prompt.tags?.includes('Pinned');
                                    const hasVars = prompt.content && (prompt.content.includes('{{') || prompt.content.includes('[['));

                                    return (
                                        <div
                                            key={prompt.id}
                                            id={`item-${index}`}
                                            onClick={() => {
                                                if (isSelected) {
                                                    handleSelectPrompt(prompt);
                                                } else {
                                                    setSelectedIndex(index);
                                                }
                                            }}
                                            className={`group relative p-4 rounded-2xl cursor-pointer border transition-all duration-200 ${
                                                isPinned ? 'popup-pinned-item shadow-sm ' : ''
                                            }${
                                                isSelected 
                                                    ? 'bg-indigo-50/80 border-indigo-400/20 text-indigo-700 dark:bg-indigo-500/[0.15] dark:border-indigo-500/40 dark:text-indigo-400 shadow-md z-10'
                                                    : 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-white/5 hover:bg-white dark:hover:bg-zinc-800/30 hover:shadow-sm hover:border-zinc-300 dark:hover:border-white/10'
                                            }`}
                                        >

                                            <div className="flex justify-between items-start mb-2 pl-2">
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    {editingId === prompt.id ? (
                                                        <input
                                                            autoFocus
                                                            value={editTitle}
                                                            onChange={e => setEditTitle(e.target.value)}
                                                            onClick={e => e.stopPropagation()}
                                                            onKeyDown={handleKeyDown}
                                                            className="w-full bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-[14px] font-bold text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all shadow-inner"
                                                            placeholder="Prompt Title"
                                                        />
                                                    ) : (
                                                        <div className="flex items-start gap-1.5">
                                                            {isPinned && <Pin size={14} className="text-primary fill-primary/20 shrink-0 mt-0.5" />}
                                                            <span className={`font-bold text-[14px] leading-snug ${isSelected ? 'text-primary dark:text-indigo-300' : 'text-text-main dark:text-zinc-200 dark:group-hover:text-white group-hover:text-primary'}`}>
                                                                {prompt.title}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                                                    <div className={`flex items-center gap-1 ${(!editingId && hasVars) || editingId === prompt.id ? 'mr-2 pr-2 border-r border-border' : ''}`}>
                                                        {editingId === prompt.id ? (
                                                            <>
                                                                <button onClick={(e) => cancelEditing(e)} className="p-1 rounded hover:bg-red-500/10 text-red-400" title="Cancel"><X size={14} /></button>
                                                                <button onClick={(e) => saveEdit(e, prompt)} className="p-1 rounded hover:bg-emerald-500/10 text-emerald-400" title="Save (Ctrl+Enter)"><Save size={14} /></button>
                                                            </>
                                                        ) : (
                                                            <button onClick={(e) => startEditing(e, prompt)} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary opacity-60 hover:opacity-100 transition-all" title="Quick Edit"><Pencil size={14} strokeWidth={2.5} /></button>
                                                        )}
                                                    </div>
                                                    {!editingId && hasVars && (
                                                        <div className="text-[9px] text-green-600 dark:text-green-400 font-bold font-mono bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-500/20 shadow-sm" title="Contains Variables">{'{{..}}'}</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="pl-2 pr-4 mb-3">
                                                {editingId === prompt.id ? (
                                                    <textarea
                                                        ref={(el) => {
                                                            if (el) enableDragSelectScroll(el);
                                                        }}
                                                        value={editContent}
                                                        onChange={e => setEditContent(e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        onKeyDown={handleKeyDown}
                                                        className="w-full bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-3 text-[12px] text-text-main placeholder:text-text-muted/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all min-h-[90px] font-mono shadow-inner resize-y leading-relaxed"
                                                        placeholder="Prompt Content"
                                                    />
                                                ) : (
                                                    <div className="text-[12px] dark:text-zinc-400 text-text-muted line-clamp-2 leading-relaxed font-normal dark:group-hover:text-zinc-300 group-hover:text-text-main transition-colors">
                                                         {(() => {
                                                             let content = stripComments(prompt.content || "");
                                                             content = content.replace(/!\[(.*?)\]\(data:image\/[^)]*\)/g, '[Image: $1]');
                                                             return content || "Empty...";
                                                         })()}
                                                     </div>
                                                )}
                                            </div>

                                            <div className="pl-2 flex items-center justify-between">
                                                <div className="flex gap-2">
                                                    {prompt.tags && prompt.tags.slice(0, 3).map(t => (
                                                        <span key={t} className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${t === 'Dev' || t === 'Refactoring'
                                                            ? 'dark:bg-zinc-800 bg-zinc-100 dark:text-zinc-300 text-zinc-500 border-transparent'
                                                            : 'dark:bg-zinc-800 dark:text-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 border-zinc-200 shadow-sm'
                                                            }`}>
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Hidden Input for Quick Prompts (Moved to bottom to prevent space-y issues) */}
                            <input
                                type="file"
                                id="quick-prompt-file-input"
                                multiple
                                className="hidden"
                                onChange={handleQuickPromptFileSelect}
                                ref={fileInputRef}
                            />
                        </div>
                    )
                    }
                </div >

                {/* === FOOTER AREA === */}
                <div className="absolute bottom-0 left-0 right-0 bg-white/80 dark:bg-[#18181b]/70 backdrop-blur-md border-t border-border dark:border-white/5 z-30 flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.4)]">

                    {/* COMBINED ACTION BAR */}
                    < div className="p-4 flex items-center justify-between gap-2 group/llmbar" >

                        {/* 1. MINI LLM SELECTOR (Left) */}
                        < div id="popup-llm-bar" className="relative flex-1 min-w-0 h-10 flex items-center group/llm mr-0 pl-3 pr-3" >
                            {/* REAKTIVES LABEL & GHOST-FILE WARNER */}
                            {(() => {
                                let hasGhost = false;
                                if (view === 'fill' && selectedStepId && stepFiles[selectedStepId]) {
                                    hasGhost = stepFiles[selectedStepId].some(f => f.isGhost || (!f.data && !(f instanceof Blob)));
                                } else if (activeSource === 'quick') {
                                    hasGhost = quickPromptFiles.some(f => f.isGhost || (!f.data && !(f instanceof Blob)));
                                }
                                
                                // Die neue atomare Komponente rendert das Label und (falls nötig) die Warnung
                                return <LlmInjectLabel context="popup" hasGhostFiles={hasGhost} />;
                            })()}

                            {/* Scroll Arrows - Positioned Outside */}
                            < AnimatePresence >
                                {
                                    scrollPosition.left && (
                                        <motion.button
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            onClick={() => scrollLlmBar('left')}
                                            className="absolute left-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.8)] dark:text-zinc-400 text-text-faint hover:text-primary dark:hover:text-white transition-all cursor-pointer"
                                        >
                                            <ChevronLeft size={16} strokeWidth={2.5} />
                                        </motion.button>
                                    )
                                }
                            </AnimatePresence >

                            <div
                                className="flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right w-full"
                                style={{ maskImage: scrollPosition.right ? 'linear-gradient(to right, black 90%, transparent 100%)' : 'none' }}
                                ref={llmScrollRef}
                                onWheel={handleWheelScroll}
                                onScroll={updateScrollButtons}
                            >
                                {llms.map(llm => (
                                    <LlmIconButton 
                                        key={llm.id} 
                                        size="md"
                                        llm={llm} 
                                        onClick={(e) => handleLaunch(llm, e)} 
                                        tooltip={getInjectionTooltip(llm.name, selectedPrompt ? (view === 'fill' ? `Step ${(stepsWithVariables.findIndex(s => s.id === selectedStepId) || 0) + 1}` : "Prompt") : "Prompt")} 
                                    />
                                ))}
                            </div>

                            <AnimatePresence>
                                {scrollPosition.right && (
                                    <motion.button
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        onClick={() => scrollLlmBar('right')}
                                        className="absolute right-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.8)] dark:text-zinc-400 text-text-faint hover:text-primary dark:hover:text-white transition-all cursor-pointer"
                                    >
                                        <ChevronRight size={16} strokeWidth={2.5} />
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div >

                        {/* 2. ACTIONS (Right) */}
                        < div className="flex items-center gap-2.5 shrink-0" >
                            {/* Keep Toggle */}
                            < div
                                onClick={toggleKeepValues}
                                className="flex items-center gap-2 pr-2 cursor-pointer transition-colors select-none group"
                                title="Keep values after injection"
                            >
                                <span className="text-[11px] font-bold text-text-muted dark:text-text-muted group-hover:text-zinc-900 dark:group-hover:text-zinc-300">Keep</span>
                                <div className={`w-8 h-4 rounded-full relative transition-colors border shadow-inner ${keepValues ? 'bg-primary border-primary' : 'bg-bg-secondary border-border'}`}>
                                    <div className={`absolute top-0.5 bottom-0.5 w-3 rounded-full shadow-sm transition-all bg-white ${keepValues ? 'left-4' : 'left-0.5'}`} />
                                </div>
                            </div >

                            {/* Copy Button (Only show if Injection Target exists, otherwise Main Action is Copy) */}
                            {/* Copy Button (Always visible) */}
                            <button
                                onClick={() => {
                                    // Force copy logic
                                    if (view === 'fill' && selectedPrompt) {
                                        const activeStep = stepsWithVariables.find(s => s.id === selectedStepId);
                                        navigator.clipboard.writeText(activeStep?.compiled || "");
                                    } else if (activeSource === 'quick' && quickPrompt) {
                                        navigator.clipboard.writeText(quickPrompt);
                                    } else if (filteredPrompts[selectedIndex]) {
                                        navigator.clipboard.writeText(filteredPrompts[selectedIndex].content || "");
                                    }
                                    showNotify("Copied to clipboard!", 'success');
                                    setTimeout(() => window.close(), 1000);
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-bg-surface border border-border dark:border-zinc-800 text-text-faint dark:text-zinc-400 dark:hover:text-white hover:text-primary dark:hover:border-zinc-600 hover:border-primary/30 transition-all hover:shadow-lg active:scale-95"
                                title="Copy to Clipboard"
                            >
                                <Copy size={16} />
                            </button>

                            {/* Inject Button - DEFENSIVE & ZERO-REGRESSION LOGIC */}
                            <button
                                disabled={(() => {
                                    // 100% isolierte State-Abfrage (kein Leak nach außen)
                                    const isListActive = view === 'list';
                                    const activeP = isListActive ? filteredPrompts[selectedIndex] : null;
                                    const hasV = activeP?.content && (activeP.content.includes('{{') || activeP.content.includes('[['));
                                    
                                    const isInstantInjectable = isListActive && activeP && !hasV;
                                    const isFillReady = view === 'fill' && selectedPrompt;
                                    const isQuickReady = activeSource === 'quick' && quickPrompt.trim();
                                    
                                    // Intention: Soll der Klick Text ins LLM feuern?
                                    const isInjectIntent = isFillReady || isQuickReady || isInstantInjectable;
                                    
                                    // Disable NUR, wenn wir feuern wollen, aber kein Ziel haben
                                    return isInjectIntent && !injectionTarget;
                                })()}
                                onClick={() => {
                                    // Wird vom Browser nativ blockiert, wenn 'disabled' true ist.
                                    // Daher ist hier kein extra "!injectionTarget" Check mehr nötig.
                                    if (view === 'fill' && selectedPrompt) {
                                        const activeStep = stepsWithVariables.find(s => s.id === selectedStepId);
                                        // --- VALIDATION GUARD ---
                                        if (!validateRequiredVariables(activeStep?.content)) return; // 🛑 HARD STOP
                                        // ------------------------
                                        executePromptAction(activeStep?.compiled, stepFiles[selectedStepId] || []);
                                    } else if (activeSource === 'quick' && quickPrompt.trim()) {
                                        executePromptAction(quickPrompt, quickPromptFiles);
                                    } else if (filteredPrompts[selectedIndex]) {
                                        const activePromptItem = filteredPrompts[selectedIndex];
                                        const hasVars = activePromptItem.content && (activePromptItem.content.includes('{{') || activePromptItem.content.includes('[['));

                                        if (hasVars) {
                                            handleSelectPrompt(activePromptItem);
                                        } else {
                                            executePromptAction(activePromptItem.content, [], null, false);
                                        }
                                    }
                                }}
                                className={`h-9 pl-3 pr-4 flex items-center gap-2 rounded-xl shadow-lg font-semibold text-[13px] transition-all border border-transparent active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:bg-bg-elevated disabled:text-text-muted disabled:border-border disabled:shadow-none ${
                                    status === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 text-white' :
                                    (() => {
                                        const activePromptItem = view === 'list' ? filteredPrompts[selectedIndex] : null;
                                        const hasVars = activePromptItem?.content && (activePromptItem.content.includes('{{') || activePromptItem.content.includes('[['));
                                        const isInstantInjectable = view === 'list' && activePromptItem && !hasVars;
                                        const isFillReady = view === 'fill' && selectedPrompt;
                                        const isQuickReady = activeSource === 'quick' && quickPrompt.trim();

                                        if (isFillReady || isQuickReady || isInstantInjectable || activePromptItem) {
                                            return 'bg-primary hover:bg-primary-hover shadow-primary/20 text-white';
                                        }
                                        return 'bg-bg-secondary hover:bg-bg-hover dark:text-zinc-300 text-zinc-600';
                                    })()
                                }`}
                                title={(() => {
                                    const isListActive = view === 'list';
                                    const activeP = isListActive ? filteredPrompts[selectedIndex] : null;
                                    const hasV = activeP?.content && (activeP.content.includes('{{') || activeP.content.includes('[['));
                                    const isInstantInjectable = isListActive && activeP && !hasV;
                                    const isFillReady = view === 'fill' && selectedPrompt;
                                    const isQuickReady = activeSource === 'quick' && quickPrompt.trim();
                                    
                                    const isInjectIntent = isFillReady || isQuickReady || isInstantInjectable;
                                    
                                    if (isInjectIntent && !injectionTarget) {
                                        return "Not connected. Use the Copy button to the left.";
                                    }
                                    return "";
                                })()}
                            >
                                {(() => {
                                    if (status === 'success') return <Check size={14} strokeWidth={3} />;

                                    const activePromptItem = view === 'list' ? filteredPrompts[selectedIndex] : null;
                                    const hasVars = activePromptItem?.content && (activePromptItem.content.includes('{{') || activePromptItem.content.includes('[['));
                                    const isInstantInjectable = view === 'list' && activePromptItem && !hasVars;
                                    const isFillReady = view === 'fill' && selectedPrompt;
                                    const isQuickReady = activeSource === 'quick' && quickPrompt.trim();

                                    if (isFillReady || isQuickReady || isInstantInjectable) return <Send size={14} strokeWidth={2.5} />;
                                    return <LayoutGrid size={14} />;
                                })()}
                                <span>
                                    {(() => {
                                        if (status === 'success') return 'Sent';

                                        const activePromptItem = view === 'list' ? filteredPrompts[selectedIndex] : null;
                                        const hasVars = activePromptItem?.content && (activePromptItem.content.includes('{{') || activePromptItem.content.includes('[['));
                                        const isInstantInjectable = view === 'list' && activePromptItem && !hasVars;
                                        const isFillReady = view === 'fill' && selectedPrompt;
                                        const isQuickReady = activeSource === 'quick' && quickPrompt.trim();

                                        if (isFillReady || isQuickReady || isInstantInjectable) return 'Inject';
                                        return 'Select';
                                    })()}
                                </span>
                            </button>
                        </div >
                    </div >

                    {/* 3. FOOTER LINKS (Updated: Lighter Text) */}
                    < div className="pb-3 pt-0 flex justify-center items-center gap-4 text-[10px] select-none opacity-80 hover:opacity-100 transition-opacity" >
                        <a href="https://github.com/IvicaV/LeanPrompts" target="_blank" className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors">
                            <Github size={10} /> About
                        </a>
                        <div className="text-zinc-700">|</div>
                        <div
                            onClick={() => {
                                // Open Dashboard with feedback signal (full-screen modal experience)
                                chrome.tabs.query({}, (tabs) => {
                                    const runtimeUrl = chrome.runtime.getURL('');
                                    const dashboardTab = tabs.find(t => t.url && t.url.startsWith(runtimeUrl) && !t.url.includes('popup.html'));
                                    const signal = { action: 'openFeedback', timestamp: Date.now() };

                                    if (dashboardTab) {
                                        chrome.tabs.update(dashboardTab.id, { active: true });
                                        chrome.windows.update(dashboardTab.windowId, { focused: true });
                                        chrome.storage.local.set({ lp_navigation_signal: signal });
                                    } else {
                                        chrome.storage.local.set({ lp_navigation_signal: signal });
                                        chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
                                    }
                                });
                            }}
                            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                        >
                            <MessageSquare size={10} /> Support
                        </div>
                        <div className="text-zinc-700">|</div>
                        <a href="https://ko-fi.com/ivicav" target="_blank" className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors">
                            <Coffee size={10} /> Coffee
                        </a>
                    </div >
                </div >

                {/* GLOBAL NOTIFICATION TOAST */}
                < AnimatePresence >
                    {notification && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="absolute bottom-20 left-4 right-4 z-[200] flex justify-center pointer-events-none"
                        >
                            <div className={`px-4 py-2.5 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl pointer-events-auto transition-all ${
                                notification.type === 'success' 
                                    ? 'bg-white/95 dark:bg-zinc-900/95 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                                    : notification.type === 'warning' 
                                        ? 'bg-white/95 dark:bg-zinc-900/95 border-amber-500/30 text-amber-600 dark:text-amber-400' 
                                        : 'bg-white/95 dark:bg-zinc-900/95 border-primary/30 text-primary'
                            }`}>
                                {notification.type === 'warning' ? <AlertCircle size={16} /> : <Check size={16} />}
                                <span className="text-xs font-bold whitespace-nowrap">{notification.message}</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence >

                {/* SMART CONNECT HELP DIALOG */}
                <AnimatePresence>
                    {showConnectHelp && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowConnectHelp(false)}
                                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                            />

                            {/* Modal */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="relative z-[120] w-full max-w-[280px] bg-bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden"
                            >
                                <div className="p-5 flex flex-col items-center text-center">
                                    {connectHelpReason === "BROWSER_RESTRICTED" ? (
                                        <>
                                            <div className="w-10 h-10 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-3">
                                                <X size={20} strokeWidth={2.5} />
                                            </div>
                                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                                                Action Blocked
                                            </h3>
                                            <p className="text-[11px] text-text-muted leading-relaxed mb-5 px-1 text-center">
                                                Browser security prevents interaction. Manual selection is not possible on this page.
                                            </p>
                                            <button
                                                onClick={() => setShowConnectHelp(false)}
                                                className="w-full py-2 px-4 bg-zinc-600 hover:bg-zinc-500 text-white rounded-xl text-[11px] font-bold flex items-center justify-center transition-all active:scale-95"
                                            >
                                                Close
                                            </button>
                                        </>
                                    ) : connectHelpReason === "STALE_LLM_TAB" ? (
                                        <>
                                            <div className="w-10 h-10 bg-primary-subtle text-primary rounded-full flex items-center justify-center mb-3">
                                                <RefreshCw size={20} strokeWidth={2.5} />
                                            </div>
                                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                                                Connection Problem
                                            </h3>
                                            <p className="text-[11px] text-text-muted leading-relaxed mb-5 px-1 text-center">
                                                The page needs a refresh to restore the connection.
                                            </p>
                                            <div className="flex flex-col gap-2 w-full">
                                                {/* @PROTECTED_REGION START: Connection Refresh */}
                                                {/* NEVER use chrome.tabs.reload() parameter-less inside split-screen. */}
                                                <button
                                                    onClick={() => {
                                                        getActiveTab().then(([tab]) => {
                                                            if (tab?.id) {
                                                                chrome.tabs.reload(tab.id);
                                                            }
                                                        });
                                                        setShowConnectHelp(false);
                                                        const urlParams = new URLSearchParams(window.location.search);
                                                        const isSidebar = urlParams.get('mode') === 'sidebar';
                                                        if (!isSidebar) window.close();
                                                    }}
                                                    className="w-full py-3 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                                                >
                                                    <RefreshCw size={14} />
                                                    Refresh Page
                                                </button>
                                                {/* @PROTECTED_REGION END: Connection Refresh */}
                                                <button
                                                    onClick={() => {
                                                        setConnectHelpReason("MANUAL_FALLBACK");
                                                    }}
                                                    className="text-[10px] text-zinc-400 hover:text-text-muted font-medium"
                                                >
                                                    Try Manual Selection instead
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-3">
                                                <AlertTriangle size={20} strokeWidth={2.5} />
                                            </div>

                                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                                                Connection Issues
                                            </h3>

                                            <p className="text-[11px] text-text-muted leading-relaxed mb-5 px-1 text-center font-medium">
                                                The field was not detected automatically. <br />
                                                <span className="text-zinc-400 font-normal">Refresh the page, select manually, or copy the text.</span>
                                            </p>

                                            <div className="flex flex-col gap-2 w-full">
                                                {/* @PROTECTED_REGION START: Connection Refresh */}
                                                {/* NEVER use chrome.tabs.reload() parameter-less inside split-screen. */}
                                                {/* Option 1: Refresh (Recommended fix for stale connections) */}
                                                <button
                                                    onClick={() => {
                                                        getActiveTab().then(([tab]) => {
                                                            if (tab?.id) {
                                                                chrome.tabs.reload(tab.id);
                                                            }
                                                        });
                                                        setShowConnectHelp(false);
                                                        const urlParams = new URLSearchParams(window.location.search);
                                                        const isSidebar = urlParams.get('mode') === 'sidebar';
                                                        if (!isSidebar) window.close();
                                                    }}
                                                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                                >
                                                    <RefreshCw size={14} />
                                                    Refresh Page
                                                </button>
                                                {/* @PROTECTED_REGION END: Connection Refresh */}

                                                {/* Option 2: Manual Select */}
                                                <button
                                                    onClick={() => {
                                                        setShowConnectHelp(false);
                                                        startSelectionMode();
                                                    }}
                                                    className="w-full py-2.5 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-indigo-500/10"
                                                >
                                                    <MousePointer2 size={14} />
                                                    Select Manually
                                                </button>

                                                {/* Option 2: Copy Only */}
                                                <button
                                                    onClick={() => {
                                                        setShowConnectHelp(false);
                                                        const textToCopy = (activeSource === 'quick' ? quickPrompt : selectedPrompt?.content) || "";
                                                        navigator.clipboard.writeText(textToCopy);
                                                        const urlParams = new URLSearchParams(window.location.search);
                                                        const isSidebar = urlParams.get('mode') === 'sidebar';
                                                        if (!isSidebar) setTimeout(() => window.close(), 800);
                                                    }}
                                                    className="w-full py-2 px-4 bg-zinc-100 hover:bg-border/60 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-text-main rounded-xl text-[11px] font-semibold flex items-center justify-center gap-2 transition-all"
                                                >
                                                    <Copy size={14} />
                                                    Copy Text Only
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => setShowConnectHelp(false)}
                                                className="mt-4 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-medium"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        </div >
                    )
                    }
                </AnimatePresence >

                <OnboardingFlow
                    type="popup"
                    steps={POPUP_TOUR_STEPS}
                />

                <ConfirmationModal
                    isOpen={modalConfig.isOpen}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onConfirm={(val) => {
                        if (modalConfig.onConfirm) modalConfig.onConfirm(val);
                        setModalConfig(prev => ({ ...prev, isOpen: false }));
                    }}
                    onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                    confirmText={modalConfig.confirmText}
                    isDangerous={modalConfig.isDangerous}
                />

                {/* @PROTECTED_REGION START: SPLIT_SCREEN_DEBUG_OVERLAY
                    CRITICAL: Do NOT remove. See .agent/skills/split-screen-governance/SKILL.md Rule 10 */}
                {debugInfo && (
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.85)', zIndex: 999999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'monospace', color: '#e0e0e0', fontSize: '11px'
                        }}
                        onClick={() => setDebugInfo(null)}
                    >
                        <div style={{
                            background: '#1a1a2e', border: '1px solid #333',
                            borderRadius: '12px', padding: '16px 20px',
                            maxWidth: '420px', width: '100%', maxHeight: '90vh',
                            overflow: 'auto', lineHeight: 1.6
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#7c3aed', marginBottom: '8px' }}>
                                🔧 Split-Screen Debug
                            </div>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {JSON.stringify(debugInfo, null, 2)}
                            </pre>
                            <div style={{ marginTop: '10px', color: '#666', fontSize: '10px' }}>
                                Click anywhere or press any key to close
                            </div>
                        </div>
                    </div>
                )}
                {/* @PROTECTED_REGION END: SPLIT_SCREEN_DEBUG_OVERLAY */}
            </div >
        </div >
        </>
    );
}



