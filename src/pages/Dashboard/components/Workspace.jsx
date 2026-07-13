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
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Download, Eye, EyeOff, Save, Check, Trash2, Copy, ArrowUp, ArrowDown, X, Send, Plus, MoreVertical, ChevronDown, ChevronLeft, ChevronRight, BookOpen, Maximize, Package, Image as ImageIcon, RefreshCw, HelpCircle, Blocks } from 'lucide-react';
import PromptEditor from '../../../components/PromptEditor';
import TagInput from '../../../components/TagInput';
import MultiTaggerModal from '../../../components/MultiTaggerModal';
import CommunityShareModal from './CommunityShareModal';
import SuggestionBar from './SuggestionBar';
import usePromptStore from '../../../stores/promptStore';
import { getInjectionTooltip } from '../../../utils/llmConstants';
import { Tags } from 'lucide-react';
import { formatLeanText } from '../../../utils/leanFormat';
import { compressImage, extractThumbnail } from '../../../utils/imageCompression';
import useModifierKeys from '../../../hooks/useModifierKeys';
import { ExternalLink } from 'lucide-react';
import { LlmInjectLabel, LlmIconButton } from '../../../components/llm/LlmInjectBar';
import ToolbarButton from '../../../components/ToolbarButton';


/**
 * WORKSPACE MODULE
 * Enthält die vollständige Render-Logik für die Prompt-Chain.
 */
export default function Workspace({
    activePrompt, activeStepId, localTitle, onTitleChange, onShare, onShareWorkflow, isPreviewMode, onTogglePreview,
    isSaving, onManualSnapshot, onDeletePrompt, localEditorContent, onEditorChange, localStepTitles,
    onStepTitleChange, onStepFocus, onMoveStep, onCopyStep, onSaveStep, onDeleteStep, onAddStep,
    onLaunchStep, snippets, prompts, copyingStepId, savingStepId, llms, getPreviewForStep,
    onTagsChange, syntaxSuggestions, onApplySuggestions, onIgnoreSuggestions, onAssignToCollection,
    onNotification,
    backlinks = [], onOpenKnowledgeTile, onOpenPromptNote,
    isZenMode, setIsZenMode, onToggleZenMode,
    tags,
    isDarkMode
}) {
    const { collections, saveCollection, deleteTag, savePrompt, knowledgeTiles } = usePromptStore();
    const [showMoreMenu, setShowMoreMenu] = React.useState(false);
    const [isCommunityShareOpen, setIsCommunityShareOpen] = React.useState(false);
    const [showLightbox, setShowLightbox] = React.useState(false);
    const [showCollectionMenu, setShowCollectionMenu] = React.useState(false);
    const [collectionPopupPos, setCollectionPopupPos] = React.useState({ top: 0, left: 0 }); // <-- NEU
    const [showBacklinks, setShowBacklinks] = React.useState(false);
    const [isCreatingCollection, setIsCreatingCollection] = React.useState(false);
    const [newCollectionName, setNewCollectionName] = React.useState("");
    const [isMultiTaggerOpen, setIsMultiTaggerOpen] = React.useState(false);
    const [maximizedStepId, setMaximizedStepId] = React.useState(null);
    const [wsHeaderHeight, setWsHeaderHeight] = React.useState(180);
    const wsHeaderRef = React.useRef(null);
    const scrollContainerRef = React.useRef(null);
    const titleInputRef = React.useRef(null);
    const backlinkBtnRef = React.useRef(null);
    const [backlinkPopupPos, setBacklinkPopupPos] = React.useState({ top: 0, left: 0 });
    const [imgNaturalSize, setImgNaturalSize] = React.useState({ width: 1, height: 1 }); // For aspect ratio correction

    // --- STEP CONTEXT MENU STATE ---
    const [activeStepMenuId, setActiveStepMenuId] = React.useState(null);
    const [stepMenuPopupPos, setStepMenuPopupPos] = React.useState({ top: 0, left: 0 });

    React.useEffect(() => {
        const closeMenu = () => setActiveStepMenuId(null);
        if (activeStepMenuId) window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [activeStepMenuId]);
    // --- END STEP CONTEXT MENU STATE ---

    // --- START: STEP LLM SCROLL LOGIC ---
    const [stepLlmScroll, setStepLlmScroll] = React.useState({ left: false, right: false });
    const stepLlmScrollRef = React.useRef(null);

    const updateStepLlmScroll = React.useCallback(() => {
        if (stepLlmScrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = stepLlmScrollRef.current;
            setStepLlmScroll({
                left: scrollLeft > 5,
                right: scrollLeft + clientWidth < scrollWidth - 5
            });
        }
    }, []);

    const handleStepLlmWheel = (e) => {
        if (stepLlmScrollRef.current) {
            stepLlmScrollRef.current.scrollLeft += e.deltaY;
            updateStepLlmScroll();
        }
    };

    const scrollStepLlmBar = (direction) => {
        if (stepLlmScrollRef.current) {
            const amount = direction === 'left' ? -100 : 100;
            stepLlmScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
            setTimeout(updateStepLlmScroll, 350);
        }
    };

    React.useEffect(() => {
        // Kurzes Delay, da AnimatePresence die Leiste erst ins DOM mountet
        const timer = setTimeout(updateStepLlmScroll, 300);
        window.addEventListener('resize', updateStepLlmScroll);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateStepLlmScroll);
        };
    }, [activeStepId, llms.length, updateStepLlmScroll]);
    // --- END: STEP LLM SCROLL LOGIC ---

