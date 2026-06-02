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
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import usePromptStore from '../../stores/promptStore';
import {
    Plus, Search, Trash2, X, Sparkles, LayoutGrid, Info, Check, Save, Send, Blocks, Link, Zap,
    Pin, Star, ChevronDown, Clock, SortAsc, ArrowUpDown, Folder, Tag, Tags, Copy,
    ChevronLeft, ChevronRight, Maximize, FileText, History, BookOpen, StickyNote, Eye, EyeOff,
    Share2, Download, Image as ImageIcon, FileJson, MoreVertical, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { copyToClipboard } from '../../utils/clipboard';
import { getLlmConfig, getInjectionTooltip } from '../../utils/llmConstants';
import { triggerInjection } from '../../utils/injectionAPI';
import Rating from '../../components/Rating';
import PromptEditor from '../../components/PromptEditor';
import { parseVariables, compilePrompt, resolveSnippets } from '../../utils/variableParser';
import ConfirmationModal from '../../components/ConfirmationModal';
import BulkActionBar from '../../components/BulkActionBar';
import TagEditorPopover from '../../components/TagEditorPopover';
import MultiTaggerModal from '../../components/MultiTaggerModal';
import VersionHistory from '../../components/VersionHistory';

// SHARED COMPONENTS
import TagInput from '../../components/TagInput';
import DynamicTagList from '../../components/DynamicTagList';
import SearchInput from '../../components/SearchInput';
import ActiveFilterBar from '../../components/ActiveFilterBar';
import NoteEditor from '../../components/NoteEditor';
import { formatLeanText } from '../../utils/leanFormat';
import useModifierKeys from '../../hooks/useModifierKeys';
import { ExternalLink } from 'lucide-react';
import { LlmInjectLabel, LlmIconButton } from '../../components/llm/LlmInjectBar';
import ToolbarButton from '../../components/ToolbarButton';


export default function SnippetLibrary({
    onViewChange,
    onNotification,
    filteredSnippets: propFilteredSnippets,
    activeCollectionId,
    selectedTags,
    setSelectedTags,
    tags,
    onCreateCollection,
    isZenMode = false,
    setIsZenMode,
    onToggleZenMode,
    isSidebarCollapsed = false,

    // Lifted Editor State
    editName,
    setEditName,
    editContent,
    setEditContent,
    editTags,
    setEditTags,
    editCollectionId,
    setEditCollectionId,
    originalName,
    setOriginalName,

    // Deep Linking
    pendingSnippetId,
    pendingSnippetTab,
    onClearPendingSnippet,
    backlinks = {},
    onOpenKnowledgeTile,
    onOpenPromptNote,
    onNavigate,
    isDarkMode
}) {
    const {
        knowledgeTiles,
        updateSnippetNote,
        snippets,
        prompts,
        llms,
        collections,
        assignToCollection, // Needed for collection logic
        saveSnippet,
        deleteSnippet,
        checkSnippetUsage,
        inlineSnippetInPrompts,
        renameSnippetEverywhere, // Renames in prompts + knowledge tiles
        removeSnippetRefsFromPrompts, // NEW
        setActivePrompt,
        incrementSnippetUsage,
        snippetSortMode,
        setSnippetSortMode,
        toggleSnippetPin,
        setSnippetRating,
        saveCollection,
        bulkAssignSnippetsToCollection,
        bulkUpdateSnippetTags,
        bulkDeleteSnippets,
        activeSnippetId,
        setActiveSnippet,
        isSyncing, // Issue B check
        setSyncing,
        createSnippetVersion,
        restoreSnippetVersion,
        updateSnippetVersionNote,
        deleteSnippetVersion,
        setActiveCollection // <-- NEU: Direkt aus dem Store geholt
    } = usePromptStore();

    const activeCollection = collections.find(c => c.id === activeCollectionId);

    // --- START: SNIPPET LLM SCROLL LOGIC ---
    const [snippetLlmScroll, setSnippetLlmScroll] = React.useState({ left: false, right: false });
    const snippetLlmScrollRef = React.useRef(null);

    const updateSnippetLlmScroll = React.useCallback(() => {
        if (snippetLlmScrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = snippetLlmScrollRef.current;
            setSnippetLlmScroll({
                left: scrollLeft > 5,
                right: scrollLeft + clientWidth < scrollWidth - 5
            });
        }
    }, []);

    const handleSnippetLlmWheel = (e) => {
        if (snippetLlmScrollRef.current) {
            snippetLlmScrollRef.current.scrollLeft += e.deltaY;
            updateSnippetLlmScroll();
        }
    };

    const scrollSnippetLlmBar = (direction) => {
        if (snippetLlmScrollRef.current) {
            const amount = direction === 'left' ? -100 : 100;
            snippetLlmScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
            setTimeout(updateSnippetLlmScroll, 350);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(updateSnippetLlmScroll, 300);
        window.addEventListener('resize', updateSnippetLlmScroll);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateSnippetLlmScroll);
        };
    }, [activeSnippetId, llms.length, updateSnippetLlmScroll]);
    // --- END: SNIPPET LLM SCROLL LOGIC ---

    const [search, setSearch] = useState("");
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [menuPopupPos, setMenuPopupPos] = useState({ top: 0, left: 0 });

    // Globaler Click-Listener zum Schließen des Menüs
    useEffect(() => {
        const closeMenu = () => setActiveMenuId(null);
        if (activeMenuId) window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [activeMenuId]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [showSort, setShowSort] = useState(false);
    const [showCollectionMenu, setShowCollectionMenu] = useState(false); // Track editor header dropdown
    const [editorCollectionPopupPos, setEditorCollectionPopupPos] = useState({ top: 0, left: 0 }); // <-- NEU
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

    // RENAME LOGIC STATE
    const [renameConfig, setRenameConfig] = useState(null); // { oldName, newName, usages }
    const [renameOption, setRenameOption] = useState('update'); // 'update' | 'break'
    const [cleanupRefs, setCleanupRefs] = useState(false);

    // Tag Editor State
    const [tagEditorConfig, setTagEditorConfig] = useState({
        isOpen: false,
        ids: [],
        isBulk: false,
        initialTags: [],
        anchorRect: null
    });

    // Export / More Actions State
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const moreMenuRef = useRef(null);
    const [isExportingImg, setIsExportingImg] = useState(false);
    const exportRef = useRef(null);

    useEffect(() => {
        if (!showMoreMenu) return;
        const handleClickOutside = (e) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
                setShowMoreMenu(false);
            }
        };
        const timeout = setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
        return () => {
            clearTimeout(timeout);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [showMoreMenu]);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: "",
        message: "",
        customButtons: null,
        onConfirm: null,
        isDangerous: false
    });

    const [collectionDropdownOpen, setCollectionDropdownOpen] = useState(null); // Track which snippet's dropdown is open
    const [collectionPopupPos, setCollectionPopupPos] = useState({ top: 0, left: 0 });
    const [backlinkDropdownOpen, setBacklinkDropdownOpen] = useState(null); // Track which snippet's backlink dropdown is open
    const [backlinkPopupPos, setBacklinkPopupPos] = useState({ top: 0, left: 0 });
    const [usagePopupSnippet, setUsagePopupSnippet] = useState(null); // NEW: Track snippet usage popup { id, name, usages: [] }
    const [isMultiTaggerOpen, setIsMultiTaggerOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const nameInputRef = useRef(null);

    // ZEN MODE & COLUMN STATES
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'history'

    // Shield against delayed DB echoes
    const isTypingRef = useRef(false);
    const typingTimeoutRef = useRef(null);

    // Responsive Width Detection
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const availableSpace = useMemo(() => {
        const sideWidth = isSidebarCollapsed ? 64 : 256;
        const listWidth = (isListCollapsed && activeSnippetId) ? 0 : 320;
        const detailsWidth = (isDetailsCollapsed && activeSnippetId) ? 0 : 288;
        return Math.max(0, windowWidth - sideWidth - listWidth - detailsWidth);
    }, [windowWidth, isSidebarCollapsed, isListCollapsed, isDetailsCollapsed, activeSnippetId]);

    const useZenLook = isZenMode || availableSpace > 900; // 50px buffer

    const preZenState = useRef(null);

    // Sync internal sidebars with global Zen Mode
    useEffect(() => {
        if (isZenMode) {
            // Guard: Only capture if not already capturing to prevent overwriting
            if (!preZenState.current) {
                preZenState.current = { list: isListCollapsed, details: isDetailsCollapsed };
            }
            setIsListCollapsed(true);
            setIsDetailsCollapsed(true);
        } else if (preZenState.current) {
            // Restore state on exit
            setIsListCollapsed(preZenState.current.list);
            setIsDetailsCollapsed(preZenState.current.details);
            preZenState.current = null;
        }
    }, [isZenMode]);


    // Auto-focus on name field when creating a new snippet
    useEffect(() => {
        if (activeSnippetId && editName.startsWith("NewSnippet") && !editContent) {
            setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 50);
        }
    }, [activeSnippetId]);

    // AUTO-SCROLL TO ACTIVE SNIPPET ON MOUNT
    useEffect(() => {
        if (activeSnippetId) {
            setTimeout(() => {
                const container = document.getElementById('snippet-list-container');
                const activeCard = document.getElementById(`snippet-card-${activeSnippetId}`);
                
                if (container && activeCard) {
                    const containerRect = container.getBoundingClientRect();
                    const cardRect = activeCard.getBoundingClientRect();
                    
                    // Zentriert die Snippet-Card im sichtbaren Container
                    const targetScroll = container.scrollTop + (cardRect.top - containerRect.top) - (containerRect.height / 2) + (cardRect.height / 2);
                    
                    container.scrollTo({
                        top: Math.max(0, targetScroll),
                        behavior: 'smooth'
                    });
                }
            }, 150); // Timeout erlaubt das Initial-Rendering der Liste
        }
    }, []);

    // Handle deep-linked/pending snippets
    useEffect(() => {
        if (pendingSnippetId && snippets.length > 0) {
            const snippet = snippets.find(s => s.id === pendingSnippetId);
            if (snippet) {
                handleEdit(snippet);
                if (pendingSnippetTab) {
                    setActiveTab(pendingSnippetTab);
                    setIsDetailsCollapsed(false);
                }
                onClearPendingSnippet();
            }
        }
    }, [pendingSnippetId, pendingSnippetTab, snippets, onClearPendingSnippet]);

    // --- PENDING JUMP PICKUP ---
    React.useEffect(() => {
        if (window.lp_pending_snippet_search) {
            setSearch(window.lp_pending_snippet_search);
            // Also try to find and "Edit" it immediately if it exists
            const found = snippets.find(s => s.name === window.lp_pending_snippet_search);
            if (found) {
                handleEdit(found);
            }
            window.lp_pending_snippet_search = null;
        }
    }, [snippets]);

    // --- COMPUTED DETAILS (Point 10) ---
    const detectedVars = useMemo(() => {
        return parseVariables(editContent);
    }, [editContent]);

    const usageList = useMemo(() => {
        if (!editName) return [];
        return checkSnippetUsage(editName);
    }, [editName, prompts]);

    const snippetRefCounts = useMemo(() => {
        const counts = {};
        if (!snippets || !Array.isArray(snippets)) return counts;

        snippets.forEach(s => {
            if (s && s.id && s.name) {
                const usage = checkSnippetUsage(s.name);
                counts[s.id] = (usage && Array.isArray(usage)) ? usage.length : 0;
            }
        });
        return counts;
    }, [snippets, prompts, checkSnippetUsage]);

    const hasUnsavedChanges = React.useRef(false);
    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

    // FIX: Sync React State with Database State when Active Snippet Content changes (e.g. from an Import Rollback)
    const lastTypedSnippetContent = React.useRef("");
    const activeSnippetObj = useMemo(() => snippets?.find(s => s.id === activeSnippetId), [snippets, activeSnippetId]);

    // Aktuelle Werte IMMER in Refs halten für den Unmount-Cycle und den Flush
    const latestDataRef = useRef({ editName, editContent, editTags, editCollectionId, activeSnippetId });
    useEffect(() => {
        latestDataRef.current = { editName, editContent, editTags, editCollectionId, activeSnippetId };
    }, [editName, editContent, editTags, editCollectionId, activeSnippetId]);

    // CRITICAL FIX: Der absolute "Bulletproof" Flush für Snippets
    const flushSnippetSave = useCallback(() => {
        // Wir nutzen IMMER die Ref, um React-Lifecycle-Bugs (Stale Closures) zu 100% auszuschließen!
        const data = latestDataRef.current; 
        
        if (hasUnsavedChanges.current && data.activeSnippetId && data.editName.trim() && !isSyncing) {
            // Guard: Wenn gerade ein Konflikt beim Umbenennen besteht, nicht überschreiben
            if (originalName && data.editName !== originalName && !originalName.startsWith("NewSnippet")) {
                return; 
            }
            
            saveSnippet({
                id: data.activeSnippetId,
                name: data.editName.trim(),
                content: data.editContent,
                tags: data.editTags,
                collectionId: data.editCollectionId
            });
            hasUnsavedChanges.current = false;
            setSaveStatus('saved');
        }
    }, [isSyncing, originalName, saveSnippet]);


    React.useEffect(() => {
        if (activeSnippetObj && activeSnippetObj.content !== lastTypedSnippetContent.current) {
            // SHIELD against delayed DB echoes. Never overwrite local edit state if typing
            if (isTypingRef.current) return;

            setEditContent(activeSnippetObj.content);
            lastTypedSnippetContent.current = activeSnippetObj.content;

            // Sync meta layout if we are reverting
            setEditName(activeSnippetObj.name);
            setOriginalName(activeSnippetObj.name);
            setEditTags(activeSnippetObj.tags || []);
            setEditCollectionId(activeSnippetObj.collectionId || null);
        }
    }, [activeSnippetObj]);

    // AUTO-SAVE EFFECT
    React.useEffect(() => {
        if (!activeSnippetId || !hasUnsavedChanges.current || isSyncing) return;

        if (originalName && editName !== originalName && !originalName.startsWith("NewSnippet")) {
            return;
        }

        setSaveStatus('saving');
        const timer = setTimeout(async () => {
            flushSnippetSave();
        }, 1000);

        return () => clearTimeout(timer);
    }, [editName, editContent, editTags, editCollectionId, activeSnippetId, originalName, isSyncing, flushSnippetSave]);



    // Force-Save beim Unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSnippetSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushSnippetSave();
    };
  }, [flushSnippetSave]);


    const handleCreate = () => {
        flushSnippetSave(); // FLUSH OLD SNIPPET BEFORE CREATING NEW

        const id = crypto.randomUUID();
        
        let count = 1;
        let finalName = "NewSnippet";
        while (snippets.some(s => s.name === finalName)) {
            finalName = `NewSnippet_${count}`;
            count++;
        }

        setActiveSnippet(id);
        setEditName(finalName);
        setOriginalName(finalName);
        setEditContent("");
        setEditTags([]);
        setEditCollectionId(activeCollectionId || null);
        
        hasUnsavedChanges.current = false;
        setSaveStatus('idle');
    };

    const handleEdit = (snippet) => {
        flushSnippetSave(); // FLUSH OLD SNIPPET BEFORE SWITCHING
        
        setActiveSnippet(snippet.id);
        setEditName(snippet.name);
        setOriginalName(snippet.name);
        setEditContent(snippet.content);
        setEditTags(snippet.tags || []);
        setEditCollectionId(snippet.collectionId || null);
        hasUnsavedChanges.current = false; // Reset dirty flag
        setSaveStatus('idle');
    };

    // Wrapper to update state and mark dirty
    const updateEditState = (setter, value, isContentEdit = false) => {
        setter(value);
        hasUnsavedChanges.current = true;
        setSaveStatus('saving'); // Immediate visual feedback

        if (isContentEdit) {
            isTypingRef.current = true;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                isTypingRef.current = false;
            }, 1000);
        }
    };

    // NEW: Handle Name Blur for Rename Logic
    const handleNameBlur = () => {
        if (!activeSnippetId) return;

        const oldName = originalName;
        const newName = editName.trim();
        const currentId = activeSnippetId; // Freeze ID to prevent race conditions

        // Guard: Only trigger if name actually changed
        if (oldName && newName && oldName !== newName) {
            
            // --- NEW: COLLISION GUARD ---
            const nameExists = snippets.some(s => s.name.toLowerCase() === newName.toLowerCase() && s.id !== currentId);
            if (nameExists) {
                if (onNotification) onNotification(`A snippet named "@${newName}" already exists.`, "error");
                setEditName(oldName); // Rollback UI State
                return; // Hard Stop
            }
            // ----------------------------

            if (!oldName.startsWith("NewSnippet")) {
                const usages = checkSnippetUsage(oldName);
                if (usages.length > 0) {
                    hasUnsavedChanges.current = false; // Pause auto-save
                    setRenameConfig({ oldName, newName, usages, targetId: currentId });
                    setRenameOption('update');
                    setCleanupRefs(false);
                    return; // Stop here, wait for modal
                }
            }

            // No usage or brand new: save immediately
            setOriginalName(newName);
            hasUnsavedChanges.current = true;
            saveSnippet({
                id: currentId,
                name: newName,
                content: editContent,
                tags: editTags,
                collectionId: editCollectionId
            });
            setSaveStatus('saved');
        }
    };

    const confirmRename = async () => {
        if (!renameConfig) return;
        setSyncing(true); // START GLOBAL SYNC LOCK
        try {
            const { oldName, newName, targetId } = renameConfig;

            // 1. Update prompts/knowledge globally
            if (renameOption === 'update') {
                await renameSnippetEverywhere(oldName, newName);
            } else if (renameOption === 'break' && cleanupRefs) {
                await removeSnippetRefsFromPrompts(oldName);
            }

            // 2. Update local UI only if we're still on the same snippet
            if (activeSnippetId === targetId) {
                setOriginalName(newName);
                updateEditState(setEditName, newName);
            }

            // 3. Save snippet using the frozen targetId
            const snippetToUpdate = snippets.find(s => s.id === targetId);
            if (snippetToUpdate) {
                await saveSnippet({
                    ...snippetToUpdate,
                    name: newName,
                    content: activeSnippetId === targetId ? editContent : snippetToUpdate.content,
                    tags: activeSnippetId === targetId ? editTags : snippetToUpdate.tags,
                    collectionId: activeSnippetId === targetId ? editCollectionId : snippetToUpdate.collectionId
                });
            }
        } finally {
            setSyncing(false); // RELEASE GLOBAL SYNC LOCK
            setRenameConfig(null);
        }
    };

    const cancelRename = () => {
        // Revert name
        setEditName(renameConfig.oldName);
        setRenameConfig(null);
    };


    const handleDownloadJson = () => {
        if (!activeSnippetId) return;
        flushSnippetSave(); // FLUSH BEFORE EXPORT
        const s = snippets.find(x => x.id === activeSnippetId);
        if (!s) return;

        const payload = {
            meta: {
                version: 2,
                type: 'snippet_export',
                exportedAt: new Date().toISOString(),
                app: "LeanPrompts"
            },
            snippets: [{
                ...s,
                name: editName,
                content: editContent,
                tags: editTags,
                collectionId: editCollectionId
            }]
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = editName ? editName.replace(/[^a-z0-9-_]/gi, '_').toLowerCase() : 'untitled';
        a.download = `@snippet-${cleanName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowMoreMenu(false);
        if (onNotification) onNotification("JSON Format exported successfully.", "success");
    };

    const handleDownloadImage = async () => {
        if (!exportRef.current || !activeSnippetId) return;
        setIsExportingImg(true);
        setShowMoreMenu(false);
        
        try {
            await new Promise(res => setTimeout(res, 100)); // allow DOM refresh
            const dataUrl = await toPng(exportRef.current, {
                quality: 1.0,
                pixelRatio: 4,
                backgroundColor: 'transparent'
            });
            const cleanName = editName ? editName.replace(/[^a-z0-9-_]/gi, '_').toLowerCase() : 'untitled';
            download(dataUrl, `@snippet-${cleanName}.png`);
            if (onNotification) onNotification("Image exported successfully.", "success");
        } catch (err) {
            console.error(err);
            if (onNotification) onNotification("Export failed. Please try again.", "error");
        } finally {
            setIsExportingImg(false);
        }
    };

    const handleTakeSnapshot = async () => {
        if (!activeSnippetId) return;
        flushSnippetSave(); // FLUSH BEFORE SNAPSHOT
        setIsSavingSnapshot(true);
        await createSnippetVersion(activeSnippetId);
        setTimeout(() => setIsSavingSnapshot(false), 1000);
    };

    const handleSave = async () => {
        // Validation only
        if (!editName.trim()) return;
        // Trigger immediate save (bypassing debounce)
        hasUnsavedChanges.current = true; // Ensure logic runs
        // Actually, just let the effect handle it? Or force it.
        // Let's force it for manual actions (like Enter key or closing)
        try {
            await saveSnippet({
                id: activeSnippetId,
                name: editName.trim(),
                content: editContent,
                tags: editTags,
                collectionId: editCollectionId
            });
            setSaveStatus('saved');
            hasUnsavedChanges.current = false;
        } catch (e) { setSaveStatus('error'); }
    };

    const handleLaunchSnippet = (snippet, llm, e) => {
        flushSnippetSave(); // FLUSH BEFORE LAUNCH
        // MODIFIER LOGIC
        const isShift = e?.shiftKey;
        const isNewChat = e?.ctrlKey || e?.metaKey;

        // Configuration Resolution
        const config = getLlmConfig(llm);
        const targetUrl = isNewChat ? config.newChatUrl : config.url;

        // If Shift is pressed, open only (no text)
        const text = isShift ? null : snippet.content;

        if (onNotification) {
            if (isNewChat) {
                onNotification(`Starting new chat in ${llm.name}...`, 'info');
            } else {
                onNotification(isShift ? `Opening ${llm.name}...` : `Launching ${llm.name}...`, 'info');
            }
        }

        incrementSnippetUsage(snippet.id);

        /* @PROTECTED_REGION START: SNIPPET_INJECTION_TRIGGER
           CRITICAL: Use ONLY injectionAPI. */
        triggerInjection({
            url: targetUrl,
            text: text,
            forceNavigate: isNewChat,
            alternativeDomains: llm.alternativeDomains || config.alternativeDomains
        }, (resp) => {
            if (resp && resp.success) {
                // success
            } else if (resp && resp.error) {
                if (onNotification) onNotification(resp.error, 'error');
            }
        });
        /* @PROTECTED_REGION END: SNIPPET_INJECTION_TRIGGER */
    };

    const handleCopySnippet = async () => {
        flushSnippetSave(); // FLUSH BEFORE COPY
        const success = await copyToClipboard(editContent);
        if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    // ... (Deletion/Bulk Handlers stay same)
    const handleDelete = (id, snippetName) => {
        const usedIn = checkSnippetUsage(snippetName);

        if (usedIn.length > 0) {
            setModalConfig({
                isOpen: true,
                title: "Snippet in use",
                message: `The snippet "@${snippetName}" is currently used in ${usedIn.length} prompt(s).\n\nWhat do you want to do?`,
                isDangerous: false,
                customButtons: [
                    {
                        label: "Cancel",
                        variant: "neutral",
                        onClick: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
                    },
                    {
                        label: "Embed Text & Delete",
                        variant: "primary",
                        onClick: () => {
                            inlineSnippetInPrompts(snippetName, snippets.find(s => s.id === id)?.content || "");
                            deleteSnippet(id);
                            if (activeSnippetId === id) setActiveSnippet(null);
                            setModalConfig(prev => ({ ...prev, isOpen: false }));
                        }
                    },
                    {
                        label: "Delete Anyway",
                        variant: "danger",
                        onClick: () => {
                            deleteSnippet(id);
                            if (activeSnippetId === id) setActiveSnippet(null);
                            setModalConfig(prev => ({ ...prev, isOpen: false }));
                        }
                    }
                ]
            });
        } else {
            setModalConfig({
                isOpen: true,
                title: "Delete Snippet?",
                message: `Permanently delete "@${snippetName}"?`,
                isDangerous: true,
                customButtons: null,
                onConfirm: () => {
                    deleteSnippet(id);
                    if (activeSnippetId === id) setActiveSnippet(null);
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                }
            });
        }
    };

    // ... rest of component logic ...



    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;

        // 1. Check Usage for all selected snippets
        const usageMap = checkBulkSnippetUsage(selectedIds);
        const usedSnippetIds = Object.keys(usageMap);
        const totalAffectedPrompts = Object.values(usageMap).reduce((acc, current) => acc + current.length, 0);

        if (usedSnippetIds.length > 0) {
            // Usage Warning Modal
            setModalConfig({
                isOpen: true,
                title: "Snippets in Use",
                message: `You are about to delete ${selectedIds.length} snippets. \n\n${usedSnippetIds.length} of them are currently used in ${totalAffectedPrompts} prompt(s). \n\nProceeding will break these references.`,
                isDangerous: true,
                customButtons: [
                    {
                        label: "Cancel",
                        variant: "neutral",
                        onClick: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
                    },
                    {
                        label: "Delete Anyway",
                        variant: "danger",
                        onClick: () => {
                            bulkDeleteSnippets(selectedIds);
                            setSelectedIds([]);
                            if (selectedIds.includes(activeSnippetId)) setActiveSnippet(null);
                            setModalConfig(prev => ({ ...prev, isOpen: false }));
                            if (onNotification) onNotification(`${selectedIds.length} snippets deleted.`, 'success');
                        }
                    }
                ]
            });
        } else {
            // Normal Confirmation
            setModalConfig({
                isOpen: true,
                title: "Delete Snippets?",
                message: `Permanently delete ${selectedIds.length} selected snippets?`,
                isDangerous: true,
                customButtons: null,
                onConfirm: () => {
                    bulkDeleteSnippets(selectedIds);
                    setSelectedIds([]);
                    if (selectedIds.includes(activeSnippetId)) setActiveSnippet(null);
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                    if (onNotification) onNotification(`${selectedIds.length} snippets deleted.`, 'success');
                }
            });
        }
    };

    const toggleSelection = (e, id) => {
        e.stopPropagation();
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const filteredSnippets = useMemo(() => {
        // Use propFilteredSnippets if available (Unified Mode), else fallback to local filtering
        let inputs = propFilteredSnippets || snippets || [];
        
        // DELAYED WRITE SHIELD: Inject local draft if it doesn't exist in the store yet
        if (activeSnippetId && Array.isArray(inputs) && !inputs.some(s => s.id === activeSnippetId)) {
            const draftSnippet = {
                id: activeSnippetId,
                name: editName || "NewSnippet",
                content: editContent || "",
                tags: editTags || [],
                collectionId: editCollectionId || null,
                isPinned: false,
                rating: 0,
                updatedAt: new Date().toISOString()
            };
            inputs = [draftSnippet, ...inputs];
        }

        if (!Array.isArray(inputs)) return [];

        return inputs.filter(s => {
            if (!s) return false;
            return (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
                (s.content || "").toLowerCase().includes(search.toLowerCase());
        });
    }, [propFilteredSnippets, snippets, search, activeSnippetId, editName, editContent, editTags, editCollectionId]);

    const allVisibleSelected = filteredSnippets.length > 0 && filteredSnippets.every(s => selectedIds.includes(s.id));
    const handleSelectAll = (e) => {
        e?.stopPropagation();
        const visibleIds = filteredSnippets.map(s => s.id);
        if (allVisibleSelected) {
            setSelectedIds(selectedIds.filter(id => !visibleIds.includes(id)));
        } else {
            setSelectedIds([...new Set([...selectedIds, ...visibleIds])]);
        }
    };

    const sortOptions = [
        { id: 'updated', label: 'Recently Updated', icon: Clock },
        { id: 'rating', label: 'Top Rated', icon: Star },
        { id: 'usage', label: 'Most Used', icon: Zap },
        { id: 'name', label: 'A-Z Name', icon: SortAsc },
    ];

    const getPreviewForSnippet = (content) => {
        try {
            const withSnippets = resolveSnippets(content, snippets);
            return compilePrompt(withSnippets, {}, []);
        } catch (e) {
            return compilePrompt(content, {}, []);
        }
    };

    return (
        <div className="flex-1 w-full flex h-full bg-bg-surface text-text-main font-sans overflow-hidden relative">

            {/* COLLAPSE/EXPAND LIST (Left Edge) */}
            {/* NOTE: Toggle buttons for sidebars are now relative to the editor wrapper for perfect adaptive alignment */}

            {/* LIST (Left) */}
            <motion.div
                initial={false}
                animate={{
                    width: isListCollapsed && activeSnippetId ? 0 : 320,
                    opacity: isListCollapsed && activeSnippetId ? 0 : 1
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="border-r border-border dark:!border-white/[0.05] flex flex-col bg-bg-surface dark:!bg-[#0d0c14] z-10 shrink-0 relative overflow-hidden"
            >
                <div className="h-14 px-4 border-b border-border flex justify-between items-center bg-bg-surface/50 dark:!bg-transparent">
                    <h2 className="font-semibold text-xs text-text-muted uppercase tracking-wider">Snippets</h2>
                    <div className="flex items-center gap-1">
                        <div className="relative">
                            <button
                                onClick={() => setShowSort(!showSort)}
                                className={`p-1.5 rounded-md transition-colors border ${showSort ? 'bg-primary/10 border-primary/20 text-primary' : 'hover:bg-bg-hover text-text-muted border-transparent'}`}
                                title="Sort Snippets"
                            >
                                <ArrowUpDown size={16} />
                            </button>

                            {showSort && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                                    <div className="absolute top-full right-0 mt-1 w-44 bg-bg-surface border border-border rounded-xl shadow-2xl z-50 p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5 dm-dropdown">
                                        <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                                            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Sort by</span>
                                        </div>
                                        {sortOptions.map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => { setSnippetSortMode(opt.id); setShowSort(false); }}
                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${snippetSortMode === opt.id ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <opt.icon size={14} className={snippetSortMode === opt.id ? 'text-primary' : 'text-text-faint'} />
                                                    {opt.label}
                                                </div>
                                                {snippetSortMode === opt.id && <Check size={12} className="text-primary" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <button onClick={handleCreate} className="p-1.5 hover:bg-bg-hover rounded-md text-primary transition-colors border border-transparent hover:border-border" title="Create new snippet">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>
                <div className="p-2 border-b border-border bg-bg/50 dark:!bg-transparent">
                    <SearchInput
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onClear={() => setSearch("")}
                        onFocus={(e) => e.target.select()}
                        placeholder="Search snippets..."
                    />
                </div>

                {/* Active Filter Bar */}
                <ActiveFilterBar
                    activeCollection={activeCollection}
                    selectedTags={selectedTags}
                    searchQuery={search}
                    onClearCollection={() => setActiveCollection(null)}
                    onRemoveTag={(tag) => setSelectedTags(prev => prev.filter(t => t !== tag))}
                    onClearSearch={() => setSearch("")}
                    onClearAll={() => {
                        setActiveCollection(null);
                        setSelectedTags([]);
                        setSearch("");
                    }}
                />

                {filteredSnippets.length > 0 && (
                    <div className="flex items-center gap-3 px-5 py-2 border-b border-border/50 bg-bg-surface/50 dark:!bg-transparent backdrop-blur-sm shrink-0 z-10">
                        <div
                            className={`pt-0.5 shrink-0 cursor-pointer group`}
                            onClick={handleSelectAll}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allVisibleSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}>
                                {allVisibleSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                            </div>
                        </div>
                        <span className="text-xs font-medium text-text-muted select-none cursor-pointer hover:text-text-main transition-colors" onClick={handleSelectAll}>
                            Select All <span className="text-text-faint font-normal">({filteredSnippets.length})</span>
                        </span>
                    </div>
                )}

                <div id="snippet-list-container" className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar pb-16">
                    {filteredSnippets.length === 0 ? (
                        <div className="p-8 text-center text-sm select-none text-text-muted">
                            {(snippets && snippets.length > 0) ? (
                                <div className="flex flex-col items-center gap-2 opacity-70">
                                    <Search size={20} className="text-text-faint mb-1" />
                                    <p className="font-medium text-text-main">No snippets match your filter.</p>
                                    <p className="text-xs text-text-muted max-w-[220px] leading-relaxed">
                                        {activeCollectionId && collections?.length > 0 && (
                                            <>Viewing collection: <span className="font-semibold text-primary">{collections.find(c => c.id === activeCollectionId)?.name || 'Unknown'}</span>. </>
                                        )}
                                        {selectedTags?.length > 0 && (
                                            <>Filtered by {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''}. </>
                                        )}
                                        {search && (
                                            <>Search: "<span className="font-semibold">{search}</span>". </>
                                        )}
                                    </p>
                                    {(search || (selectedTags && selectedTags.length > 0)) && (
                                        <button
                                            onClick={() => { setSelectedTags([]); setSearch(""); }}
                                            className="mt-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-all"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <span className="opacity-50">No snippets created yet.</span>
                            )}
                        </div>
                    ) : (
                        filteredSnippets.map(s => {
                            const isSelected = selectedIds.includes(s.id);
                            const isDropdownOpen = activeMenuId === s.id || backlinkDropdownOpen === s.id || collectionDropdownOpen === s.id || (tagEditorConfig.isOpen && tagEditorConfig.ids.includes(s.id)) || usagePopupSnippet?.id === s.id;
                            return (
                                <div
                                    key={s.id}
                                    id={`snippet-card-${s.id}`}
                                    onClick={() => handleEdit(s)}
                                    className={`group relative p-3 rounded-lg cursor-pointer border transition-all
                                        ${s.isPinned ? 'pinned-item shadow-sm' : ''}
                                        ${activeSnippetId === s.id
                                            ? 'bg-bg-hover border-primary/40 shadow-sm'
                                            : isDropdownOpen
                                                ? 'bg-bg-hover shadow-sm border-border'
                                                : isSelected
                                                    ? 'bg-primary/5 border-primary/20'
                                                    : 'border-transparent hover:bg-bg-hover hover:border-border'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`pt-0.5 shrink-0 ${(!isSelected && !isDropdownOpen) ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity`}
                                            onClick={(e) => toggleSelection(e, s.id)}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}>
                                                {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                                            </div>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 pr-20">
                                                        {s.isPinned && <Pin size={10} className="text-primary fill-primary shrink-0" />}
                                                        <span className="text-snippet-accent dark:text-amber-400 font-mono text-sm font-bold truncate min-w-0" title={s.name}>@{s.name}</span>
                                                        {snippetRefCounts[s.id] > 0 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setUsagePopupSnippet({
                                                                        id: s.id,
                                                                        name: s.name,
                                                                        usages: checkSnippetUsage(s.name),
                                                                        anchorRect: {
                                                                            top: rect.top,
                                                                            left: rect.left,
                                                                            bottom: rect.bottom,
                                                                            right: rect.right,
                                                                            width: rect.width,
                                                                            height: rect.height
                                                                        }
                                                                    });
                                                                }}
                                                                className="ml-1 text-[10px] text-text-faint hover:text-primary transition-colors select-none font-normal shrink-0"
                                                                title={`Used in ${snippetRefCounts[s.id]} prompt(s)`}
                                                            >
                                                                ({snippetRefCounts[s.id]})
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-1 pr-20">
                                                        <Rating
                                                            value={s.rating || 0}
                                                            size={10}
                                                            onChange={(val) => setSnippetRating(s.id, val)}
                                                        />

                                                        {/* Backlinks Indicator (compact) */}
                                                        {backlinks[s.id] && backlinks[s.id].length > 0 && (
                                                            <div className="relative ml-auto flex items-center gap-1">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (backlinkDropdownOpen !== s.id) {
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                                            
                                                                            let left = rect.left;
                                                                            if (left + 176 > window.innerWidth) { // 176px is w-44
                                                                                left = window.innerWidth - 176 - 16;
                                                                            }
                                                                            
                                                                            setBacklinkPopupPos({
                                                                                left: left,
                                                                                ...(isFlipped 
                                                                                    ? { bottom: window.innerHeight - rect.top + 4 } 
                                                                                    : { top: rect.bottom + 4 })
                                                                            });
                                                                            setBacklinkDropdownOpen(s.id);
                                                                        } else {
                                                                            setBacklinkDropdownOpen(null);
                                                                        }
                                                                    }}
                                                                    className={`p-1 rounded hover:bg-bg-hover transition-all text-text-muted hover:text-primary relative group/backlink ${backlinkDropdownOpen === s.id ? 'bg-bg-elevated text-primary' : ''}`}
                                                                    title={`${backlinks[s.id].length} References`}
                                                                >
                                                                    <BookOpen size={12} />
                                                                    {backlinks[s.id].length > 0 && (
                                                                        <span className="absolute -top-1 -right-1 bg-bg-elevated text-[8px] px-0.5 rounded border border-border">
                                                                            {backlinks[s.id].length}
                                                                        </span>
                                                                    )}
                                                                </button>

                                                                {/* Backlink Dropdown */}
                                                                {backlinkDropdownOpen === s.id && createPortal(
                                                                    <div className="portal-root">
                                                                        <div
                                                                            className="fixed inset-0 z-[9998]"
                                                                            onClick={(e) => { e.stopPropagation(); setBacklinkDropdownOpen(null); }}
                                                                        ></div>
                                                                        <div
                                                                            className="fixed bg-bg-surface border border-border rounded-lg shadow-2xl z-[9999] p-1.5 animate-in fade-in slide-in-from-top-1 duration-150 w-44 dm-dropdown"
                                                                            style={backlinkPopupPos}
                                                                        >
                                                                            <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center bg-bg-surface sticky top-0 z-10">
                                                                                <span className="text-[9px] font-bold text-text-faint uppercase tracking-wider">Referenced in</span>
                                                                            </div>
                                                                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                                                {backlinks[s.id].map(link => (
                                                                                    <button
                                                                                        key={link.id}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            if (link.type === 'prompt' && onOpenPromptNote) {
                                                                                                onOpenPromptNote(link.id, link.stepId);
                                                                                            } else if (link.type === 'snippet') {
                                                                                                if (onNavigate) onNavigate({ type: 'snippet', id: link.id, tab: 'notes' });
                                                                                                else {
                                                                                                    setActiveSnippet(link.id);
                                                                                                    setActiveTab('notes');
                                                                                                    setIsDetailsCollapsed(false);
                                                                                                }
                                                                                            } else if (onOpenKnowledgeTile) {
                                                                                                onOpenKnowledgeTile(link.id);
                                                                                            }
                                                                                            setBacklinkDropdownOpen(null);
                                                                                        }}
                                                                                        className="w-full text-left px-2 py-1.5 rounded text-xs text-text-main hover:bg-bg-hover hover:text-primary truncate flex items-center gap-2"
                                                                                        title={`${link.type === 'prompt' ? 'Prompt Note' : link.type === 'snippet' ? 'Snippet Note' : 'KB Tile'}: ${link.title}`}
                                                                                    >
                                                                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded shadow-sm border ${link.type === 'prompt' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
                                                                                            link.type === 'snippet' ? 'bg-snippet-bg-subtle text-snippet-accent dark:text-amber-400 dark:bg-amber-500/10 border-amber-500/20' :
                                                                                                'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                                                                            }`}>
                                                                                            {link.type === 'prompt' ? 'PROMPT' : link.type === 'snippet' ? 'SNIP' : 'KB'}
                                                                                        </span>
                                                                                        <span className="truncate">{link.title}</span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>,
                                                                    document.body
                                                                )}
                                                            </div>
                                                        )}


                                                        {/* Collection Selector (compact) similar to PromptList */}
                                                        <div className={`relative flex items-center gap-2 ${!(backlinks[s.id] && backlinks[s.id].length > 0) ? 'ml-auto' : ''}`}>

                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (collectionDropdownOpen === s.id) {
                                                                        setCollectionDropdownOpen(null);
                                                                    } else {
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                                        
                                                                        setCollectionPopupPos({
                                                                            right: window.innerWidth - rect.right,
                                                                            ...(isFlipped 
                                                                                ? { bottom: window.innerHeight - rect.top + 4 } 
                                                                                : { top: rect.bottom + 4 })
                                                                        });
                                                                        setCollectionDropdownOpen(s.id);
                                                                    }
                                                                }}
                                                                className="p-1 rounded hover:bg-bg-hover transition-all group/col"
                                                                title={s.collectionId
                                                                    ? `In: ${collections.find(c => c.id === s.collectionId)?.name}`
                                                                    : 'Add to Collection'
                                                                }
                                                            >
                                                                <div className="flex items-center gap-1">
                                                                    <Folder size={12} className={s.collectionId ? 'text-text-main' : 'text-text-faint'} />
                                                                    <div
                                                                        className={`w-1.5 h-1.5 rounded-full transition-all ${s.collectionId ? 'opacity-100' : 'opacity-0'}`}
                                                                        style={{ backgroundColor: s.collectionId ? (collections.find(c => c.id === s.collectionId)?.color || '#6366f1') : 'transparent' }}
                                                                    ></div>
                                                                </div>
                                                            </button>

                                                            {/* Collection Dropdown */}
                                                            {collectionDropdownOpen === s.id && (
                                                                <>
                                                                    <div
                                                                        className="fixed inset-0 z-[998]"
                                                                        onClick={(e) => { e.stopPropagation(); setCollectionDropdownOpen(null); setIsCreatingCollection(false); setNewCollectionName(""); }}
                                                                    ></div>
                                                                    <div 
                                                                        className="fixed w-44 bg-bg-surface border border-border rounded-xl shadow-2xl z-[999] p-1 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                                                        style={collectionPopupPos}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center bg-bg-surface sticky top-0 z-10">
                                                                            <span className="text-[9px] font-bold text-text-faint uppercase tracking-wider">Collections</span>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                                                                                className="p-1 hover:bg-bg-hover rounded text-primary"
                                                                                title="New Collection"
                                                                            >
                                                                                <Plus size={12} />
                                                                            </button>
                                                                        </div>

                                                                        {isCreatingCollection && (
                                                                            <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                                                                                <div className="flex items-center gap-1">
                                                                                    <input
                                                                                        autoFocus
                                                                                        className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                                                                                        placeholder="Name..."
                                                                                        value={newCollectionName}
                                                                                        onChange={e => setNewCollectionName(e.target.value)}
                                                                                        onKeyDown={async (e) => {
                                                                                            if (e.key === 'Enter' && newCollectionName.trim()) {
                                                                                                e.stopPropagation();
                                                                                                const newId = crypto.randomUUID();
                                                                                                await saveCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                                                                await saveSnippet({ ...s, collectionId: newId });
                                                                                                setNewCollectionName("");
                                                                                                setIsCreatingCollection(false);
                                                                                                setCollectionDropdownOpen(null);
                                                                                            }
                                                                                        }}
                                                                                    />
                                                                                    <button
                                                                                        className="p-1 hover:text-red-400"
                                                                                        onClick={() => setIsCreatingCollection(false)}
                                                                                    >
                                                                                        <X size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    saveSnippet({ ...s, collectionId: null });
                                                                                    setCollectionDropdownOpen(null);
                                                                                }}
                                                                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${!s.collectionId
                                                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                                                    : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                                    }`}
                                                                            >
                                                                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                                                <span>None (Uncategorized)</span>
                                                                                {!s.collectionId && <Check size={10} className="ml-auto" />}
                                                                            </button>
                                                                            {collections.map(col => (
                                                                                <button
                                                                                    key={col.id}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        saveSnippet({ ...s, collectionId: col.id });
                                                                                        setCollectionDropdownOpen(null);
                                                                                    }}
                                                                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${s.collectionId === col.id
                                                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                                                        : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                                        }`}
                                                                                >
                                                                                    <div
                                                                                        className="w-2 h-2 rounded-full"
                                                                                        style={{ backgroundColor: col.color || '#6366f1' }}
                                                                                    ></div>
                                                                                    <span className="truncate">{col.name}</span>
                                                                                    {s.collectionId === col.id && <Check size={12} className="ml-auto" />}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* TAGS ROW */}
                                                    {s.tags && s.tags.length > 0 && (
                                                        <div className="mt-1.5">
                                                            <DynamicTagList tags={s.tags} maxTagWidth={80} />
                                                        </div>
                                                    )}

                                                    <div className="text-xs text-text-muted truncate font-mono opacity-60 group-hover:opacity-90 transition-opacity mt-1">
                                                        {s.content ? (() => {
                                                            let previewTxt = getPreviewForSnippet(s.content).trim();
                                                            // Collapse Base64 images to a tidy label before truncating
                                                            previewTxt = previewTxt.replace(/!\[(.*?)\]\(data:image\/[^)]*\)/g, '[Image: $1]');
                                                            return previewTxt ? (previewTxt.length > 300 ? previewTxt.slice(0, 300) + "..." : previewTxt) : "Empty...";
                                                        })() : "Empty..."}
                                                    </div>
                                                </div>
                                                <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
                                                    {/* 3-PUNKTE MENÜ */}
                                                    <div className="relative">
                                                        <button
                                                            id={`snippet-menu-btn-${s.id}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (activeMenuId === s.id) {
                                                                    setActiveMenuId(null);
                                                                } else {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const isFlipped = (window.innerHeight - rect.bottom) < 200;
                                                                    
                                                                    setMenuPopupPos({
                                                                        right: window.innerWidth - rect.right,
                                                                        ...(isFlipped 
                                                                            ? { bottom: window.innerHeight - rect.top + 4 } 
                                                                            : { top: rect.bottom + 4 })
                                                                    });
                                                                    setActiveMenuId(s.id);
                                                                }
                                                            }}
                                                            className="p-1.5 text-text-faint hover:text-text-main hover:bg-bg-hover rounded-md transition-all"
                                                        >
                                                            <MoreVertical size={14} />
                                                        </button>

                                                        {activeMenuId === s.id && createPortal(
                                                            <div className="portal-root">
                                                                <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}></div>
                                                                <div 
                                                                    className="fixed w-40 bg-bg-surface border border-border shadow-2xl rounded-xl p-1 z-[9999] animate-in fade-in zoom-in-95 duration-150 dm-dropdown" 
                                                                    style={menuPopupPos} 
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const elm = document.getElementById(`snippet-menu-btn-${s.id}`);
                                                                        const rect = elm ? elm.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                                                                        setTagEditorConfig({
                                                                            isOpen: true,
                                                                            ids: [s.id],
                                                                            isBulk: false,
                                                                            initialTags: s.tags || [],
                                                                            anchorRect: {
                                                                                top: rect.top,
                                                                                bottom: rect.bottom,
                                                                                left: rect.left,
                                                                                right: rect.right,
                                                                                width: rect.width,
                                                                                height: rect.height
                                                                            }
                                                                        });
                                                                        setActiveMenuId(null);
                                                                    }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                                                                >
                                                                    <Tag size={12} /> Tags
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        toggleSnippetPin(s.id); 
                                                                        setActiveMenuId(null); 
                                                                    }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                                                                >
                                                                    <Pin size={12} className={s.isPinned ? 'text-amber-500' : ''} /> {s.isPinned ? 'Unpin' : 'Pin to top'}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        handleDelete(s.id, s.name); 
                                                                        setActiveMenuId(null); 
                                                                    }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all flex items-center gap-2"
                                                                >
                                                                    <Trash2 size={12} /> Delete
                                                                </button>
                                                                </div>
                                                            </div>,
                                                            document.body
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <BulkActionBar
                    selectedCount={selectedIds.length}
                    onClearSelection={() => setSelectedIds([])}
                    onDelete={handleBulkDelete}
                    onAddTags={() => setTagEditorConfig({ isOpen: true, ids: selectedIds, isBulk: true, initialTags: [] })}
                    onAddToCollection={() => setCollectionDropdownOpen('BULK')}
                />

                {/* BULK COLLECTION DROPDOWN OVERLAY */}
                {collectionDropdownOpen === 'BULK' && selectedIds.length > 0 && (
                    <>
                        <div className="fixed inset-0 z-[998]" onClick={() => { setCollectionDropdownOpen(null); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
                        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-64 bg-bg-surface border border-border rounded-xl shadow-2xl z-[999] p-1 animate-in fade-in slide-in-from-bottom-2 duration-150 dm-dropdown">
                            <div className="px-3 py-2 border-b border-border/50 font-bold text-xs text-text-muted uppercase tracking-wider mb-1 flex justify-between items-center">
                                <span>Move {selectedIds.length} items to...</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                                    className="p-1 hover:bg-bg-hover rounded text-primary"
                                    title="New Collection"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>

                            {isCreatingCollection && (
                                <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                        <input
                                            autoFocus
                                            className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                                            placeholder="Name..."
                                            value={newCollectionName}
                                            onChange={e => setNewCollectionName(e.target.value)}
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter' && newCollectionName.trim()) {
                                                    e.stopPropagation();
                                                    const newId = crypto.randomUUID();
                                                    // Use prop if available, else store
                                                    const saver = onCreateCollection || saveCollection;
                                                    await saver({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                    bulkAssignSnippetsToCollection(selectedIds, newId);
                                                    setNewCollectionName("");
                                                    setIsCreatingCollection(false);
                                                    setCollectionDropdownOpen(null);
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                        <button
                                            className="p-1 hover:text-red-400"
                                            onClick={() => setIsCreatingCollection(false)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
                                <button
                                    onClick={() => {
                                        bulkAssignSnippetsToCollection(selectedIds, null);
                                        setCollectionDropdownOpen(null);
                                        setSelectedIds([]);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors text-left"
                                >
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-400"></div>
                                    <span>Uncategorized</span>
                                </button>
                                <div className="h-px bg-border my-1"></div>
                                {collections.map(col => (
                                    <button
                                        key={col.id}
                                        onClick={() => {
                                            bulkAssignSnippetsToCollection(selectedIds, col.id);
                                            setCollectionDropdownOpen(null);
                                            setSelectedIds([]);
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-main transition-colors text-left"
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                                        <span className="truncate">{col.name}</span>
                                    </button>
                                ))}

                            </div>
                        </div>
                    </>
                )}
            </motion.div>

            <TagEditorPopover
                isOpen={tagEditorConfig.isOpen}
                onClose={() => setTagEditorConfig({ ...tagEditorConfig, isOpen: false })}
                onSave={(tags, mode) => {
                    if (tagEditorConfig.isBulk) {
                        bulkUpdateSnippetTags(tagEditorConfig.ids, tags, mode);
                        setSelectedIds([]);
                    } else {
                        bulkUpdateSnippetTags(tagEditorConfig.ids, tags, 'replace');
                    }
                }}
                initialTags={tagEditorConfig.initialTags}
                availableTags={(tags || []).map(t => t.name)}
                isBulk={tagEditorConfig.isBulk}
                anchorRect={tagEditorConfig.anchorRect}
            />

            {/* EDITOR (Middle) & DETAILS (Right) SPLIT - continues... */}

            <div className={`flex-1 flex min-w-0 relative h-full ${useZenLook ? 'justify-center overflow-y-auto custom-scrollbar bg-bg' : ''}`}>
                {/* TOGGLE SNIPPETS (Left Edge of Wrapper) */}
                {activeSnippetId && (
                    <button
                        onClick={() => {
                            const next = !isListCollapsed;
                            setIsListCollapsed(next);
                            if (!next && isZenMode && setIsZenMode) setIsZenMode(false);
                        }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1 bg-border/40 hover:bg-primary hover:text-white rounded-r-md transition-all shadow-md backdrop-blur-sm"
                        title={isListCollapsed ? "Show Snippets" : "Hide Snippets"}
                    >
                        {isListCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                )}

                {/* MIDDLE COLUMN: EDITOR */}
                <motion.div
                    layout
                    className={`flex-1 flex flex-col bg-bg border-r border-border min-w-0 h-full relative ${useZenLook && activeSnippetId ? 'max-w-[850px] border-x shadow-2xl z-20 bg-bg-surface' : ''}`}
                >
                    {activeSnippetId ? (
                        <>
                            <header className="h-14 border-b border-border bg-bg-surface shrink-0 flex items-center justify-between px-6 gap-4">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-snippet-accent dark:text-amber-400 font-mono text-lg font-bold select-none">@</span>
                                    <input
                                        ref={nameInputRef}
                                        value={editName}
                                        onChange={e => updateEditState(setEditName, e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        onBlur={handleNameBlur}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.target.blur(); // Triggers handleNameBlur → rename modal
                                            }
                                        }}
                                        className="bg-transparent text-lg font-bold text-text-main focus:outline-none w-full placeholder:text-text-muted/50 truncate"
                                        placeholder="SnippetName"
                                        title={editName}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 min-w-[80px] justify-end transition-all select-none mr-2">
                                        {saveStatus === 'saving' && (
                                            <span className="text-xs font-medium text-text-muted animate-pulse">Saving...</span>
                                        )}
                                        {saveStatus === 'saved' && (
                                            <div className="flex items-center gap-1.5 animate-in fade-in duration-300">
                                                <Check size={14} className="text-emerald-500" strokeWidth={3} />
                                                <span className="text-xs font-medium text-emerald-500">Saved</span>
                                            </div>
                                        )}
                                        {saveStatus === 'error' && (
                                            <span className="text-xs font-medium text-red-500">Error</span>
                                        )}
                                    </div>

                                    <ToolbarButton
                                        variant="elevated"
                                        isActive={isPreviewMode}
                                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                                        title={isPreviewMode ? "Switch to Edit Mode" : "Switch to Preview Mode"}
                                        className="mr-1"
                                    >
                                        {isPreviewMode ? <><Eye size={14} /> Active</> : <><EyeOff size={14} /> Preview</>}
                                    </ToolbarButton>

                                    <ToolbarButton
                                        variant="ghost"
                                        isActive={isZenMode}
                                        onClick={onToggleZenMode}
                                        title="Zen Mode (Alt+Shift+Z)"
                                    >
                                        <Maximize size={18} />
                                    </ToolbarButton>

                                    <ToolbarButton
                                        variant="ghost"
                                        isActive={isSavingSnapshot}
                                        activeClass="text-emerald-500 bg-emerald-500/10"
                                        onClick={handleTakeSnapshot}
                                        disabled={isSavingSnapshot}
                                        title="Create Snapshot"
                                        className="group hover:text-primary hover:bg-primary/5"
                                    >
                                        {isSavingSnapshot ? <Check size={18} /> : <Save size={18} className="group-hover:brightness-110" />}
                                    </ToolbarButton>

                                    <div className="relative" ref={moreMenuRef}>
                                        <ToolbarButton
                                            variant="ghost"
                                            isActive={showMoreMenu || isExportingImg}
                                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                                            disabled={isExportingImg}
                                            title="More Actions"
                                            className="group hover:text-primary hover:bg-primary/5"
                                        >
                                            {isExportingImg ? <span className="animate-pulse font-mono text-[10px]">...</span> : <MoreVertical size={18} className="group-hover:scale-110 transition-transform" />}
                                        </ToolbarButton>

                                        {showMoreMenu && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)}></div>
                                                <div className="absolute right-0 top-full mt-2 w-56 bg-bg-surface border border-border shadow-2xl rounded-xl z-50 p-1 animate-in fade-in slide-in-from-top-2 duration-200 dm-dropdown">
                                                    <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center">
                                                        <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Snippet Actions</span>
                                                        <button onClick={() => setShowMoreMenu(false)} className="text-text-muted hover:text-text-main p-0.5 rounded hover:bg-bg-hover transition-colors">
                                                            <X size={12} />
                                                        </button>
                                                    </div>

                                                    <button onClick={() => { handleDownloadJson(); setShowMoreMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors group">
                                                        <div className="flex items-center gap-2.5">
                                                            <FileJson size={14} className="group-hover:text-primary transition-colors" />
                                                            <span>Export JSON</span>
                                                        </div>
                                                    </button>

                                                    <button onClick={() => { handleDownloadImage(); setShowMoreMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors group">
                                                        <div className="flex items-center gap-2.5">
                                                            <ImageIcon size={14} className="group-hover:text-emerald-400 transition-colors" />
                                                            <span>Export PNG</span>
                                                        </div>
                                                    </button>

                                                    <div className="h-px bg-border my-1"></div>

                                                    <button
                                                        onClick={async () => {
                                                            setShowMoreMenu(false);
                                                            const newId = await usePromptStore.getState().convertSnippetToPrompt(activeSnippetId);
                                                            if (newId) {
                                                                window.dispatchEvent(new CustomEvent('NAVIGATE_TO', { detail: { type: 'prompt', id: newId } }));
                                                                if (onNotification) onNotification("Converted to Prompt successfully!", "success");
                                                            }
                                                        }}
                                                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <FileText size={14} className="text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                                                            <span className="text-indigo-400 group-hover:text-indigo-300">Convert to Prompt</span>
                                                        </div>
                                                    </button>

                                                    <div className="h-px bg-border my-1"></div>

                                                    <button onClick={() => { handleDelete(activeSnippetId, editName); setShowMoreMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-red-500/10 text-red-400 hover:text-red-500 transition-colors group">
                                                        <div className="flex items-center gap-2.5">
                                                            <Trash2 size={14} />
                                                            <span>Delete Snippet</span>
                                                        </div>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>


                                </div>
                            </header>

                            {/* EDITOR SETTINGS BAR (Tags & Collection) */}
                            <div className="border-b border-border bg-bg-surface/50 px-6 py-2 flex flex-wrap items-center gap-4">
                                <div className="flex items-start gap-1.5 shrink-0 max-w-full">
                                    <TagInput
                                        tags={editTags}
                                        onChange={(newTags) => updateEditState(setEditTags, newTags)}
                                        availableTags={(tags || []).map(t => t.name)}
                                        placeholder="Add tag..."
                                    />
                                    <button
                                        onClick={() => setIsMultiTaggerOpen(true)}
                                        className="p-2.5 rounded-lg bg-bg-surface border border-border text-text-muted hover:text-primary hover:border-primary hover:bg-primary/5 transition-all shadow-sm group"
                                        title="Open Multi-Tagger"
                                    >
                                        <Tags size={16} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 border-l border-border pl-4">
                                    <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Collection:</span>
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={(e) => {
                                                if (!showCollectionMenu) {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                    
                                                    let leftPos = rect.left;
                                                    // Guard: Verhindert Clipping rechts. w-52 ist 208px. + 16px Abstandshalter
                                                    if (leftPos + 208 > window.innerWidth - 16) {
                                                        leftPos = window.innerWidth - 208 - 16;
                                                    }
                                                    
                                                    setEditorCollectionPopupPos({
                                                        left: leftPos,
                                                        ...(isFlipped 
                                                            ? { bottom: window.innerHeight - rect.top + 4 } 
                                                            : { top: rect.bottom + 4 })
                                                    });
                                                }
                                                setShowCollectionMenu(!showCollectionMenu);
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-bg-surface hover:border-primary text-xs font-medium transition-all group"
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: collections.find(c => c.id === editCollectionId)?.color || '#9ca3af' }}
                                            ></div>
                                            <span className="text-text-main">
                                                {collections.find(c => c.id === editCollectionId)?.name || 'None'}
                                            </span>
                                            <ChevronDown size={12} className="text-text-muted group-hover:text-primary" />
                                        </button>

                                        {showCollectionMenu && createPortal(
                                            <div className="portal-root">
                                                <div className="fixed inset-0 z-[9998]" onClick={() => { setShowCollectionMenu(false); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
                                                <div 
                                                    className="fixed w-52 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                                    style={editorCollectionPopupPos}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center bg-bg-surface sticky top-0 z-10">
                                                        <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Move to</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                                                            className="p-1 hover:bg-bg-hover rounded text-primary"
                                                            title="New Collection"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>

                                                    {isCreatingCollection && (
                                                        <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    autoFocus
                                                                    className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                                                                    placeholder="Name..."
                                                                    value={newCollectionName}
                                                                    onChange={e => setNewCollectionName(e.target.value)}
                                                                    onKeyDown={async (e) => {
                                                                        if (e.key === 'Enter' && newCollectionName.trim()) {
                                                                            e.stopPropagation();
                                                                            const newId = crypto.randomUUID();
                                                                            await saveCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                                            setEditCollectionId(newId);
                                                                            setNewCollectionName("");
                                                                            setIsCreatingCollection(false);
                                                                            setShowCollectionMenu(false);
                                                                        }
                                                                    }}
                                                                />
                                                                <button className="p-1 hover:text-red-400" onClick={() => setIsCreatingCollection(false)}>
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                        <button
                                                            onClick={() => {
                                                                setEditCollectionId(null);
                                                                setShowCollectionMenu(false);
                                                            }}
                                                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${!editCollectionId
                                                                ? 'bg-primary/10 text-primary font-semibold'
                                                                : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                }`}
                                                        >
                                                            <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0"></div>
                                                            <span>None (Uncategorized)</span>
                                                            {!editCollectionId && <Check size={12} className="ml-auto shrink-0" />}
                                                        </button>
                                                        {collections.map(col => (
                                                            <button
                                                                key={col.id}
                                                                onClick={() => {
                                                                    updateEditState(setEditCollectionId, col.id);
                                                                    setShowCollectionMenu(false);
                                                                }}
                                                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${editCollectionId === col.id
                                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                                    : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                    }`}
                                                            >
                                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                                                                <span className="truncate">{col.name}</span>
                                                                {editCollectionId === col.id && <Check size={12} className="ml-auto shrink-0" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col overflow-hidden bg-bg">
                                {isPreviewMode ? (
                                    <div className="flex-1 w-full p-4 overflow-y-auto custom-scrollbar bg-bg-surface">
                                        <div className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-text-main">
                                            {formatLeanText(getPreviewForSnippet(editContent), onOpenKnowledgeTile) || <span className="text-text-muted italic">Empty snippet...</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <PromptEditor
                                        value={editContent}
                                        isDarkMode={isDarkMode}
                                        onChange={(val) => {
                                            lastTypedSnippetContent.current = val;
                                            updateEditState(setEditContent, val, true); // Pass true to activate typing shield
                                        }}
                                        snippets={snippets}
                                        allowAttachments={false}
                                        onNotification={onNotification}
                                    />
                                )}

                                {/* --- DEZENTE HELPER BAR IM EDITOR (IDE Status Bar) --- */}
                                {!isPreviewMode && (
                                    <div className="bg-bg-surface/30 border-t border-border py-1 px-6 text-[10px] text-text-faint flex justify-between items-center shrink-0 select-none">
                                        {/* Anfänger-Hilfe (Links) */}
                                        <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity truncate pr-4">
                                            Tip: Use <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">{"{{var}}"}</code> for inputs, <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">{"{{file: doc}}"}</code> for attachments, and <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">@</code> for Snippets.
                                        </span>

                                        {/* Power-User Cheat-Sheet (Rechts) */}
                                        <div
                                            className="flex items-center gap-1 opacity-50 hover:opacity-100 hover:text-text-main transition-colors cursor-help shrink-0"
                                            title={"ADVANCED SYNTAX:\n• Required: {{!Variable}}\n• Dropdowns: {{Variable: Option 1 | Option 2}}\n• System Macros: {{$date}}, {{$time}}, {{$day}}, {{$uuid}}, {{$language}}\n• Hidden Comments: %% Your note %%"}
                                        >
                                            <HelpCircle size={12} />
                                            <span>Advanced</span>
                                        </div>
                                    </div>
                                )}

                                <div className="py-2 px-6 border-t border-border bg-bg-surface flex justify-between items-center text-xs text-text-muted shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transition-all duration-300 group/llmbar">
                                    <div className="flex-1 min-w-0 flex flex-nowrap items-center gap-2 overflow-hidden">
                                        {llms && llms.length > 0 && (
                                            <>
                                                <LlmInjectLabel context="step" />
                                                
                                                {/* --- START: HORIZONTAL SCROLL CONTAINER --- */}
                                                <div className="flex-1 min-w-0 relative group/snippet-llm flex items-center h-8">
                                                    <AnimatePresence>
                                                        {snippetLlmScroll.left && (
                                                            <motion.button
                                                                initial={{ opacity: 0, x: -5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: -5 }}
                                                                onClick={(e) => { e.stopPropagation(); scrollSnippetLlmBar('left'); }}
                                                                className="absolute left-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)] text-text-faint hover:text-primary transition-colors cursor-pointer"
                                                            >
                                                                <ChevronLeft size={14} strokeWidth={2.5} />
                                                            </motion.button>
                                                        )}
                                                    </AnimatePresence>

                                                    <div 
                                                        ref={snippetLlmScrollRef}
                                                        onWheel={handleSnippetLlmWheel}
                                                        onScroll={updateSnippetLlmScroll}
                                                        className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth h-full"
                                                        style={{
                                                            maskImage: snippetLlmScroll.right 
                                                                ? 'linear-gradient(to right, black 85%, transparent 100%)' 
                                                                : snippetLlmScroll.left 
                                                                    ? 'linear-gradient(to left, black 85%, transparent 100%)' 
                                                                    : 'none'
                                                        }}
                                                    >
                                                        {llms.map(llm => (
                                                            <LlmIconButton 
                                                                key={llm.id} 
                                                                size="sm" 
                                                                llm={llm} 
                                                                onClick={(e) => handleLaunchSnippet({ id: activeSnippetId, content: editContent }, llm, e)} 
                                                                tooltip={getInjectionTooltip(llm.name, `@${editName}`)} 
                                                            />
                                                        ))}
                                                    </div>

                                                    <AnimatePresence>
                                                        {snippetLlmScroll.right && (
                                                            <motion.button
                                                                initial={{ opacity: 0, x: 5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: 5 }}
                                                                onClick={(e) => { e.stopPropagation(); scrollSnippetLlmBar('right'); }}
                                                                className="absolute right-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.5)] text-text-faint hover:text-primary transition-colors cursor-pointer"
                                                            >
                                                                <ChevronRight size={14} strokeWidth={2.5} />
                                                            </motion.button>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                                {/* --- END: HORIZONTAL SCROLL CONTAINER --- */}
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 h-8">
                                        <button
                                            onClick={handleCopySnippet}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${isCopied ? 'text-emerald-500 bg-emerald-500/10' : 'hover:bg-bg-hover text-text-muted hover:text-primary'}`}
                                            title="Copy Snippet Content"
                                        >
                                            {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                            <span className="text-[10px] font-medium">{isCopied ? 'Copied!' : 'Copy'}</span>
                                        </button>
                                        <div className="text-[10px] text-text-faint font-mono flex items-center">
                                            {editContent.length} chars
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-text-muted flex-col gap-4 select-none">
                            <div className="p-6 bg-bg-elevated/50 rounded-full border border-border/50">
                                <Blocks size={48} className="text-text-muted opacity-20" strokeWidth={1.5} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-text-main">Snippet Library</p>
                                <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto leading-relaxed">Select a snippet to edit using the sidebar on the left.<br />Or create a new one.</p>
                            </div>
                            <button onClick={handleCreate} className="mt-2 px-4 py-2 bg-bg-elevated hover:bg-bg-surface border border-border rounded-lg text-xs font-medium transition-all hover:border-primary/50">Create new Snippet</button>
                        </div>
                    )}
                </motion.div>

                {/* TOGGLE DETAILS (Right Edge of Wrapper) */}
                {activeSnippetId && (
                    <button
                        onClick={() => {
                            const next = !isDetailsCollapsed;
                            setIsDetailsCollapsed(next);
                            if (!next && isZenMode && setIsZenMode) setIsZenMode(false);
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 p-1 bg-border/40 hover:bg-primary hover:text-white rounded-l-md transition-all shadow-md backdrop-blur-sm"
                        title={isDetailsCollapsed ? "Show Details" : "Hide Details"}
                    >
                        {isDetailsCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                )}
            </div>

            {/* RIGHT COLUMN: DETAILS & ACTIONS */}
            <AnimatePresence>
                {activeSnippetId && !isDetailsCollapsed && (
                    <motion.aside
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 288, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="bg-bg-surface flex-shrink-0 flex flex-col border-l border-border z-10 shadow-2xl relative overflow-hidden h-full"
                    >
                        {/* 1. TAB NAVIGATION (Matching Prompt Inspector) */}
                        <div className="flex border-b border-border bg-bg-surface select-none overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`flex-1 min-w-[80px] py-4 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'details'
                                    ? 'border-primary text-primary bg-bg-surface'
                                    : 'border-transparent text-text-muted hover:text-text-main hover:bg-bg-hover'
                                    }`}
                            >
                                <Sparkles size={14} />
                                <span>Details</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('notes')}
                                className={`relative flex-1 min-w-[80px] py-4 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'notes'
                                    ? 'border-primary text-primary bg-bg-surface'
                                    : 'border-transparent text-text-muted hover:text-text-main hover:bg-bg-hover'
                                    }`}
                            >
                                <div className="relative inline-flex">
                                    <StickyNote size={14} />
                                    {Boolean(snippets.find(s => s.id === activeSnippetId)?.notes?.trim()) && (
                                        <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_rgba(99,102,241,0.5)]"></span>
                                    )}
                                </div>
                                <span>Notes</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex-1 min-w-[80px] py-4 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'history'
                                    ? 'border-primary text-primary bg-bg-surface'
                                    : 'border-transparent text-text-muted hover:text-text-main hover:bg-bg-hover'
                                    }`}
                            >
                                <History size={14} />
                                <span>History</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden relative flex flex-col">
                            {activeTab === 'details' ? (
                                <div className="p-5 animate-fade-in flex flex-col flex-1 min-h-0 gap-6">
                                    {/* Section: Variables */}
                                    <div className="space-y-3 shrink-0">
                                        <h4 className="text-[11px] font-bold text-text-main uppercase tracking-widest flex items-center gap-2">
                                            <Sparkles size={12} className="text-primary" /> Variables in Snippet
                                        </h4>
                                        {detectedVars.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {detectedVars.map(v => (
                                                    <span key={v} className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        {v}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-text-muted italic opacity-70 leading-relaxed">
                                                No placeholders found. Use <code className="text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded">{"{{variable}}"}</code> to add dynamic fields to your snippet.
                                            </p>
                                        )}
                                    </div>

                                    {/* Section: Usage */}
                                    <div className="flex shrink min-h-[120px] flex-col space-y-3">
                                        <h4 className="shrink-0 text-[11px] font-bold text-text-main uppercase tracking-widest flex items-center gap-2">
                                            <LayoutGrid size={12} className="text-text-muted" /> Used in Prompts
                                        </h4>
                                        {usageList.length > 0 ? (
                                            <div className="overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0 space-y-1.5">
                                                {usageList.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => { setActivePrompt(p.id); if (onViewChange) onViewChange('library'); }}
                                                        className="w-full text-left p-2 rounded border border-border bg-bg-elevated/40 hover:bg-bg-hover hover:border-primary/30 transition-all group shrink-0"
                                                    >
                                                        <div className="text-xs font-semibold text-text-main truncate group-hover:text-primary transition-colors">{p.title}</div>
                                                        <div className="text-[10px] text-text-muted mt-0.5 opacity-70">Click to view prompt</div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="shrink-0 text-xs text-text-muted italic opacity-70 leading-relaxed">
                                                This snippet is not yet used in any prompts. Use <code className="text-snippet-accent dark:text-amber-400 font-bold bg-snippet-bg-subtle dark:bg-amber-500/10 px-1 rounded">@&#123;{editName || 'Name'}&#125;</code> to include it.
                                            </p>
                                        )}
                                    </div>

                                    {/* Section: Tips */}
                                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 shrink-0">
                                        <div className="flex items-center gap-2 mb-2 text-primary">
                                            <Info size={14} />
                                            <span className="text-[10px] font-bold uppercase">Pro Tip</span>
                                        </div>
                                        <p className="text-[11px] text-text-muted leading-relaxed opacity-90">
                                            Snippets are global. Changing a snippet here will update all prompts that reference it. Use them for Personas, Brand Voices or Output Formats.
                                        </p>
                                    </div>
                                </div>
                            ) : activeTab === 'notes' ? (
                                <NoteEditor
                                    key={activeSnippetId}
                                    promptId={activeSnippetId}
                                    stepId={activeSnippetId}
                                    initialValue={snippets.find(s => s.id === activeSnippetId)?.notes || ""}
                                    onSaveNote={(noteText) => updateSnippetNote(activeSnippetId, noteText)}
                                    onResetRequest={() => updateSnippetNote(activeSnippetId, "")}
                                    prompts={prompts}
                                    snippets={snippets}
                                    knowledgeTiles={knowledgeTiles}
                                    onNavigate={onNavigate}
                                />
                            ) : (
                                <div className="animate-fade-in h-full flex flex-col">
                                    <div className="px-4 py-2 border-b border-border bg-bg/30 flex justify-end shrink-0">
                                        <button
                                            onClick={handleTakeSnapshot}
                                            disabled={isSavingSnapshot}
                                            className={`px-3 py-1.5 rounded-md transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border border-transparent select-none ${isSavingSnapshot
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : 'bg-primary/10 text-primary hover:bg-primary/25 hover:brightness-110'
                                                }`}
                                            title="Create Snapshot"
                                        >
                                            {isSavingSnapshot ? <Check size={12} /> : <Save size={12} />}
                                            {isSavingSnapshot ? "Saved" : "Take Snapshot"}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <VersionHistory
                                            item={snippets.find(s => s.id === activeSnippetId)}
                                            versions={snippets.find(s => s.id === activeSnippetId)?.versions || []}
                                            currentContent={editContent}
                                            onRestore={(content) => updateEditState(setEditContent, content)}
                                            onUpdateNote={(versionId, note) => updateSnippetVersionNote(activeSnippetId, versionId, note)}
                                            onDeleteVersion={(versionId) => deleteSnippetVersion(activeSnippetId, versionId)}
                                            onManualSnapshot={handleTakeSnapshot}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* SNIPPET USAGE POPUP */}
            <AnimatePresence>
                {usagePopupSnippet && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[1000]"
                            onClick={() => setUsagePopupSnippet(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            style={{
                                position: 'fixed',
                                top: Math.min(window.innerHeight - 420, Math.max(20, usagePopupSnippet.anchorRect.top - 100)),
                                left: usagePopupSnippet.anchorRect.right + 12 > window.innerWidth - 360
                                    ? usagePopupSnippet.anchorRect.left - 352
                                    : usagePopupSnippet.anchorRect.right + 12
                            }}
                            className="w-[340px] max-h-[400px] bg-bg-secondary dark:bg-zinc-900 border border-border dark:border-white/10 rounded-2xl shadow-2xl z-[1001] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-border dark:border-white/5 bg-bg-secondary dark:bg-bg-surface/50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-text-main leading-none">Snippet Usage</h3>
                                        <p className="text-[10px] text-text-muted mt-1">@{usagePopupSnippet.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setUsagePopupSnippet(null)}
                                    className="p-1.5 hover:bg-bg-hover rounded-full text-text-faint hover:text-text-main transition-all"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-bg-surface dark:bg-zinc-800/45 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600 dark:[&::-webkit-scrollbar-thumb:hover]:bg-zinc-500">
                                {usagePopupSnippet.usages.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            setActivePrompt(p.id);
                                            onViewChange('library');
                                            setUsagePopupSnippet(null);
                                        }}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-secondary dark:hover:bg-zinc-900/80 transition-colors text-left group"
                                    >
                                        <div className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200/50 dark:border-white/5 text-text-faint group-hover:text-primary transition-colors">
                                            <FileText size={14} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-medium text-text-main truncate">{p.title || "Untitled Prompt"}</div>
                                            <div className="text-[10px] text-text-muted truncate opacity-60">
                                                {p.content?.substring(0, 40) || p.chain?.[0]?.content?.substring(0, 40)}...
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="text-text-faint group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                                    </button>
                                ))}
                            </div>

                            <div className="p-3 border-t border-border dark:border-white/5 bg-bg-secondary dark:bg-bg/30 text-center shrink-0">
                                <span className="text-[10px] text-text-faint">Click a prompt to open it in the Studio</span>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmText="Yes, Delete"
                isDangerous={modalConfig.isDangerous}
                customButtons={modalConfig.customButtons}
                onConfirm={modalConfig.onConfirm}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
            />

            {/* RENAME CONFIRMATION OVERLAY */}
            {
                renameConfig && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-border bg-bg-elevated flex items-center gap-3">
                                <div className="p-2 bg-snippet-bg-subtle text-snippet-accent rounded-lg">
                                    <Link size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-text-main">Update Snippet References?</h3>
                                    <p className="text-xs text-text-muted">You renamed <b>@{renameConfig.oldName}</b> to <b>@{renameConfig.newName}</b></p>
                                </div>
                            </div>

                            <div className="p-5 space-y-4">
                                <p className="text-sm text-text-main leading-relaxed">
                                    This snippet is currently used in <b>{renameConfig.usages.length} prompt(s)</b>.
                                    How would you like to handle these references?
                                </p>

                                <div className="space-y-3">
                                    {/* OPTION 1: UPDATE (SMART) */}
                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${renameOption === 'update' ? 'bg-primary/10 border-primary' : 'bg-bg border-border hover:border-text-muted'}`}>
                                        <input
                                            type="radio"
                                            name="renameOption"
                                            value="update"
                                            checked={renameOption === 'update'}
                                            onChange={() => setRenameOption('update')}
                                            className="mt-1"
                                        />
                                        <div>
                                            <div className="text-sm font-bold text-text-main">Update {renameConfig.usages.length} Prompts (Recommended)</div>
                                            <div className="text-xs text-text-muted mt-0.5">
                                                Automatically changes <code>@{renameConfig.oldName}</code> to <code>@{renameConfig.newName}</code> in all prompts.
                                            </div>
                                        </div>
                                    </label>

                                    {/* OPTION 2: BREAK / ONLY RENAME */}
                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${renameOption === 'break' ? 'bg-bg-elevated border-text-muted' : 'bg-bg border-border hover:border-text-muted'}`}>
                                        <input
                                            type="radio"
                                            name="renameOption"
                                            value="break"
                                            checked={renameOption === 'break'}
                                            onChange={() => setRenameOption('break')}
                                            className="mt-1"
                                        />
                                        <div>
                                            <div className="text-sm font-bold text-text-main">Don't Update Prompts</div>
                                            <div className="text-xs text-text-muted mt-0.5 mb-2">
                                                Renames the snippet but leaves prompts pointing to <code>@{renameConfig.oldName}</code> (broken link).
                                            </div>

                                            {/* CHECKBOX: CLEANUP */}
                                            <div className={`pl-0 transition-opacity ${renameOption === 'break' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                                <label className="flex items-center gap-2 select-none group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${cleanupRefs ? 'bg-red-500 border-red-500' : 'border-text-muted bg-bg'}`}
                                                        onClick={(e) => { e.preventDefault(); setCleanupRefs(!cleanupRefs); }}>
                                                        {cleanupRefs && <Check size={10} className="text-white" strokeWidth={4} />}
                                                    </div>
                                                    <span className={`text-xs ${cleanupRefs ? 'text-red-400 font-medium' : 'text-text-muted group-hover:text-text-main'}`}>
                                                        Remove broken <code>@{renameConfig.oldName}</code> tags from prompts?
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-bg-surface flex justify-end gap-2">
                                <button
                                    onClick={cancelRename}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRename}
                                    className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
                                >
                                    <Check size={16} />
                                    Confirm Rename
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            <MultiTaggerModal
                isOpen={isMultiTaggerOpen}
                onClose={() => setIsMultiTaggerOpen(false)}
                promptTitle={editName || "Snippet"}
                allTags={tags}
                currentTags={editTags}
                onSave={(newTags) => updateEditState(setEditTags, newTags)}
            />

            {/* OFF-SCREEN CINEMATIC RENDER CONTAINER (FOR PNG EXPORT) */}
            <div className="absolute top-[-9999px] left-[-9999px] pointer-events-none opacity-0">
                {/* WRAPPER (Canvas) - Matches Prompt Export */}
                <div 
                    ref={exportRef} 
                    className="w-[800px] bg-gradient-to-br from-zinc-800 to-zinc-950 p-12 rounded-xl relative border border-white/5 shadow-2xl font-sans"
                >
                    {/* INNER WINDOW */}
                    <div className="bg-[#18181b] rounded-lg shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/50">
                        
                        {/* 1. TITLE BAR (Mac-Style) */}
                        <div className="h-10 bg-[#27272a] border-b border-white/5 flex items-center justify-between px-4">
                            <div className="flex items-center gap-2.5 opacity-70">
                                <span className="text-amber-400 font-mono text-[13px] font-bold select-none pt-0.5">@</span>
                                <span className="text-xs font-mono text-white/80 tracking-wide pt-0.5">
                                    {editName || "Untitled Snippet"}
                                </span>
                            </div>
                            <div className="flex gap-2 opacity-30">
                                <div className="w-2.5 h-0.5 bg-white rounded-full"></div>
                                <div className="w-2.5 h-2.5 border border-white rounded-[2px]"></div>
                                <div className="w-2.5 h-2.5 relative">
                                    <div className="absolute inset-0 rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                                    <div className="absolute inset-0 -rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                                </div>
                            </div>
                        </div>

                        {/* 2. CONTENT */}
                        <div className="p-8 bg-[#18181b]">
                            <div className="prose prose-invert max-w-none prose-pre:bg-[#09090b] prose-pre:border prose-pre:border-white/10 prose-p:leading-relaxed">
                                <pre className="font-mono text-[13px] text-[#e4e4e7] leading-7 whitespace-pre-wrap bg-transparent border-0 p-0 m-0">
                                    {editContent}
                                </pre>
                            </div>
                        </div>

                        {/* 3. STATUS BAR (Branding) */}
                        <div className="py-2.5 px-6 border-t border-white/[0.05] bg-[#1a1d24] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded overflow-hidden shrink-0">
                                    <img src="/icon48.png" alt="Logo" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col justify-center leading-none">
                                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest">
                                        <span className="text-gray-500 font-semibold">ENGINEERED WITH</span>
                                        <span className="text-gray-100 font-bold tracking-wide">LEANPROMPTS STUDIO</span>
                                    </div>
                                    <span className="text-[8px] font-medium text-gray-500 uppercase tracking-[0.2em] mt-[2px]">
                                        THE LOCAL AI IDE
                                    </span>
                                </div>
                            </div>

                            <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest font-bold flex items-center gap-2">
                                <span>{(editContent || "").length} CHARACTERS</span>
                                <span className="text-gray-700 font-bold opacity-50">|</span>
                                <span className="text-amber-500/80">SYSTEM SNIPPET</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

        </div >
    );
}