// --- [PROTECTED: BULLETPROOF IMAGE PROCESSING] ---
    const [isDraggingCover, setIsDraggingCover] = React.useState(false);

    const processImageFile = async (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        try {
            const base64 = await compressImage(file);
            const defaultThumb = await extractThumbnail(base64, { x: 0, y: 0, width: 100, height: 100 });
            savePrompt({ ...activePrompt, coverImage: base64, thumbnailImage: defaultThumb, coverCrop: undefined });
            if (onNotification) onNotification("Cover image updated!", "success");
        } catch (e) {
            if (onNotification) onNotification("Failed to process cover image", "error");
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
        processImageFile(file);
        // Fix: Reset input value to allow re-uploading the exact same file if deleted
        if (e.target && e.target.value) e.target.value = '';
    };

    // --- [PROTECTED: ZERO-REGRESSION GLOBAL PASTE GUARD] ---
    React.useEffect(() => {
        const handleGlobalPaste = (e) => {
            // Guard 1: Nur ausführen, wenn der Workspace aktiv und keine Lightbox offen ist
            if (!activePrompt || showLightbox) return;

            // Guard 2: Schwebt die Maus über einer Dropzone? (Hover-Intent)
            const hoveredZone = window.lp_hovered_dropzone;
            if (!hoveredZone) return;

            // Guard 3: Befinden sich tatsächlich Dateien in der Zwischenablage? (Content-Intent)
            const items = e.clipboardData?.items;
            if (!items) return;

            const pastedFiles = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    if (file) pastedFiles.push(file);
                }
            }

            // Wenn es reiner Text ist, sofort abbrechen.
            // GARANTIE: Verhindert, dass natives Text-Einfügen jemals blockiert wird.
            if (pastedFiles.length === 0) return;

            // --- INTENT ROUTING SUCCESS ---
            // Der User hovert über einer Dropzone UND fügt eine Datei ein.
            // Wir fangen das Event ab und töten es (stopPropagation), damit tiefere 
            // Text-Inputs (wie CodeMirror) das Bild nicht versehentlich mit-verarbeiten.
            e.preventDefault();
            e.stopPropagation();
            
            // Routing: Cover Image vs. VariableInspector
            if (hoveredZone === 'cover') {
                const imageFile = pastedFiles.find(f => f.type.startsWith('image/'));
                if (imageFile) {
                    processImageFile(imageFile);
                } else {
                    if (onNotification) onNotification("Cover must be an image file.", "warning");
                }
            } else {
                // Dispatch custom event for VariableInspector to handle variables
                window.dispatchEvent(new CustomEvent('lp-global-file-paste', { 
                    detail: { files: pastedFiles, zone: hoveredZone }
                }));
            }
        };

        // CRITICAL FIX: 'true' aktiviert die Capture-Phase! 
        // Das Event wird abgefangen, BEVOR es in die Bubble-Phase (zu React/CodeMirror) wandert.
        window.addEventListener('paste', handleGlobalPaste, true);
        return () => window.removeEventListener('paste', handleGlobalPaste, true);
    }, [activePrompt, showLightbox, savePrompt]); // Dependencies bleiben strikt isoliert

    // Schließen-Logik (Escape Taste)
    React.useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setShowLightbox(false);
        };
        if (showLightbox) {
            window.addEventListener('keydown', handleEsc);
        } else {
            setCropMode(false);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showLightbox]);

    const [cropMode, setCropMode] = React.useState(false);
    const [crop, setCrop] = React.useState({ x: 0, y: 0, width: 100, height: 100 });

    // --- NEW: 100% SAFE EVENT CLEANUP REF ---
    const activeCropListeners = React.useRef(null);

    React.useEffect(() => {
        return () => {
            // Garantiert das Löschen der globalen Window-Listener, 
            // falls das Modal per ESC geschlossen wird, während man zieht.
            if (activeCropListeners.current) {
                window.removeEventListener('mousemove', activeCropListeners.current.move);
                window.removeEventListener('mouseup', activeCropListeners.current.up);
            }
        };
    }, []);
    // ----------------------------------------

    // --- NEW: 100% SAFE SUBMIT LOCK ---
    const isSubmittingColRef = React.useRef(false);

    const handleImgLoad = (e) => {
        setImgNaturalSize({
            width: e.target.naturalWidth,
            height: e.target.naturalHeight
        });

        if (activePrompt.coverCrop) {
            setCrop(activePrompt.coverCrop);
            return;
        }

        // Initial crop: center a square
        const imgRatio = e.target.naturalWidth / e.target.naturalHeight;
        if (imgRatio > 1) {
            // Wide image: height is 100%, width is 100/ratio%
            const w = (1 / imgRatio) * 100;
            setCrop({ x: (100 - w) / 2, y: 0, width: w, height: 100 });
        } else {
            // Tall image: width is 100%, height is 100*ratio%
            const h = imgRatio * 100;
            setCrop({ x: 0, y: (100 - h) / 2, width: 100, height: h });
        }
    };

    const handleCropDragStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startCrop = { ...crop };
        
        const container = e.target.closest('.crop-container-ref');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        
        const handleMouseMove = (moveEvent) => {
            const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
            const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
            
            let newX = startCrop.x + dx;
            let newY = startCrop.y + dy;
            
            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + startCrop.width > 100) newX = 100 - startCrop.width;
            if (newY + startCrop.height > 100) newY = 100 - startCrop.height;
            
            setCrop(prev => ({ ...prev, x: newX, y: newY }));
        };
        
        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            activeCropListeners.current = null; // Clean ref
        };
        
        // Track references for component unmount
        activeCropListeners.current = { move: handleMouseMove, up: handleMouseUp };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleCropResizeStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startCrop = { ...crop };
        
        const container = e.target.closest('.crop-container-ref');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const imgRatio = imgNaturalSize.width / imgNaturalSize.height;
        
        const handleMouseMove = (moveEvent) => {
            const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
            let newWidth = startCrop.width + dx;
            let newHeight = newWidth * imgRatio; // Keep it visually square: (width% * pixWidth) == (height% * pixHeight)
            
            // Limit checks
            if (newWidth < 5) newWidth = 5;
            if (newHeight < 5) newHeight = 5;
            
            if (startCrop.x + newWidth > 100) {
                newWidth = 100 - startCrop.x;
                newHeight = newWidth * imgRatio;
            }
            if (startCrop.y + newHeight > 100) {
                newHeight = 100 - startCrop.y;
                newWidth = newHeight / imgRatio;
            }
            
            setCrop(prev => ({ ...prev, width: newWidth, height: newHeight }));
        };
        
        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            activeCropListeners.current = null; // Clean ref
        };
        
        // Track references for component unmount
        activeCropListeners.current = { move: handleMouseMove, up: handleMouseUp };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const saveFinalCrop = async () => {
        try {
            const thumbBase64 = await extractThumbnail(activePrompt.coverImage, {
                x: crop.x, y: crop.y, width: crop.width, height: crop.height
            });
            savePrompt({ 
                ...activePrompt, 
                thumbnailImage: thumbBase64,
                coverCrop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
            });
            setCropMode(false);
            if (onNotification) onNotification("Thumbnail generated successfully!", "success");
        } catch (e) {
            if (onNotification) onNotification("Error generating thumbnail", "error");
        }
    };

    // Dynamic measurement of workspace header for pixel-perfect full-height
    React.useLayoutEffect(() => {
        if (wsHeaderRef.current) {
            setWsHeaderHeight(wsHeaderRef.current.offsetHeight);
        }
    }, [activePrompt?.id, activePrompt?.tags, activePrompt?.collectionId, backlinks.length]);

    // Auto-focus on title field when creating a new prompt (Defensive & Lifecycle-Safe)
    React.useEffect(() => {
        const firstStepContent = activePrompt?.chain?.[0]?.content || "";
        if (activePrompt && activePrompt.title === "Untitled Prompt" && !firstStepContent.trim()) {
            setTimeout(() => {
                if (titleInputRef.current) {
                    titleInputRef.current.focus({ preventScroll: true });
                    titleInputRef.current.select(); // Markiert den Text zur direkten Überschreibung
                }
            }, 150); // 150ms fängt Render- und Animations-Latenzen des Browsers stabil ab
        }
    }, [activePrompt?.id]);

    // Auto-Scroll zum aktiven Step beim Mounten (View-Wechsel) oder Prompt-Wechsel
    React.useEffect(() => {
        if (activeStepId && scrollContainerRef.current) {
            // Kurzes Timeout, damit das Layout (inkl. CodeMirror) fertig berechnet ist
            const timer = setTimeout(() => {
                const container = scrollContainerRef.current;
                if (!container) return;
                
                const stepElement = container.querySelector(`[data-step-id="${activeStepId}"]`);
                if (stepElement) {
                    const containerRect = container.getBoundingClientRect();
                    const elRect = stepElement.getBoundingClientRect();
                    
                    // Sicheres Scrollen innerhalb des Containers (verhindert Body-Shift)
                    container.scrollTo({
                        top: container.scrollTop + (elRect.top - containerRect.top) - 16,
                        behavior: 'smooth' // 'smooth' zeigt dem User visuell, dass zum aktiven Step gescrollt wurde
                    });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [activePrompt?.id]); // Läuft nur beim Mounten und wenn ein GANZER Prompt gewechselt wird
    if (!activePrompt) return null;

    // Calculate used snippets for reverse linking
    const usedSnippetNames = new Set();
    const promptText = (activePrompt.chain || []).map(s => s.content).join(" ") + (activePrompt.content || "");
    const snipRegex = /@(\w+)|@\{([^}]+)\}/g;
    let match;
    while ((match = snipRegex.exec(promptText)) !== null) {
        usedSnippetNames.add(match[1] || match[2]);
    }
    const usedSnippets = snippets.filter(s => usedSnippetNames.has(s.name));

    // Aspect Ratio: GCD-exact if clean, else snap to nearest standard ratio
    const getAspectRatio = (w, h) => {
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const d = gcd(w, h);
        const rw = w / d, rh = h / d;
        if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
        // Snap to nearest standard ratio
        const ratio = w / h;
        const standards = [
            [1,1],[4,3],[3,2],[16,9],[16,10],[21,9],[2,1],
            [3,4],[2,3],[9,16],[10,16],[9,21],[1,2],[4,5],[5,4]
        ];
        let best = standards[0], bestDiff = Infinity;
        for (const [sw, sh] of standards) {
            const diff = Math.abs(ratio - sw / sh);
            if (diff < bestDiff) { bestDiff = diff; best = [sw, sh]; }
        }
        return `~${best[0]}:${best[1]}`;
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 border-r border-border h-full overflow-hidden">

            {/* 1. WORKSPACE HEADER */}
            <header
                id="dash-meta"
                ref={wsHeaderRef}
                className="border-b border-border bg-bg-surface shrink-0 flex flex-col gap-2 p-4 pb-0"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col flex-1 min-w-0 gap-1">
                        <div className="flex items-center gap-3">
<div 
                                className="relative w-12 h-12 shrink-0 group/cover rounded-xl"
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingCover(true); }}
                                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingCover(true); }}
                                onDragLeave={(e) => { 
                                    e.preventDefault(); 
                                    e.stopPropagation(); 
                                    // Guard against flickering when dragging over child elements
                                    if (e.currentTarget.contains(e.relatedTarget)) return; 
                                    setIsDraggingCover(false); 
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDraggingCover(false);
                                    const file = e.dataTransfer?.files?.[0];
                                    processImageFile(file);
                                }}
                                onMouseEnter={() => window.lp_hovered_dropzone = 'cover'}
                                onMouseLeave={() => window.lp_hovered_dropzone = null}
                                title={
                                    (activePrompt.thumbnailImage || activePrompt.coverImage)
                                        ? "Click to view or edit. Drag & drop or hover and press Ctrl+V to replace."
                                        : "Click to browse, drag & drop, or hover and press Ctrl+V to paste an image."
                                }
                            >
                                {/* Protected Drag Overlay */}
                                {isDraggingCover && (
                                    <div className="absolute inset-0 z-[25] bg-primary/20 border-2 border-primary border-dashed rounded-xl flex items-center justify-center backdrop-blur-[2px] animate-fade-in pointer-events-none">
                                        <ImageIcon size={16} className="text-primary animate-pulse" />
                                    </div>
                                )}

                                {(activePrompt.thumbnailImage || activePrompt.coverImage) ? (
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowLightbox(true);
                                        }}
                                        className="w-full h-full rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 hover:ring-primary/50 shadow-md cursor-pointer transition-all active:scale-95 relative z-[5]"
                                    >
                                        <img 
                                            src={activePrompt.thumbnailImage || activePrompt.coverImage} 
                                            className="w-full h-full object-cover" 
                                            alt="Cover" 
                                        />
                                        {/* Subtle Hover Hint */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center z-10 pointer-events-none">
                                            <Maximize size={14} className="text-white/90" />
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all cursor-pointer relative z-[5] ${isDraggingCover ? 'border-transparent' : 'border-border/40 dark:border-white/25 hover:border-primary/40 dark:hover:border-white/40 hover:bg-primary/5 dark:hover:bg-white/5'}`}>
                                        <Plus size={16} className="text-text-faint group-hover/cover:text-primary transition-colors" />
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    </label>
                                )}
                            </div>
                            <input
                                id="dash-title"
                                ref={titleInputRef}
                                value={localTitle}
                                onChange={onTitleChange}
                                onFocus={(e) => e.target.select()}
                                className="bg-transparent text-xl font-bold text-text-main focus:outline-none w-full placeholder:text-text-muted/50 truncate"
                                placeholder="Untitled Prompt"
                                title={localTitle}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ToolbarButton
                            variant="ghost"
                            isActive={isZenMode}
                            onClick={onToggleZenMode}
                            title="Zen Mode (Alt+Shift+Z)"
                        >
                            <Maximize size={18} />
                        </ToolbarButton>

                        <ToolbarButton
                            variant="elevated"
                            isActive={isPreviewMode}
                            onClick={onTogglePreview}
                            title={isPreviewMode ? "Switch to Edit Mode" : "Switch to Preview Mode"}
                        >
                            {isPreviewMode ? <><Eye size={14} /> Active</> : <><EyeOff size={14} /> Preview</>}
                        </ToolbarButton>

                        <ToolbarButton
                            variant="action"
                            isActive={isSaving}
                            activeClass="bg-green-500/10 text-green-500 border-green-500/20"
                            onClick={onManualSnapshot}
                            disabled={isSaving}
                            title="Create Snapshot (freezes the current state of all modified steps in their history for easy restoration)."
                        >
                            {isSaving ? <Check size={14} /> : <Save size={14} />}
                            {isSaving ? "Snapshot Created" : "Create Snapshot"}
                        </ToolbarButton>

                        <div className="relative">
                            <ToolbarButton
                                variant="ghost"
                                isActive={showMoreMenu}
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                title="More Actions"
                            >
                                <MoreVertical size={18} />
                            </ToolbarButton>

                            {showMoreMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)}></div>
                                    <div className="absolute right-0 mt-2 w-56 bg-bg-surface border border-border rounded-xl shadow-2xl z-50 p-1 animate-in fade-in zoom-in duration-200">
                                        <button
                                            onClick={() => { onShare(); setShowMoreMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-lg transition-colors"
                                        >
                                            <Download size={14} /> Export Prompt (PNG / JSON)
                                        </button>
                                        <button
                                            onClick={() => { onShareWorkflow(); setShowMoreMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        >
                                            <Package size={14} /> Export Workflow Bundle
                                        </button>
                                        <button
                                            onClick={() => { setIsCommunityShareOpen(true); setShowMoreMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        >
                                            <Share2 size={12} /> Share to Community Hub
                                        </button>
                                        <div className="h-px bg-border my-1"></div>
                                        <button
                                            onClick={() => { onDeletePrompt(); setShowMoreMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={14} /> Delete Prompt
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pb-3 flex flex-wrap items-center gap-4">
                    <div className="flex items-start gap-1.5 shrink-0 max-w-full">
                        <TagInput
                            tags={activePrompt.tags || []}
                            onChange={onTagsChange}
                            availableTags={(tags || []).map(t => t.name)}
                        />
                        <button
                            onClick={() => setIsMultiTaggerOpen(true)}
                            className="p-2.5 rounded-lg bg-bg-surface border border-border text-text-muted hover:text-primary hover:border-primary hover:bg-primary/5 transition-all shadow-sm group"
                            title="Open Multi-Tagger"
                        >
                            <Tags size={16} className="group-hover:scale-110 transition-transform" />
                        </button>
                    </div>

                    {/* COLLECTION SELECTOR */}
                    <div className="flex items-center gap-2 border-l border-border pl-4">
                        <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Collection:</span>
                        <div className="relative">
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
                                        
                                        setCollectionPopupPos({
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
                                    style={{ backgroundColor: collections.find(c => c.id === activePrompt.collectionId)?.color || '#9ca3af' }}
                                ></div>
                                <span className="text-text-main">
                                    {collections.find(c => c.id === activePrompt.collectionId)?.name || 'None'}
                                </span>
                                <ChevronDown size={12} className="text-text-muted group-hover:text-primary" />
                            </button>

                            {showCollectionMenu && createPortal(
                                <div className="portal-root">
                                    <div className="fixed inset-0 z-[9998]" onClick={() => { setShowCollectionMenu(false); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
                                    <div 
                                        className="fixed w-52 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                        style={collectionPopupPos}
                                        onClick={(e) => e.stopPropagation()}
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
                                                                e.preventDefault();
                                                                if (isSubmittingColRef.current) return;
                                                                isSubmittingColRef.current = true;
                                                                try {
                                                                    const newId = crypto.randomUUID();
                                                                    await saveCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                                    onAssignToCollection(activePrompt.id, newId);
                                                                    setNewCollectionName("");
                                                                    setIsCreatingCollection(false);
                                                                    setShowCollectionMenu(false);
                                                                } finally {
                                                                    isSubmittingColRef.current = false;
                                                                }
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
                                                    onAssignToCollection(activePrompt.id, null);
                                                    setShowCollectionMenu(false);
                                                }}
                                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${!activePrompt.collectionId
                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                    : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                    }`}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0"></div>
                                                <span>None (Uncategorized)</span>
                                                {!activePrompt.collectionId && <Check size={12} className="ml-auto shrink-0" />}
                                            </button>
                                            {collections.map(col => (
                                                <button
                                                    key={col.id}
                                                    onClick={() => {
                                                        onAssignToCollection(activePrompt.id, col.id);
                                                        setShowCollectionMenu(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${activePrompt.collectionId === col.id
                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                        : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                        }`}
                                                >
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                                                    <span className="truncate">{col.name}</span>
                                                    {activePrompt.collectionId === col.id && <Check size={12} className="ml-auto shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    </div>

                    {(usedSnippets || []).length > 0 && (
                        <div className="flex items-center gap-2 border-l border-border pl-4">
                            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Snippets:</span>
                            <div className="flex flex-wrap gap-1.5">
                                {usedSnippets.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Global navigation trigger
                                            window.dispatchEvent(new CustomEvent('lp-navigate-to-snippet', { detail: { name: s.name } }));
                                        }}
                                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40 transition-colors cursor-pointer"
                                        title={`Jump to @${s.name} in Snippet Library`}
                                    >
                                        @{s.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* BACKLINKS INDICATOR */}
                    {/* BACKLINKS INDICATOR */}
                    {backlinks.length > 0 && (
                        <div className="flex items-center gap-2 border-l border-border pl-4">
                            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Refs:</span>
                            <div className="relative">
                                <button
                                    ref={backlinkBtnRef}
                                    onClick={(e) => {
                                        if (!showBacklinks) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                            
                                            let left = rect.left;
                                            if (left + 192 > window.innerWidth) { // 192px is w-48
                                                left = window.innerWidth - 192 - 16;
                                            }
                                            
                                            setBacklinkPopupPos({
                                                left: left,
                                                ...(isFlipped 
                                                    ? { bottom: window.innerHeight - rect.top + 4 } 
                                                    : { top: rect.bottom + 4 })
                                            });
                                        }
                                        setShowBacklinks(!showBacklinks);
                                    }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-bg-surface hover:border-blue-500 text-xs font-medium transition-all group ${showBacklinks ? 'border-blue-500 ring-1 ring-blue-500/20' : ''}`}
                                >
                                    <BookOpen size={12} className="text-blue-500" />
                                    <span className="text-text-main">{backlinks.length}</span>
                                    <ChevronDown size={12} className="text-text-muted group-hover:text-blue-500" />
                                </button>

                                {showBacklinks && createPortal(
                                    <div className="portal-root">
                                        <div className="fixed inset-0 z-[9998]" onClick={() => setShowBacklinks(false)}></div>
                                        <div
                                            className="fixed bg-bg-surface border border-border rounded-lg shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 w-48"
                                            style={backlinkPopupPos}
                                        >
                                            <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                                                <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Referenced in</span>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                {backlinks.map(link => (
                                                    <button
                                                        key={link.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (link.type === 'prompt' && onOpenPromptNote) {
                                                                onOpenPromptNote(link.id, link.stepId);
                                                            } else if (onOpenKnowledgeTile) {
                                                                onOpenKnowledgeTile(link.id);
                                                            }
                                                            setShowBacklinks(false);
                                                        }}
                                                        className="w-full text-left px-2 py-1.5 rounded text-xs text-text-main hover:bg-bg-hover hover:text-primary truncate flex items-center gap-2"
                                                        title={`${link.type === 'prompt' ? 'Prompt Note' : 'KB Tile'}: ${link.title}`}
                                                    >
                                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded shadow-sm border ${link.type === 'prompt' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' : 'bg-orange-500/10 text-orange-500 border-orange-500/20'}`}>
                                                            {link.type === 'prompt' ? 'PROMPT' : 'KB'}
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
                        </div>
                    )}
                </div>
            </header>

            {/* 2. STEPS LIST */}
            <div
                id="dash-steps-container"
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-bg relative"
            >

                {(activePrompt.chain || []).map((step, index) => {
                    const isStepActive = activeStepId === step.id;
                    const isOnlyStep = (activePrompt.chain || []).length === 1;

                    return (
                        <React.Fragment key={step.id}>
                            <div
                                data-step-id={step.id}
                                className={`group relative transition-all duration-300 ${isStepActive ? 'ring-1 ring-primary/30 rounded-lg p-1 -m-1' : ''}`}
                                onClick={() => onStepFocus(step.id)}
                            >
                                <div
                                    className="flex items-center justify-between mb-2 px-1.5 py-1 rounded-md cursor-pointer select-none border border-transparent hover:border-border/40 hover:bg-bg-hover/30 transition-all duration-200 group/header"
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        const newMaxId = maximizedStepId === step.id ? null : step.id;
                                        setMaximizedStepId(newMaxId);
                                        // Auto-scroll to top of step when maximizing
                                        if (newMaxId) {
                                            const element = e.currentTarget.closest('[data-step-id]');
                                            if (element && scrollContainerRef.current) {
                                                setTimeout(() => {
                                                    const container = scrollContainerRef.current;
                                                    const containerRect = container.getBoundingClientRect();
                                                    const elRect = element.getBoundingClientRect();
                                                    container.scrollTo({
                                                        top: container.scrollTop + (elRect.top - containerRect.top) - 8,
                                                        behavior: 'smooth'
                                                    });
                                                }, 150);
                                            }
                                        }
                                    }}
                                    title="Double-click to toggle full height"
                                    data-step-header
                                >
                                    <div className="flex items-center gap-2 w-1/2 max-w-[50%] overflow-hidden pr-3">
                                        <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${isStepActive
                                            ? 'bg-primary/10 text-primary border-primary/10'
                                            : 'bg-bg-elevated text-text-muted border-border'
                                            }`}>
                                            Step {index + 1}
                                        </div>
                                        <input
                                            value={localStepTitles[step.id] || ""}
                                            onChange={(e) => onStepTitleChange(step.id, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            onClick={(e) => e.stopPropagation()} // Prevent title bar interaction from firing
                                            onDoubleClick={(e) => e.stopPropagation()} // Prevent expansion when clicking input
                                            placeholder="Name this step..."
                                            className="bg-bg-secondary hover:bg-bg-hover focus:bg-bg-hover transition-colors px-2.5 py-1 rounded text-sm font-bold text-text-main focus:outline-none placeholder:text-text-faint/50 truncate cursor-text flex-1"
                                            title={localStepTitles[step.id] || "Step Name"}
                                        />
                                    </div>
                                    <div
                                        className="flex items-center gap-2"
                                        onDoubleClick={(e) => e.stopPropagation()} // Protection for buttons
                                        onClick={(e) => e.stopPropagation()}
                                    >

                                        {isStepActive && !isOnlyStep && (
                                            <div className="flex items-center gap-1 mr-2 bg-bg-elevated rounded p-0.5 border border-border shadow-sm">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onMoveStep(activePrompt.id, step.id, 'up'); }}
                                                    disabled={index === 0}
                                                    className="p-1 text-text-muted hover:text-primary disabled:opacity-30 transition-colors"
                                                    title="Move Step Up"
                                                >
                                                    <ArrowUp size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onMoveStep(activePrompt.id, step.id, 'down'); }}
                                                    disabled={index === (activePrompt.chain || []).length - 1}
                                                    className="p-1 text-text-muted hover:text-primary disabled:opacity-30 transition-colors"
                                                    title="Move Step Down"
                                                >
                                                    <ArrowDown size={12} />
                                                </button>
                                            </div>
                                        )}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCopyStep(step.id, isStepActive ? localEditorContent : step.content); }}
                                            className={`p-1.5 rounded-md text-xs transition-all flex items-center gap-1 ${copyingStepId === step.id
                                                ? 'text-green-400 bg-green-400/10'
                                                : 'text-text-muted hover:text-primary hover:bg-bg-hover'
                                                }`}
                                            title="Copy Step Content"
                                        >
                                            {copyingStepId === step.id ? <Check size={14} /> : <Copy size={14} />}
                                        </button>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); onSaveStep(step.id); }}
                                            className={`p-1.5 rounded-md text-xs transition-all flex items-center gap-1 ${savingStepId === step.id
                                                ? 'text-green-400 bg-green-400/10'
                                                : 'text-text-muted hover:text-primary hover:bg-bg-hover'
                                                }`}
                                            title="Create a snapshot of this step in its history."
                                        >
                                            {savingStepId === step.id ? <Check size={14} /> : <Save size={14} />}
                                        </button>

                                        <div className="relative">
                                            <button
                                                id={`step-menu-btn-${step.id}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (activeStepMenuId === step.id) {
                                                        setActiveStepMenuId(null);
                                                    } else {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const isFlipped = (window.innerHeight - rect.bottom) < 200;
                                                        setStepMenuPopupPos({
                                                            right: window.innerWidth - rect.right,
                                                            ...(isFlipped
                                                                ? { bottom: window.innerHeight - rect.top + 4 }
                                                                : { top: rect.bottom + 4 })
                                                        });
                                                        setActiveStepMenuId(step.id);
                                                    }
                                                }}
                                                className="p-1.5 rounded-md text-xs text-text-muted hover:text-primary hover:bg-bg-hover transition-all flex items-center"
                                                title="More Actions"
                                            >
                                                <MoreVertical size={14} />
                                            </button>

                                            {activeStepMenuId === step.id && createPortal(
                                                <div className="portal-root">
                                                    <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setActiveStepMenuId(null); }}></div>
                                                    <div
                                                        className="fixed w-44 bg-bg-surface border border-border shadow-2xl rounded-xl p-1 z-[9999] animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                                        style={stepMenuPopupPos}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onShare(step.id); setActiveStepMenuId(null); }}
                                                            className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                                                        >
                                                            <Download size={12} /> Export this Step
                                                        </button>

                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                setActiveStepMenuId(null);
                                                                const newId = await usePromptStore.getState().convertStepToSnippet(activePrompt.id, step.id);
                                                                if (newId) {
                                                                    window.dispatchEvent(new CustomEvent('NAVIGATE_TO', { detail: { type: 'snippet', id: newId } }));
                                                                    if (onNotification) onNotification("Converted to Snippet successfully!", "success");
                                                                }
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-md transition-all flex items-center gap-2"
                                                        >
                                                            <Blocks size={12} /> Convert to Snippet
                                                        </button>

                                                        {index > 0 && (
                                                            <>
                                                                <div className="h-px bg-border my-1"></div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onDeleteStep(step.id); setActiveStepMenuId(null); }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all flex items-center gap-2"
                                                                >
                                                                    <Trash2 size={12} /> Delete Step
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>,
                                                document.body
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className={`flex flex-col border border-border rounded-t-lg overflow-hidden shadow-sm transition-[min-height,background-color,border-color,box-shadow,transform] duration-300 ease-in-out bg-bg-surface ${maximizedStepId === step.id ? 'min-h-[calc(100vh-56px-var(--ws-header-height,180px)-80px)]' : isOnlyStep ? 'h-[60vh] resize-y' : 'h-[250px] resize-y'
                                        } ${isStepActive || isOnlyStep ? 'step-scroll-active' : 'step-scroll-locked'}`}
                                    style={{ '--ws-header-height': `${wsHeaderHeight}px` }}
                                >

                                    {isStepActive && (
                                        <SuggestionBar
                                            suggestions={syntaxSuggestions}
                                            onApply={onApplySuggestions}
                                            onIgnore={onIgnoreSuggestions}
                                        />
                                    )}

                                    {isPreviewMode ? (
                                        <div className="h-full w-full p-4 overflow-y-auto custom-scrollbar bg-bg-surface">
                                            <div className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-text-main">
                                                {formatLeanText(getPreviewForStep(isStepActive ? localEditorContent : step.content), onOpenKnowledgeTile) || <span className="text-text-muted italic">Empty step...</span>}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <PromptEditor
                                                key={step.id}
                                                value={isStepActive ? localEditorContent : step.content}
                                                isDarkMode={isDarkMode}
                                                onChange={(val) => {
                                                    // EINE saubere Pipeline für alle. Kein erzwungener Fokus-Wechsel.
                                                    // CodeMirror zeigt den Text sofort an (0 Lag), die Speicherung passiert sicher im Hintergrund.
                                                    onEditorChange(val, step.id);
                                                }}
                                                snippets={snippets}
                                                prompts={prompts}
                                                allowAttachments={true}
                                                onNotification={onNotification}
                                            />
                                            
                                            {/* --- DEZENTE HELPER BAR IM EDITOR (IDE Status Bar) --- */}
                                            {isStepActive && (
                                                <div className="bg-bg-surface/30 border-t border-border py-1 px-3 text-[10px] text-text-faint flex justify-between items-center shrink-0 select-none">
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
                                        </>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {isStepActive && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: "auto" }}
                                            exit={{ height: 0 }}
                                            className="bg-bg-surface border-x border-b border-border rounded-b-lg flex items-start justify-between px-3 shadow-inner overflow-hidden min-h-[32px]"
                                        >
                                            <div className="flex-1 min-w-0 flex flex-nowrap items-center gap-2 overflow-hidden group/llmbar">
                                                <LlmInjectLabel context="step" />
                                                
                                                {/* --- START: HORIZONTAL SCROLL CONTAINER --- */}
                                                <div className="flex-1 min-w-0 relative group/step-llm flex items-center h-8">
                                                    <AnimatePresence>
                                                        {stepLlmScroll.left && (
                                                            <motion.button
                                                                initial={{ opacity: 0, x: -5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: -5 }}
                                                                onClick={(e) => { e.stopPropagation(); scrollStepLlmBar('left'); }}
                                                                className="absolute left-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.8)] text-text-faint hover:text-primary transition-colors cursor-pointer"
                                                            >
                                                                <ChevronLeft size={14} strokeWidth={2.5} />
                                                            </motion.button>
                                                        )}
                                                    </AnimatePresence>

                                                    <div 
                                                        ref={stepLlmScrollRef}
                                                        onWheel={handleStepLlmWheel}
                                                        onScroll={updateStepLlmScroll}
                                                        className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth h-full"
                                                        style={{
                                                            maskImage: stepLlmScroll.right 
                                                                ? 'linear-gradient(to right, black 85%, transparent 100%)' 
                                                                : stepLlmScroll.left 
                                                                    ? 'linear-gradient(to left, black 85%, transparent 100%)' 
                                                                    : 'none'
                                                        }}
                                                    >
                                                        {llms.map(llm => (
                                                            <LlmIconButton 
                                                                key={llm.id} 
                                                                size="sm" 
                                                                llm={llm} 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const isNewChat = e.ctrlKey || e.metaKey;
                                                                    const isOpenOnly = e.shiftKey;
                                                                    const currentContent = isStepActive ? localEditorContent : step.content;
                                                                    onLaunchStep(currentContent, llm, isNewChat, isOpenOnly, step.id);
                                                                }}
                                                                tooltip={getInjectionTooltip(llm.name, `Step ${index + 1}`)} 
                                                            />
                                                        ))}
                                                    </div>

                                                    <AnimatePresence>
                                                        {stepLlmScroll.right && (
                                                            <motion.button
                                                                initial={{ opacity: 0, x: 5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: 5 }}
                                                                onClick={(e) => { e.stopPropagation(); scrollStepLlmBar('right'); }}
                                                                className="absolute right-0 top-0 bottom-0 z-20 w-5 flex items-center justify-center bg-bg-surface shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.2)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.8)] text-text-faint hover:text-primary transition-colors cursor-pointer"
                                                            >
                                                                <ChevronRight size={14} strokeWidth={2.5} />
                                                            </motion.button>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                                {/* --- END: HORIZONTAL SCROLL CONTAINER --- */}
                                            </div>
                                            <div className="text-[10px] text-text-faint font-mono shrink-0 h-8 flex items-center">
                                                {((isStepActive ? localEditorContent : step.content) || "").length} chars
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {!isStepActive && <div className="h-2 bg-bg-surface border-x border-b border-border rounded-b-lg opacity-50"></div>}
                            </div>

                         {/* --- NEU: DEZENTER INSERT DIVIDER (PREMIUM POLISHED DESIGN - HARMONIZED) --- */}
                        {index < (activePrompt.chain || []).length - 1 && (
                            <div 
                                className="h-4 -my-2 flex items-center justify-center relative z-10 group/insert cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onAddStep(index); }}
                                title="Insert step below"
                            >
                                {/* Linke Linie - Neutraler Gradient, jetzt etwas heller */}
                                <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent dark:to-white/20 to-zinc-400/20 opacity-0 group-hover/insert:opacity-100 transition-opacity duration-500 mr-5" />
                                
                                {/* Schlichtes Plus (+) - Farbe entspricht der Linie, wird bei Hover heller */}
                                <div className="relative z-20 dark:text-white/20 text-zinc-400/30 dark:group-hover/insert:text-white/50 group-hover/insert:text-zinc-400 opacity-0 group-hover/insert:opacity-100 transform scale-90 group-hover/insert:scale-110 transition-all duration-300">
                                    <Plus size={14} strokeWidth={2.5} />
                                </div>

                                {/* Rechte Linie - Neutraler Gradient, jetzt etwas heller */}
                                <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent dark:to-white/20 to-zinc-400/20 opacity-0 group-hover/insert:opacity-100 transition-opacity duration-500 ml-5" />
                            </div>
                        )}
                        </React.Fragment>
                    );
                })}

                <button
                    onClick={onAddStep}
                    className="w-full py-4 border-2 border-dashed border-zinc-300 dark:border-white/20 rounded-lg text-text-muted hover:text-primary dark:hover:text-white hover:border-primary/50 dark:hover:border-white/40 hover:bg-bg-hover transition-all flex items-center justify-center gap-2 text-sm font-medium mb-10"
                >
                    <Plus size={16} /> Add Follow-Up Prompt
                </button>
            </div>

            <MultiTaggerModal
                isOpen={isMultiTaggerOpen}
                onClose={() => setIsMultiTaggerOpen(false)}
                promptTitle={localTitle || "Untitled Prompt"}
                allTags={tags}
                currentTags={activePrompt.tags || []}
                onSave={onTagsChange}
            />

            <CommunityShareModal
                isOpen={isCommunityShareOpen}
                onClose={() => setIsCommunityShareOpen(false)}
                prompt={activePrompt}
                snippets={snippets}
                knowledgeTiles={knowledgeTiles}
                onNotification={onNotification}
            />

            {createPortal(
                <AnimatePresence>
                    {showLightbox && (
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-8 overflow-hidden">
                            {/* 1. DER BACKDROP (Dashboard bleibt dezent sichtbar) */}
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/80 backdrop-blur-lg" 
                                onClick={() => !cropMode && setShowLightbox(false)} 
                            />

                            {/* 2. DAS STUDIO MODAL (Die Card) */}
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className={`relative z-10 w-full max-w-5xl h-full max-h-[85vh] flex overflow-hidden rounded-[2rem] transition-all duration-300
                                    ${isDarkMode 
                                        ? 'bg-[#131316] border border-white/10 ring-1 ring-black shadow-[0_0_50px_rgba(0,0,0,0.8)]' 
                                        : 'bg-white border border-zinc-200 shadow-2xl'}`}
                            >
                                
                                {/* LINKE SPALTE: THE STAGE (Professioneller Header & Bild-Bereich) */}
                                <div className={`flex-1 flex flex-col min-w-0 ${isDarkMode ? 'bg-black/20' : 'bg-zinc-50'}`}>
                                    
                                    {/* NEU: Stage Header - Synchronisiert mit Inspector */}
                                    <div className="h-14 flex items-center justify-between px-8 border-b border-black/5 dark:border-white/5 shrink-0">
                                        <div className="flex items-center gap-3">
                                            {/* Puls-Punkt dezent halten */}
                                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse transition-colors duration-500 
                                                ${cropMode ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'}`} 
                                            />
                                            
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                                    Reference Image
                                                </span>
                                                {cropMode && (
                                                    <span className="text-[9px] font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded animate-in fade-in zoom-in-95 duration-300">
                                                        Editing
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* BILD-BEREICH (Zentriert & Sauber) */}
                                    <div className="flex-1 relative flex items-center justify-center p-12 overflow-hidden bg-black/[0.02] dark:bg-black/20">
                                        <div className="relative group shadow-xl rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 transition-shadow duration-500">
                                            <div className="relative inline-block crop-container-ref">
                                                <img 
                                                    src={activePrompt.coverImage} 
                                                    onLoad={handleImgLoad}
                                                    className="max-h-[65vh] w-auto object-contain block select-none" 
                                                    alt="Cover"
                                                />
                                                
                                                {/* Das Dark-Overlay (Crop Box) - wird nur im Edit-Modus übergelegt */}
                                                {cropMode && (
                                                    <div 
                                                        style={{
                                                            left: `${crop.x}%`, top: `${crop.y}%`, 
                                                            width: `${crop.width}%`, height: `${crop.height}%`,
                                                            outline: '2px solid #6366f1', boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)'
                                                        }}
                                                        className="absolute cursor-move border border-white/50 group z-50 backdrop-brightness-110 shadow-2xl"
                                                        onMouseDown={(e) => handleCropDragStart(e)}
                                                    >
                                                        <div className="absolute inset-x-0 inset-y-1/3 border-y border-white/20 pointer-events-none" />
                                                        <div className="absolute inset-y-0 inset-x-1/3 border-x border-white/20 pointer-events-none" />

                                                        <div 
                                                            className="absolute -bottom-2 -right-2 w-5 h-5 bg-primary rounded-full cursor-nwse-resize shadow-lg flex items-center justify-center border-2 border-white transition-transform hover:scale-125 active:scale-95" 
                                                            onMouseDown={(e) => handleCropResizeStart(e)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RECHTE SPALTE: THE INSPECTOR (Kompakter) */}
                                <div className={`w-[320px] flex flex-col border-l transition-colors
                                    ${isDarkMode ? 'bg-[#18181b] border-white/5' : 'bg-zinc-50/50 border-zinc-200'}`}>
                                    
                                    <div className="h-14 px-6 flex justify-between items-center border-b border-black/5 dark:border-white/5">
                                        <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Inspector</h3>
                                        <button 
                                            onClick={() => setShowLightbox(false)} 
                                            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all outline-none"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                                        {/* 1. PREVIEW SECTION */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Live Result</span>
                                                <span className="text-[9px] text-primary font-mono px-2 py-0.5 bg-primary/10 rounded">1:1 Square</span>
                                            </div>
                                            <div className="aspect-square w-full rounded-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden bg-zinc-800 shadow-xl relative">
                                                <div 
                                                    style={{
                                                        width: '100%', height: '100%',
                                                        backgroundImage: `url(${activePrompt.coverImage})`,
                                                        backgroundSize: `${100 / (crop.width / 100)}% auto`,
                                                        backgroundPosition: `${(100 - crop.width) <= 0 ? 0 : (crop.x / (100 - crop.width)) * 100}% ${(100 - crop.height) <= 0 ? 0 : (crop.y / (100 - crop.height)) * 100}%`,
                                                        backgroundRepeat: 'no-repeat'
                                                    }} 
                                                />
                                                <div className="absolute inset-0 pointer-events-none shadow-inner ring-1 ring-inset ring-black/5 dark:ring-white/5" />
                                            </div>
                                        </div>

                                        {/* 2. ACTIONS */}
                                        <div className="space-y-3">
                                            {!cropMode ? (
                                                <button 
                                                    onClick={() => setCropMode(true)}
                                                    className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                >
                                                    <Maximize size={16} /> Enter Crop Mode
                                                </button>
                                            ) : (
                                                <>
                                                    <button 
                                                        onClick={saveFinalCrop}
                                                        className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                    >
                                                        <Check size={16} strokeWidth={3} /> Apply & Save
                                                    </button>
                                                    <button 
                                                        onClick={() => setCropMode(false)}
                                                        className="w-full py-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium uppercase tracking-widest transition-all"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                            
                                            <label className="w-full py-2.5 bg-bg-elevated border border-border text-text-main hover:bg-bg-surface rounded-lg text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer transition-colors">
                                                <RefreshCw size={16} /> 
                                                Change Source
                                                <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const base64 = await compressImage(file);
                                                        const defaultThumb = await extractThumbnail(base64, { x: 0, y: 0, width: 100, height: 100 });
                                                        savePrompt({ ...activePrompt, coverImage: base64, thumbnailImage: defaultThumb, coverCrop: undefined });
                                                        setShowLightbox(false);
                                                    }
                                                }} />
                                            </label>
                                        </div>

                                        {/* 3. METADATA */}
                                        <div className="pt-6 border-t border-black/5 dark:border-white/5">
                                            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-2">
                                                <div className="flex justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                                    <span>Format:</span>
                                                    <span className={`${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                        {activePrompt.coverImage
                                                            ? (activePrompt.coverImage.split(';')[0].split('/')[1]?.toUpperCase() || 'WEBP') + ' (High)'
                                                            : 'WEBP (High)'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                                    <span>Size:</span>
                                                    <span className={`${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                        {activePrompt.coverImage
                                                            ? `~${Math.round((activePrompt.coverImage.length * 3 / 4) / 1024)} KB`
                                                            : '~45 KB'}
                                                    </span>
                                                </div>
                                                {imgNaturalSize.width > 1 && (
                                                    <>
                                                        <div className="flex justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                                            <span>Dimensions:</span>
                                                            <span className={`${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                                {imgNaturalSize.width} × {imgNaturalSize.height} px
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                                            <span>Aspect Ratio:</span>
                                                            <span className="text-indigo-500 font-bold">
                                                                {getAspectRatio(imgNaturalSize.width, imgNaturalSize.height)}
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* 4. DANGER ZONE */}
                                        <div className="pt-3">
                                            <button 
                                                onClick={() => { 
                                                    savePrompt({ ...activePrompt, coverImage: null, thumbnailImage: null }); 
                                                    setShowLightbox(false); 
                                                }}
                                                className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                            >
                                                <Trash2 size={14} /> Remove Image
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}

