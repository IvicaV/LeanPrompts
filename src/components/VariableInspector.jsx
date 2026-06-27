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
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Sparkles, UploadCloud, File, X, Eraser, Info,
    Command, Eye, EyeOff, Lightbulb, Save, Trash2, AlertTriangle, Bookmark,
    Image as ImageIcon, FileText, FileJson, FileArchive, FileSpreadsheet, FileVideo, FileAudio, FileCode,
    Pencil, ChevronDown, Check, Plus
} from 'lucide-react';
import { parseVariables } from '../utils/variableParser';
import { filterOversizedFiles, formatFileSize } from '../utils/formatFileSize';
import { enableDragSelectScroll } from '../utils/scrollHelper';
import ConfirmationModal from './ConfirmationModal';

const isValueEqual = (val1, val2) => {
    if (val1 === val2) return true;
    if (!val1 && !val2) return true;
    
    const isArr1 = Array.isArray(val1);
    const isArr2 = Array.isArray(val2);
    if (isArr1 !== isArr2) return false;
    
    if (isArr1 && isArr2) {
        if (val1.length !== val2.length) return false;
        for (let i = 0; i < val1.length; i++) {
            const f1 = val1[i];
            const f2 = val2[i];
            if (!f1 || !f2) return false;
            if (f1.name !== f2.name || f1.size !== f2.size) return false;
        }
        return true;
    }
    
    return String(val1) === String(val2);
};

function VariableInspector({
    variables,
    snippetVariables,
    snippets,
    values,
    onChange,
    files = [],
    onFilesChange,
    onClear,
    rawContent = "",
    ignoredVariables = [],
    onToggleIgnore,
    onNotification,
    presets = {},
    onSavePreset,
    onDeletePreset,
    onLoadPreset,
    onRenamePreset,
    activePresetName = null
}) {
    const [highlightState, setHighlightState] = useState({ names: [], theme: 'primary' });
    const [openDropdown, setOpenDropdown] = useState(null); // <-- NEUER STATE HIER
    const [isFlipped, setIsFlipped] = useState(false); // <-- NEU: Für Smart Flipping
    const [maxDropdownHeight, setMaxDropdownHeight] = useState(192); // <-- NEU: Standard 192px (max-h-48)
    const fileInputRef = useRef(null);

    // =========================================================================
    // [PROTECTED: ZERO-REGRESSION SCHEMA TRACKER]
    // Verhindert "Stale State" (alte Dropdown-Werte in neuen Textfeldern).
    // Nutzt einen "Single-Pass Yield", um React-State-Clobbering im Parent 
    // (Dashboard.jsx) bei multiplen gleichzeitigen Änderungen zu 100% auszuschließen.
    // =========================================================================
    const prevSchemaRef = useRef({});

    useEffect(() => {
        for (const variable of variables) {
            const cleanVar = variable.replace(/^!/, '').replace(/^!file:/i, 'file:');
            const userVal = values[cleanVar] !== undefined ? values[cleanVar] : values[variable];
            if (!userVal) continue; // Leere Werte müssen nicht bereinigt werden

            // 1. Exakte Replikation des Parsing-Verhaltens aus dem Render-Tree
            const isFileVar = variable.toLowerCase().startsWith('file:') || variable.toLowerCase().startsWith('!file:');
            let displayName = isFileVar ? variable.substring(5).trim() : variable.replace(/^!/, '').trim();
            let rawDefault = "";
            
            if (!isFileVar && rawContent) {
                try {
                    const escapedVarName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\{\\{\\s*${escapedVarName}\\s*:(.*?)\\}\\}`, 'i');
                    const match = rawContent.match(regex);
                    if (match && match[1] && match[1].trim()) {
                        rawDefault = match[1].trim();
                    }
                } catch(e) {}
            }

            const options = rawDefault.includes('|') ? rawDefault.split('|').map(s => s.trim()).filter(Boolean) : [];
            const isDropdown = options.length > 1;

            // 2. Mismatch-Detektion (Schema-Vergleich)
            const prev = prevSchemaRef.current[variable];
            let isInvalid = false;
            
            if (prev) {
                if (prev.isDropdown && !isDropdown) {
                    isInvalid = true; // Regel 1: War Dropdown, ist jetzt Text
                } else if (isDropdown && !options.includes(userVal)) {
                    isInvalid = true; // Regel 2: Ist Dropdown, aber Option existiert nicht mehr
                }
            }

            // State für den nächsten Render-Cycle sichern
            prevSchemaRef.current[variable] = { isDropdown };

            // 3. Single-Pass Cleanup
            if (isInvalid) {
                // Bereinigt exakt EINE Variable pro Render-Zyklus. 
                // Verhindert jegliche Race-Conditions im Dashboard State.
                onChange(variable, "");
                return; 
            }
        }
    }, [variables, rawContent, values, onChange]);
    // =========================================================================

    // --- [PROTECTED: ZERO-REGRESSION CLEANUP] ---
    // Garantiert, dass keine Hover-States hängenbleiben, wenn der Inspector 
    // geschlossen, ausgeblendet (Zen-Mode) oder der Prompt gewechselt wird.
    useEffect(() => {
        return () => {
            window.lp_hovered_dropzone = null;
        };
    }, []);

    const getFileIcon = (file, size = 14, additionalClass = "") => {
        if (file.isGhost || (!file.data && !(file instanceof Blob))) {
            return <AlertTriangle size={size} className={`shrink-0 ${additionalClass}`} />;
        }
        const type = file.type?.toLowerCase() || '';
        if (type.includes('image/')) return <ImageIcon size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('pdf')) return <FileText size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('json') || type.includes('xml')) return <FileJson size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('spreadsheet') || type.includes('csv') || type.includes('excel')) return <FileSpreadsheet size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('zip') || type.includes('archive') || type.includes('tar') || type.includes('rar')) return <FileArchive size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('video/')) return <FileVideo size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('audio/')) return <FileAudio size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('html') || type.includes('css') || type.includes('javascript') || type.includes('text/x-') || type.includes('application/x-') || file.name?.match(/\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|php|rb|swift|kt)$/i)) return <FileCode size={size} className={`shrink-0 ${additionalClass}`} />;
        if (type.includes('text/') || type.includes('markdown')) return <FileText size={size} className={`shrink-0 ${additionalClass}`} />;
        return <File size={size} className={`shrink-0 ${additionalClass}`} />;
    };

    // POINT 1: Refs für die automatische Scroll-Steuerung
    const varRefs = useRef({});
    const scrollContainerRef = useRef(null);

    // Hilfsfunktion für den Fokus-Vorgang
    const executeHighlight = (names, theme = 'primary') => {
        if (!names || names.length === 0) return;

        // Scroll to FIRST variable in the group
        const firstTarget = varRefs.current[names[0]];
        if (firstTarget && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const containerRect = container.getBoundingClientRect();
            const elRect = firstTarget.getBoundingClientRect();
            
            // block: 'center' equivalent
            container.scrollTo({
                top: container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2),
                behavior: 'smooth'
            });

            // Only focus input if it's a single variable
            if (names.length === 1) {
                // Erfasst Textareas, Dropzones und Enum-Dropdowns sicher
                const inputTarget = firstTarget.querySelector('textarea, [data-lp-focus-target="true"]');
                // preventScroll: true verhindert, dass der native Browser-Fokus unsere eigene, weiche Scroll-Logik überschreibt!
                if (inputTarget) inputTarget.focus({ preventScroll: true });
            }
        }

        // Set Visual Highlight
        setHighlightState({ names, theme });

        // Remove after 2s
        setTimeout(() => setHighlightState({ names: [], theme: 'primary' }), 2000);
    };

    // POINT 1: Catch-up beim Mounten (Falls das Event während des Tab-Wechsels gefeuert wurde)
    useEffect(() => {
        if (window.lp_pending_focus) {
            const varName = window.lp_pending_focus;
            window.lp_pending_focus = null;
            // Kleiner Timeout, damit Tab-Animationen beendet sind
            setTimeout(() => executeHighlight([varName], 'primary'), 150);
        }
        if (window.lp_pending_highlight) {
            const { names, theme } = window.lp_pending_highlight;
            window.lp_pending_highlight = null;
            setTimeout(() => executeHighlight(names, theme), 150);
        }
    }, []);

    // POINT 1: Listener für den Fokus aus dem Editor (Smart Variable Focus)
    useEffect(() => {
        const handleFocusOne = (e) => executeHighlight([e.detail.name], 'primary');
        const handleHighlightGroup = (e) => executeHighlight(e.detail.names, e.detail.theme);

        window.addEventListener('lp-focus-variable', handleFocusOne);
        window.addEventListener('lp-highlight-variables', handleHighlightGroup);

        return () => {
            window.removeEventListener('lp-focus-variable', handleFocusOne);
            window.removeEventListener('lp-highlight-variables', handleHighlightGroup);
        };
    }, []);

    useEffect(() => {
        const handleGlobalFilePaste = async (e) => {
            const { files: pastedFiles, zone } = e.detail;
            if (!pastedFiles || pastedFiles.length === 0 || !zone) return;

            let targetVar = null;
            if (zone === 'global') {
                targetVar = 'global';
            } else if (zone.startsWith('var:')) {
                targetVar = zone.substring(4);
            }

            if (!targetVar) return;

            // Existing files lookup for duplicate protection
            const existingFiles = targetVar === 'global' ? (files || []) : (Array.isArray(values[targetVar]) ? values[targetVar] : []);
            
            const newFiles = [];
            let duplicateCount = 0;

            for (const f of pastedFiles) {
                // DUPLICATE GUARD: Compare name and byte size
                const isDuplicate = existingFiles.some(ex => ex.name === f.name && ex.size === f.size);
                if (isDuplicate) {
                    duplicateCount++;
                    continue; // Skip processing this file
                }

                const accepted = filterOversizedFiles([f], (rejected) => {
                    if (onNotification) onNotification(`"${rejected.name}" exceeds 25 MB limit`, 'warning');
                });
                
                if (accepted.length === 0) continue;

                const fileName = (f.name && f.name !== 'image.png') 
                    ? f.name 
                    : `clipboard-${Date.now().toString().slice(-4)}.${f.type.split('/')[1] || 'png'}`;
                
                const fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        name: fileName, type: f.type, size: f.size,
                        data: reader.result, lastModified: f.lastModified || Date.now()
                    });
                    reader.readAsDataURL(f);
                });
                newFiles.push(fileData);
            }

            // Feedback UI
            if (duplicateCount > 0 && onNotification) {
                onNotification(`${duplicateCount} file(s) ignored (already attached).`, 'warning');
            }

            if (newFiles.length === 0) return; // Stop if nothing new to add

            // Dispatch update
            if (targetVar === 'global') {
                if (onFilesChange) onFilesChange([...existingFiles, ...newFiles]);
            } else {
                onChange(targetVar, [...existingFiles, ...newFiles]);
            }
            
            if (onNotification) onNotification(`${newFiles.length} file(s) pasted`, 'success');
        };

        window.addEventListener('lp-global-file-paste', handleGlobalFilePaste);
        return () => window.removeEventListener('lp-global-file-paste', handleGlobalFilePaste);
    }, [variables, values, files, onChange, onFilesChange, onNotification]);

    // --- ZERO-REGRESSION: Perfektes Auto-Resize mit synchronem Scroll-Lock ---
    const adjustHeight = (el) => {
        if (!el) return;
        
        // 1. Suche den umschließenden Scroll-Container (oder nutze die Ref)
        const container = el.closest('.overflow-y-auto') || scrollContainerRef.current;
        // 2. Sichere die aktuelle Scroll-Position
        const savedScrollTop = container ? container.scrollTop : 0;

        // 3. Höhenberechnung ausführen
        el.style.height = 'auto';
        // +2 Pixel für den top/bottom Rahmen (verhindert den Phantom-Scrollbalken)
        const newHeight = el.scrollHeight + 2;
        el.style.height = `${newHeight}px`;

        // 4. Scroll-Position sofort im selben Frame wiederherstellen
        if (container && container.scrollTop !== savedScrollTop) {
            container.scrollTop = savedScrollTop;
        }
    };

    // Passt Felder an, wenn Presets geladen werden
    useEffect(() => {
        const textareas = document.querySelectorAll('.lp-auto-resize');
        textareas.forEach(el => adjustHeight(el));
    }, [values]);
    // ----------------------------------------------

    const rootVariables = useMemo(() => {
        return parseVariables(rawContent);
    }, [rawContent]);

    const [isDragging, setIsDragging] = useState(false);
    const [draggingVars, setDraggingVars] = useState({});

    const handleVarDragEnter = (e, variable) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingVars(prev => ({ ...prev, [variable]: true }));
    };

    const handleVarDragLeave = (e, variable) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setDraggingVars(prev => ({ ...prev, [variable]: false }));
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Prevent flickering when hovering over children inside the drop zone
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        const accepted = filterOversizedFiles(droppedFiles, (f) => {
            if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`);
        });
        if (accepted.length > 0 && onFilesChange) onFilesChange([...files, ...accepted]);
    };

    const handleFileRemove = (index) => {
        if (onFilesChange) onFilesChange(files.filter((_, i) => i !== index));
    };

    const handleFileSelect = (e) => {
        const selected = Array.from(e.target.files);
        const accepted = filterOversizedFiles(selected, (f) => {
            if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`);
        });
        if (accepted.length > 0 && onFilesChange) onFilesChange([...files, ...accepted]);
    };

    // Helper Check: Gibt es aktiven Inhalt zum Löschen?
    const hasContent = Object.keys(values).some(k => values[k]) || files.length > 0;

    const handlePaste = (e) => {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const pastedFiles = Array.from(e.clipboardData.files);
            const accepted = filterOversizedFiles(pastedFiles, (f) => {
                if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`);
            });
            if (accepted.length > 0 && onFilesChange) onFilesChange([...files, ...accepted]);
            if (accepted.length > 0 && onNotification) onNotification(`Added ${accepted.length} file(s) from clipboard`);
        }
    };

    const [presetName, setPresetName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showPresets, setShowPresets] = useState(false);
    const [presetPopupPos, setPresetPopupPos] = useState({ top: 0, left: 0 });
    const presetMenuRef = useRef(null);

    // Overwrite Confirmation State
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const [pendingPresetName, setPendingPresetName] = useState('');

    // Track the last loaded or saved preset to enable rapid overwrites
    const [lastLoadedPreset, setLastLoadedPreset] = useState(null);

    useEffect(() => {
        setLastLoadedPreset(activePresetName);
    }, [activePresetName]);

    // Rename state: tracks which preset is being edited inline
    const [editingPresetName, setEditingPresetName] = useState(null);
    const [editPresetValue, setEditPresetValue] = useState('');

    // --- INTEGRITY DETECTOR: Vergleicht im Hintergrund die aktuellen Werte mit dem geladenen Preset ---
    const isPresetDirty = useMemo(() => {
        if (!lastLoadedPreset || !presets || !presets[lastLoadedPreset]) return false;
        const loadedValues = presets[lastLoadedPreset].values || {};
        
        const variablesDirty = variables.some(v => {
            const cleanV = v.replace(/^!/, '').replace(/^!file:/i, 'file:');
            const activeVal = values[cleanV] !== undefined ? values[cleanV] : values[v];
            const loadedVal = loadedValues[cleanV] !== undefined ? loadedValues[cleanV] : loadedValues[v];
            
            // Datei-Arrays vergleichen
            if (Array.isArray(activeVal) && Array.isArray(loadedVal)) {
                if (activeVal.length !== loadedVal.length) return true;
                return activeVal.some((file, idx) => file.name !== loadedVal[idx]?.name || file.size !== loadedVal[idx]?.size);
            }
            return String(activeVal || "") !== String(loadedVal || "");
        });

        if (variablesDirty) return true;

        // Global files vergleichen
        const currentFiles = files || [];
        const presetFiles = presets[lastLoadedPreset].files || [];
        if (currentFiles.length !== presetFiles.length) return true;
        if (currentFiles.some((file, idx) => file.name !== presetFiles[idx]?.name || file.size !== presetFiles[idx]?.size)) return true;

        return false;
    }, [lastLoadedPreset, presets, values, variables, files]);

    const handleStartSavingPreset = () => {
        if (lastLoadedPreset) {
            setPresetName(`${lastLoadedPreset} (Copy)`);
        } else {
            const now = new Date();
            const dd   = String(now.getDate()).padStart(2, '0');
            const mm   = String(now.getMonth() + 1).padStart(2, '0');
            const yy   = String(now.getFullYear()).slice(-2);
            const hh   = String(now.getHours()).padStart(2, '0');
            const min  = String(now.getMinutes()).padStart(2, '0');
            setPresetName(`Preset ${dd}.${mm}.${yy} ${hh}:${min}`);
        }
        setIsSaving(true);
    };

    // POINT 8: Click-outside Detection für das Preset-Menü
    useEffect(() => {
        if (!showPresets) return;

        const handleClickOutside = (e) => {
            if (presetMenuRef.current && !presetMenuRef.current.contains(e.target)) {
                setShowPresets(false);
            }
        };

        // Delay to prevent immediate close if the event bubbled from the button click
        const timeout = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [showPresets]);

    const handleSave = () => {
        const trimmed = presetName.trim();
        if (!trimmed) return;

        if (presets && presets[trimmed]) {
            // Konflikt erkannt: Öffne das Bestätigungs-Modal
            setPendingPresetName(trimmed);
            setShowOverwriteConfirm(true);
        } else {
            // Kein Konflikt: Normal speichern
            onSavePreset(trimmed);
            setLastLoadedPreset(trimmed);
            setPresetName('');
            setIsSaving(false);
        }
    };

    // =========================================================================
    // CLICK-OUTSIDE HANDLER (Schließt das Variablen-Dropdown bei Klick außerhalb)
    // Ersetzt den blockierenden Fullscreen-Backdrop für barrierefreies Scrollen.
    // =========================================================================
    useEffect(() => {
        if (openDropdown === null) return;

        const handleClickOutside = (e) => {
            // Prüfen, ob der Klick auf den Button (Trigger) oder das Dropdown selbst ging
            const isTrigger = e.target.closest('[data-lp-focus-target="true"]');
            const isDropdown = e.target.closest('.dm-dropdown');
            
            if (!isTrigger && !isDropdown) {
                setOpenDropdown(null);
            }
        };

        // Kurze Verzögerung, um ein sofortiges Schließen beim Öffnen-Klick zu verhindern
        const timeout = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [openDropdown]);

    // =========================================================================
    // DEFENSIVER SCROLL-HANDLER (Nur für Presets aktiv)
    // Variablen-Dropdowns dürfen offen bleiben, da sie nativ mitscrollen.
    // =========================================================================
    useEffect(() => {
        if (!showPresets) return;

        const handleContainerScroll = (e) => {
            if (e.target.closest('.dm-dropdown')) return;
            setShowPresets(false);
        };

        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleContainerScroll, { passive: true });
        }

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleContainerScroll);
            }
        };
    }, [showPresets]);

    return (
        <div className="flex flex-col h-full bg-bg">
            <div className="p-4 border-b border-border bg-bg-surface shrink-0 flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Inspector
                </h3>                <div className="flex items-center gap-1.5 relative" ref={presetMenuRef}>
                    {isSaving ? (
                        // --- STATE 1: SPEICHER-DIALOG (Vermeidet Überlappungen) ---
                        <div className="flex items-center gap-1 bg-bg p-1 rounded-lg border border-border/50 shadow-xl animate-in fade-in slide-in-from-right-2 duration-300">
                            <input
                                type="text"
                                placeholder="Preset Name..."
                                className="w-[120px] bg-transparent px-1 py-0.5 text-[10px] text-text-main focus:outline-none"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSave();
                                    if (e.key === 'Escape') { setIsSaving(false); setPresetName(''); }
                                }}
                                autoFocus
                            />
                            <button
                                onClick={handleSave}
                                disabled={!presetName.trim()}
                                className="text-primary dark:text-indigo-400 hover:text-primary-hover p-1 rounded transition-colors disabled:opacity-30"
                                title="Confirm Save"
                            >
                                <Save size={12} />
                            </button>
                            <button 
                                onClick={() => { setIsSaving(false); setPresetName(''); }} 
                                className="text-text-muted hover:text-text-main p-1"
                                title="Cancel"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        // --- STATE 2, 3 & 4: CONTROL BAR (DOPPEL-AKTION MODUS) ---
                        <div className="flex items-center gap-2 animate-in fade-in duration-200">
                            {lastLoadedPreset ? (
                                // STATE 2: EIN PRESET IST GELADEN (FOKUSSIERT AUF ZWEI AKTIONEN)
                                <div className="flex items-center gap-1 bg-bg-elevated/40 border border-border/60 rounded-lg p-1">
                                    <span 
                                        className="text-[10px] text-text-muted truncate max-w-[90px] pl-1.5 font-bold select-none"
                                        title={`${lastLoadedPreset}${isPresetDirty ? ' (modified)' : ''}`}
                                    >
                                        {lastLoadedPreset}{isPresetDirty && '*'}
                                    </span>
                                    
                                    {isPresetDirty && (
                                        <button
                                            onClick={() => {
                                                onSavePreset(lastLoadedPreset);
                                                if (onNotification) onNotification(`Preset "${lastLoadedPreset}" updated!`, "success");
                                            }}
                                            className="p-1 hover:bg-bg rounded text-emerald-500 hover:text-emerald-400 transition-colors shrink-0 cursor-pointer"
                                            title={`Update "${lastLoadedPreset}" with current changes (1-Click)`}
                                        >
                                            <Save size={12} />
                                        </button>
                                    )}

                                    <button
                                        onClick={handleStartSavingPreset}
                                        className="p-1 hover:bg-bg rounded text-text-muted hover:text-primary transition-colors shrink-0 cursor-pointer"
                                        title="Save as a new copy..."
                                    >
                                        <Plus size={12} />
                                    </button>
                                    
                                    {presets && Object.keys(presets).length > 1 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (showPresets) {
                                                    setShowPresets(false);
                                                } else {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                    setPresetPopupPos({
                                                        right: window.innerWidth - rect.right,
                                                        ...(isFlipped 
                                                            ? { bottom: window.innerHeight - rect.top + 4 } 
                                                            : { top: rect.bottom + 4 })
                                                    });
                                                    setShowPresets(true);
                                                }
                                            }}
                                            className={`p-1 rounded hover:bg-bg-hover transition-all ${showPresets ? 'text-primary' : 'text-text-faint hover:text-text-muted'} cursor-pointer`}
                                            title="Switch Preset"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                // KEIN PRESET GELADEN
                                presets && Object.keys(presets).length > 0 ? (
                                    // STATE 3: PRESETS EXISTIEREN (DRAFT MODUS)
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (showPresets) {
                                                    setShowPresets(false);
                                                } else {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                    setPresetPopupPos({
                                                        right: window.innerWidth - rect.right,
                                                        ...(isFlipped 
                                                            ? { bottom: window.innerHeight - rect.top + 4 } 
                                                            : { top: rect.bottom + 4 })
                                                    });
                                                    setShowPresets(true);
                                                }
                                            }}
                                            className={`text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-1 ${showPresets ? 'text-primary' : 'text-text-faint hover:text-text-muted'} cursor-pointer`}
                                            title="Load previously saved text inputs and file attachments"
                                        >
                                            Load Preset <ChevronDown size={10} className="shrink-0" />
                                        </button>
                                        <button
                                            onClick={handleStartSavingPreset}
                                            className="text-[9px] font-bold uppercase tracking-widest text-text-faint hover:text-text-muted transition-all"
                                            title="Save current variables and files as a new preset"
                                        >
                                            Save
                                        </button>
                                    </div>
                                ) : (
                                    // STATE 4: KEINE PRESETS EXISTIEREN
                                    <button
                                        onClick={handleStartSavingPreset}
                                        className="text-[9px] font-bold uppercase tracking-widest text-text-faint hover:text-text-muted transition-all"
                                        title="Save current variables and files as a reusable preset"
                                    >
                                        Save as Preset
                                    </button>
                                )
                            )}
                        </div>
                    )}

                    {showPresets && presets && Object.keys(presets).length > 0 && createPortal(
                        <div 
                                className="fixed w-56 bg-bg-surface shadow-2xl rounded-xl border border-border p-1 z-[9999] animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                style={presetPopupPos}
                                onClick={(e) => e.stopPropagation()}
                            >
                         <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-0.5">
                                {/* Header row with X-close button */}
                                <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-text-faint uppercase tracking-wider">Select Preset</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowPresets(false); }}
                                        className="text-text-muted hover:text-text-main p-0.5 rounded hover:bg-bg-hover transition-colors"
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                {Object.keys(presets).sort().map(name => (
                                    <div key={name} className="group flex items-center justify-between hover:bg-bg-hover rounded-lg px-2 py-1.5 transition-all cursor-pointer border border-transparent">
                                        {/* Inline rename input */}
                                        {editingPresetName === name ? (
                                            <div className="flex items-center gap-1 flex-1 w-full" onClick={e => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    value={editPresetValue}
                                                    onChange={e => setEditPresetValue(e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            const trimmed = editPresetValue.trim();
                                                            if (trimmed && trimmed !== name) onRenamePreset(name, trimmed);
                                                            setEditingPresetName(null);
                                                        }
                                                        if (e.key === 'Escape') setEditingPresetName(null);
                                                    }}
                                                    onBlur={() => {
                                                        const trimmed = editPresetValue.trim();
                                                        if (trimmed && trimmed !== name) onRenamePreset(name, trimmed);
                                                        setEditingPresetName(null);
                                                    }}
                                                    className="bg-bg-elevated border border-primary px-1.5 py-0.5 rounded text-[10px] text-text-main w-full focus:outline-none shadow-inner"
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <span
                                                    className="text-[10px] text-text-muted group-hover:text-text-main truncate flex-1 font-medium"
                                                    onClick={() => {
                                                        if (isSaving) {
                                                            // Im Speicher-Modus: Nur den Namen ins Eingabefeld übernehmen (Überschreib-Ziel)
                                                            setPresetName(name);
                                                            setShowPresets(false);
                                                        } else {
                                                            // Im Normal-Modus: Preset wie gewohnt laden
                                                            setLastLoadedPreset(name);
                                                            onLoadPreset(name);
                                                            setShowPresets(false);
                                                        }
                                                    }}
                                                >
                                                    {name}
                                                </span>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingPresetName(name);
                                                            setEditPresetValue(name);
                                                        }}
                                                        className="text-text-faint hover:text-primary hover:bg-primary/15 p-1 rounded-md transition-colors duration-150"
                                                        title="Rename Preset"
                                                    >
                                                        <Pencil size={10} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeletePreset(name);
                                                        }}
                                                        className="text-text-faint hover:text-red-400 p-1 rounded-md transition-all hover:bg-red-400/10"
                                                        title="Delete Preset"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar"
            >

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                            Variables ({variables.length})
                        </div>

                        {hasContent && (
                            <button
                                onClick={onClear}
                                className="text-text-muted hover:text-red-400 p-1 transition-colors"
                                title="Clear all inputs and files"
                            >
                                <Eraser size={12} />
                            </button>
                        )}
                    </div>

                    {variables.length === 0 ? (
                        <div className="text-xs text-text-muted italic opacity-60 leading-relaxed">
                            No variables detected. Use <code className="text-[var(--hl-variable-text)] bg-[var(--hl-variable-bg)] px-1.5 py-0.5 rounded font-bold">{'{{Var}}'}</code> for text or <code className="text-[var(--hl-variable-text)] bg-[var(--hl-variable-bg)] px-1.5 py-0.5 rounded font-bold">{'{{file: Name}}'}</code> for files.
                        </div>
                    ) : (
                        variables.map(variable => {
                            const isIgnored = (ignoredVariables || []).includes(variable);
                            const isHighlighted = highlightState.names.includes(variable);
                            const themeClass = highlightState.theme === 'amber'
                                ? 'border-amber-400 ring-2 ring-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                                : 'border-primary ring-2 ring-primary bg-primary-subtle shadow-lg shadow-primary/10';

                            // --- ZERO-REGRESSION: Required Logic ---
                            const isRequired = variable.startsWith('!');
                            const isFileVar = variable.toLowerCase().startsWith('file:') || variable.toLowerCase().startsWith('!file:');

                            let displayName = variable;
                            if (variable.toLowerCase().startsWith('!file:')) displayName = variable.substring(6).trim();
                            else if (variable.toLowerCase().startsWith('file:')) displayName = variable.substring(5).trim();
                            else if (isRequired) displayName = variable.substring(1).trim();

                            // ZERO-REGRESSION: Universeller Read-Only Fallback für Files UND Text.
                            // Sucht nach dem sauberen Key, greift notfalls auf das Original zurück.
                            const cleanVar = variable.replace(/^!/, '').replace(/^!file:/i, 'file:');
                            const resolvedVal = values[cleanVar] !== undefined ? values[cleanVar] : values[variable];
                            
                            const fileVal = resolvedVal;

                            // === ZERO-REGRESSION DATA EXTRACTION ===
                            let rawDefault = "";
                            if (!isFileVar && rawContent) {
                                try {
                                    const escapedVarName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const regex = new RegExp(`\\{\\{\\s*${escapedVarName}\\s*:(.*?)\\}\\}`, 'i');
                                    const match = rawContent.match(regex);
                                    if (match && match[1] && match[1].trim()) {
                                        rawDefault = match[1].trim();
                                    }
                                } catch (e) {
                                    /* Fail gracefully */
                                }
                            }

                            // ENUM / DROPDOWN DETECTION (Strict Guard)
                            // Splittet nach '|', entfernt leere Strings. Nur wenn > 1 valide Option existiert, wird es zum Dropdown.
                            const dropdownOptions = rawDefault.includes('|') ? rawDefault.split('|').map(s => s.trim()).filter(Boolean) : [];
                            const isDropdown = dropdownOptions.length > 1;
                            const defaultVal = isDropdown ? dropdownOptions[0] : "";

                            // Safely determine if user provided input
                            const userVal = resolvedVal;
                            const isEmpty = isFileVar
                                ? (!userVal || !Array.isArray(userVal) || userVal.length === 0)
                                : (!userVal || String(userVal).trim() === "");

                            // isError tracked logically (for future checks) but no permanent red border —
                            // the amber pulse on inject-fail is the only active error signal.
                            const isError = isRequired && isEmpty && !isIgnored && !rawDefault; // eslint-disable-line no-unused-vars

                            const getPlaceholder = () => {
                                if (isIgnored) return "Excluded from parsing...";
                                if (isFileVar) return "Value...";
                                if (rawDefault && !isDropdown) return `Default: ${rawDefault}`;
                                if (isRequired) return "Required...";
                                return "Value...";
                            };
                            // ---------------------------------------

                            return (
                                <div
                                    key={variable}
                                    ref={el => varRefs.current[variable] = el}
                                    className={`space-y-1.5 transition-all duration-300 rounded-xl p-1 -m-1 ${isIgnored ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex items-center justify-between w-full gap-2">
                                        <label className="flex-1 min-w-0 text-xs font-bold text-text-muted uppercase tracking-wide flex items-center gap-1.5 select-none">
                                            
                                            {/* DER KERN-FIX: flex-1 und min-w-0 zwingen den Text, sich pixelgenau dem Restplatz anzupassen und exakt dann abzuschneiden */}
                                            <span 
                                                className="truncate flex-1 min-w-0 cursor-pointer hover:text-primary transition-colors duration-150" 
                                                title={`Locate "${displayName}" in Editor`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    window.dispatchEvent(new CustomEvent('lp-locate-variable-in-editor', { detail: { name: variable } }));
                                                }}
                                            >
                                                {displayName}
                                            </span>
                                            
                                            {/* Alle Abzeichen bleiben ungestaucht dank shrink-0 */}
                                            {isRequired && <span className="text-red-500 shrink-0" title="Required">*</span>}
                                            {isFileVar && (
                                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-500 dark:bg-blue-400/10 dark:text-blue-400 text-[8px] rounded-full border border-blue-500/20 font-bold shrink-0">
                                                    FILE
                                                </span>
                                            )}
                                            {snippetVariables && snippetVariables.has(variable) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const sourceSnippet = snippets?.find(s => {
                                                            try {
                                                                return parseVariables(s.content || "").includes(variable);
                                                            } catch (err) { return false; }
                                                        });
                                                        if (sourceSnippet) {
                                                            window.dispatchEvent(new CustomEvent('lp-navigate-to-snippet', {
                                                                detail: { name: sourceSnippet.name }
                                                            }));
                                                        } else if (onNotification) {
                                                            onNotification("Source snippet not found.", "warning");
                                                        }
                                                    }}
                                                    title="Click to view or edit the source Snippet"
                                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] rounded-full border border-amber-500/20 font-bold shrink-0 hover:bg-amber-500/20 hover:border-amber-500/40 transition-colors cursor-pointer"
                                                >
                                                    SNIPPET
                                                </button>
                                            )}
                                        </label>
                                        
                                        <button
                                            onClick={() => onToggleIgnore(variable)}
                                            className={`shrink-0 p-1 rounded-md transition-all ${isIgnored ? 'text-primary bg-primary/10' : 'text-text-faint hover:text-red-400'}`}
                                            title={isIgnored ? "Enable variable" : "Ignore variable"}
                                        >
                                            {isIgnored ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </div>

                                    {isFileVar ? (
                                        <div className="space-y-2">
                                            {/* 1. Existing Files List */}
                                            {fileVal && Array.isArray(fileVal) && fileVal.length > 0 && (
                                                <div className="space-y-2 mb-2">
                                                    {fileVal.map((f, i) => (
                                                        <div key={i} className={`flex items-center justify-between p-1.5 bg-bg-elevated rounded border border-border text-xs text-text-main ${f.isGhost ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
                                                            <div className="flex items-center gap-2 truncate" title={f.name}>
                                                                <div className={f.isGhost || (!f.data && !(f instanceof Blob)) ? 'text-amber-500' : 'text-primary'}>
                                                                    {getFileIcon(f, 12)}
                                                                </div>
                                                                <span className={`truncate ${f.isGhost || (!f.data && !(f instanceof Blob)) ? 'text-amber-500 font-medium' : ''}`}>
                                                                    {f.name}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {(f.isGhost || (!f.data && !(f instanceof Blob))) ? (
                                                                    <button 
                                                                        onClick={() => {
                                                                            const input = document.createElement('input');
                                                                            input.type = 'file';
                                                                            input.onchange = async (e) => {
                                                                                const newFile = e.target.files[0];
                                                                                if (newFile) {
                                                                                    const reader = new FileReader();
                                                                                    reader.onload = () => {
                                                                                        const next = [...fileVal];
                                                                                        next[i] = {
                                                                                            name: newFile.name, type: newFile.type, size: newFile.size,
                                                                                            data: reader.result, lastModified: newFile.lastModified
                                                                                        };
                                                                                        onChange(variable, next);
                                                                                    };
                                                                                    reader.readAsDataURL(newFile);
                                                                                }
                                                                            };
                                                                            input.click();
                                                                        }}
                                                                        className="text-[9px] text-amber-500 font-bold uppercase tracking-wider hover:bg-amber-500/10 px-1 py-0.5 rounded transition-colors cursor-pointer" title="Fix missing file">
                                                                        Fix
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-[10px] text-text-faint">{formatFileSize(f.size)}</span>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        const next = fileVal.filter((_, idx) => idx !== i);
                                                                        onChange(variable, next);
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

                                            {/* 2. Upload / Drop Area */}
                                            <div
                                                tabIndex="0"
                                                data-lp-focus-target="true"
                                                title={`Add files for "${displayName}"`}
                                                className={`outline-none group/dropzone border-2 border-dashed rounded-xl px-4 relative flex items-center justify-center min-h-[56px] cursor-pointer overflow-hidden transition-all duration-200 ${draggingVars[variable]
                                                        ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02] shadow-lg shadow-indigo-500/5'
                                                        : 'border-zinc-300 dark:border-white/25 hover:border-indigo-500/50 dark:hover:border-white/40 hover:bg-indigo-50/50 dark:hover:bg-white/5'
                                                    } ${isHighlighted ? themeClass : ''}`}
                                                onDragOver={e => e.preventDefault()}
                                                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDraggingVars(prev => ({ ...prev, [variable]: true })); }}
                                                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget.contains(e.relatedTarget)) return; setDraggingVars(prev => ({ ...prev, [variable]: false })); }}
                                                onMouseEnter={() => window.lp_hovered_dropzone = `var:${variable}`}
                                                onMouseLeave={() => window.lp_hovered_dropzone = null}
                                                onDrop={async (e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setDraggingVars(prev => ({ ...prev, [variable]: false }));
                                                    const droppedFiles = Array.from(e.dataTransfer.files);
                                                    const existingFiles = Array.isArray(fileVal) ? fileVal : [];
                                                    
                                                    let duplicateCount = 0;
                                                    const newFiles = droppedFiles.filter(f => {
                                                        const isDup = existingFiles.some(ex => ex.name === f.name && ex.size === f.size);
                                                        if (isDup) duplicateCount++;
                                                        return !isDup;
                                                    });

                                                    if (duplicateCount > 0 && onNotification) {
                                                        onNotification(`${duplicateCount} file(s) ignored (already attached).`, 'warning');
                                                    }

                                                    const accepted = filterOversizedFiles(newFiles, (f) => {
                                                        if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                                    });
                                                    
                                                    if (accepted.length > 0) {
                                                        const processed = [];
                                                        for (const f of accepted) {
                                                            const fileData = await new Promise((resolve) => {
                                                                const reader = new FileReader();
                                                                reader.onload = () => resolve({
                                                                    name: f.name, type: f.type, size: f.size,
                                                                    data: reader.result, lastModified: f.lastModified
                                                                });
                                                                reader.readAsDataURL(f);
                                                            });
                                                            processed.push(fileData);
                                                        }
                                                        onChange(variable, [...existingFiles, ...processed]);
                                                    }
                                                }}
                                                onClick={() => {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.multiple = true;
                                                    input.onchange = async (e) => {
                                                        const selected = Array.from(e.target.files);
                                                        const existingFiles = Array.isArray(fileVal) ? fileVal : [];
                                                        
                                                        let duplicateCount = 0;
                                                        const newFiles = selected.filter(f => {
                                                            const isDup = existingFiles.some(ex => ex.name === f.name && ex.size === f.size);
                                                            if (isDup) duplicateCount++;
                                                            return !isDup;
                                                        });

                                                        if (duplicateCount > 0 && onNotification) {
                                                            onNotification(`${duplicateCount} file(s) ignored (already attached).`, 'warning');
                                                        }

                                                        const processed = [];
                                                        for (const f of newFiles) {
                                                            const fileData = await new Promise((resolve) => {
                                                                const reader = new FileReader();
                                                                reader.onload = () => resolve({
                                                                    name: f.name, type: f.type, size: f.size,
                                                                    data: reader.result, lastModified: f.lastModified
                                                                });
                                                                reader.readAsDataURL(f);
                                                            });
                                                            processed.push(fileData);
                                                        }
                                                        onChange(variable, [...existingFiles, ...processed]);
                                                    };
                                                    input.click();
                                                }}
                                            >
                                                {/* Haupttext: Immer exakt mittig, gleitet bei Hover nach oben */}
                                                <span className={`text-[10px] uppercase tracking-wider font-bold truncate w-full pointer-events-none transition-all duration-300 text-center ${
                                                    draggingVars[variable] 
                                                        ? 'text-indigo-500 scale-105' 
                                                        : 'text-text-muted group-hover/dropzone:-translate-y-2'
                                                }`}>
                                                    {draggingVars[variable] ? "Drop files now!" : `+ Add files for "${displayName}"`}
                                                </span>

                                                {/* Subtext: Absolut unten positioniert, fadet sanft ein */}
                                                {!draggingVars[variable] && (
                                                    <span className="absolute bottom-2 left-0 right-0 text-[9px] font-medium text-text-faint/60 opacity-0 group-hover/dropzone:opacity-100 transition-opacity duration-300 pointer-events-none text-center">
                                                        Click, drop, or hover & Ctrl+V
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : isDropdown ? (
                                        <div className="relative">
                                            {/* Der Trigger-Button, der genau wie die Textarea aussieht */}
                                            <button
                                                data-lp-focus-target="true"
                                                disabled={isIgnored}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!isIgnored) {
                                                        const buttonRect = e.currentTarget.getBoundingClientRect();
                                                        const container = scrollContainerRef.current;
                                                        
                                                        let spaceBelow, spaceAbove;
                                                        
                                                        if (container) {
                                                            // Messung relativ zur sichtbaren Grenze des Scroll-Containers
                                                            const containerRect = container.getBoundingClientRect();
                                                            spaceBelow = containerRect.bottom - buttonRect.bottom - 8;
                                                            spaceAbove = buttonRect.top - containerRect.top - 8;
                                                        } else {
                                                            // Failsafe-Fallback relativ zum Viewport
                                                            spaceBelow = window.innerHeight - buttonRect.bottom - 12;
                                                            spaceAbove = buttonRect.top - 12;
                                                        }
                                                        
                                                        // Richtung wählen: Umklappen, wenn oben mehr Platz ist als unten AND der Platz unten knapp wird (< 180px)
                                                        const shouldFlip = spaceAbove > spaceBelow && spaceBelow < 180;
                                                        setIsFlipped(shouldFlip);
                                                        
                                                        // Maximale Höhe dynamisch begrenzen, damit es niemals clippt
                                                        const availableSpace = shouldFlip ? spaceAbove : spaceBelow;
                                                        setMaxDropdownHeight(Math.max(100, Math.min(192, availableSpace)));
                                                        
                                                        setOpenDropdown(openDropdown === variable ? null : variable);
                                                    }
                                                }}
                                                title={values[variable] || defaultVal}
                                                className={`w-full bg-bg-elevated border rounded-lg pl-3 pr-8 py-2.5 text-xs text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm font-sans flex items-center justify-between group/dropdown hover:border-primary/50 text-left ${
                                                    isHighlighted ? themeClass : 'border-border'
                                                } ${isIgnored ? 'bg-bg cursor-not-allowed border-dashed opacity-50' : ''}`}
                                            >
                                                <span className="truncate">{values[variable] || defaultVal}</span>
                                                <ChevronDown size={14} className={`text-text-muted group-hover/dropdown:text-primary transition-all duration-200 absolute right-3 top-1/2 -translate-y-1/2 ${openDropdown === variable ? 'rotate-180 text-primary' : ''}`} />
                                            </button>

                                            {/* Das eigentliche Menü (Custom UI) */}
                                            {openDropdown === variable && (
                                                <div className={`absolute left-0 right-0 bg-bg-surface border border-border rounded-xl shadow-2xl z-[70] p-1.5 animate-in fade-in duration-150 dm-dropdown ${
                                                    isFlipped 
                                                        ? 'bottom-full mb-1.5 slide-in-from-bottom-2' 
                                                        : 'top-full mt-1.5 slide-in-from-top-2'
                                                }`}>
                                                    <div 
                                                        className="overflow-y-auto custom-scrollbar"
                                                        style={{ maxHeight: `${maxDropdownHeight}px` }}
                                                    >
                                                        {dropdownOptions.map((opt, i) => {
                                                            const isSelected = (values[variable] || defaultVal) === opt;
                                                            return (
                                                                <button
                                                                    key={i}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onChange(variable, opt);
                                                                        setOpenDropdown(null);
                                                                    }}
                                                                    title={opt}
                                                                    /* FIX: items-start statt items-center, damit der Haken bei Mehrzeilern oben bleibt */
                                                                    className={`w-full flex items-start justify-between px-3 py-2 rounded-lg text-xs transition-all text-left ${
                                                                        isSelected
                                                                            ? 'bg-primary/10 text-primary font-semibold'
                                                                            : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                                    }`}
                                                                >
                                                                    {/* FIX: line-clamp-3 statt truncate erlaubt bis zu 3 Zeilen Textumbruch, leading-relaxed für bessere Lesbarkeit */}
                                                                    <span className="line-clamp-3 leading-relaxed pr-2">{opt}</span>
                                                                    
                                                                    {/* FIX: mt-0.5 gleicht den Haken auf die erste Textzeile ab */}
                                                                    {isSelected && <Check size={12} className="ml-auto shrink-0 mt-0.5" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <textarea
                                            disabled={isIgnored}
                                            placeholder={getPlaceholder()}
                                            value={isIgnored ? "" : (userVal || '')}
                                            onChange={(e) => {
                                                onChange(variable, e.target.value);
                                                adjustHeight(e.target); // Nutzt unseren neuen, perfekten Helper
                                            }}
                                            ref={(el) => {
                                                if (el) {
                                                    adjustHeight(el);
                                                    enableDragSelectScroll(el);
                                                }
                                            }} // Initialer Resize beim ersten Rendern und Drag-Scroll Aktivierung
                                            rows={1}
                                            /*
                                              ÄNDERUNG: 'overflow-hidden focus:overflow-y-auto' hinzugefügt, 
                                              um Scroll Trapping zu verhindern. Helper steuert weiterhin die Grundlogik.
                                            */
                                            className={`lp-auto-resize w-full bg-bg-elevated border rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors placeholder:text-text-faint resize-none custom-scrollbar min-h-[38px] max-h-[250px] overflow-hidden focus:overflow-y-auto font-sans leading-relaxed shadow-sm ${
                                                isHighlighted ? themeClass : 'border-border'
                                            } ${isIgnored ? 'bg-bg cursor-not-allowed border-dashed opacity-50' : ''}`}
                                        />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                            <UploadCloud size={12} /> Attachments <span className="text-[9px] opacity-50 font-normal">(Session only)</span>
                        </div>

                        <div
                            className={`group/globaldrop border-2 border-dashed rounded-xl px-4 relative flex items-center justify-center min-h-[56px] cursor-pointer overflow-hidden transition-all duration-200 ${isDragging
                                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02] shadow-lg shadow-indigo-500/5'
                                : 'border-zinc-300 dark:border-white/25 hover:border-indigo-500/50 dark:hover:border-white/40 hover:bg-indigo-50/50 dark:hover:bg-white/5'
                                }`}
                            onDragOver={e => e.preventDefault()}
                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                            onDragLeave={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (e.currentTarget.contains(e.relatedTarget)) return;
                                setIsDragging(false);
                            }}
                            onMouseEnter={() => window.lp_hovered_dropzone = 'global'}
                            onMouseLeave={() => window.lp_hovered_dropzone = null}
                            onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                setIsDragging(false);
                                const droppedFiles = Array.from(e.dataTransfer.files);
                                
                                let duplicateCount = 0;
                                const newFiles = droppedFiles.filter(f => {
                                    const isDup = files.some(ex => ex.name === f.name && ex.size === f.size);
                                    if (isDup) duplicateCount++;
                                    return !isDup;
                                });

                                if (duplicateCount > 0 && onNotification) {
                                    onNotification(`${duplicateCount} file(s) ignored (already attached).`, 'warning');
                                }

                                const accepted = filterOversizedFiles(newFiles, (f) => {
                                    if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                });
                                if (accepted.length > 0 && onFilesChange) {
                                    onFilesChange([...files, ...accepted]);
                                }
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                ref={fileInputRef}
                                onChange={(e) => {
                                    const selected = Array.from(e.target.files);
                                    let duplicateCount = 0;
                                    const newFiles = selected.filter(f => {
                                        const isDup = files.some(ex => ex.name === f.name && ex.size === f.size);
                                        if (isDup) duplicateCount++;
                                        return !isDup;
                                    });

                                    if (duplicateCount > 0 && onNotification) {
                                        onNotification(`${duplicateCount} file(s) ignored (already attached).`, 'warning');
                                    }

                                    const accepted = filterOversizedFiles(newFiles, (f) => {
                                        if (onNotification) onNotification(`"${f.name}" exceeds 25 MB limit`, 'warning');
                                    });
                                    if (accepted.length > 0 && onFilesChange) {
                                        onFilesChange([...files, ...accepted]);
                                    }
                                    e.target.value = ''; // Reset input
                                }}
                            />
                            {/* Haupttext: Immer exakt mittig, gleitet bei Hover nach oben */}
                            <span className={`text-xs font-bold transition-all duration-300 pointer-events-none text-center ${
                                isDragging 
                                    ? 'text-indigo-500 scale-105' 
                                    : 'text-text-muted group-hover/globaldrop:-translate-y-2'
                            }`}>
                                {isDragging ? "Drop files now!" : "Upload Attachments"}
                            </span>
                            
                            {/* Subtext: Absolut unten positioniert, fadet sanft ein */}
                            {!isDragging && (
                                <span className="absolute bottom-2 left-0 right-0 text-[9px] font-medium text-text-faint/60 opacity-0 group-hover/globaldrop:opacity-100 transition-opacity duration-300 pointer-events-none text-center">
                                    Click, drag & drop, or hover & Ctrl+V
                                </span>
                            )}
                        </div>

                        {files.length > 0 && (
                            <div className="space-y-1">
                                {files.map((file, i) => (
                                    <div key={i} className={`flex items-center justify-between p-2 rounded border text-xs ${file.isGhost || (!file.data && !(file instanceof Blob)) ? 'bg-amber-500/5 border-amber-500/30' : 'bg-bg-elevated border-border text-text-main'}`}>
                                        <div className="flex items-center gap-2 truncate" title={file.name}>
                                            {getFileIcon(file, 12, file.isGhost || (!file.data && !(file instanceof Blob)) ? 'text-amber-500' : 'text-primary')}
                                            <span className={`truncate ${file.isGhost || (!file.data && !(file instanceof Blob)) ? 'text-amber-500' : ''}`}>{file.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {(file.isGhost || (!file.data && !(file instanceof Blob))) ? (
                                                <button 
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.onchange = (e) => {
                                                            const newFile = e.target.files[0];
                                                            if (newFile) {
                                                                const next = [...files];
                                                                next[i] = newFile;
                                                                if (onFilesChange) onFilesChange(next);
                                                            }
                                                        };
                                                        input.click();
                                                    }}
                                                    className="text-[9px] text-amber-500 font-bold uppercase tracking-wider ml-auto shrink-0 hover:bg-amber-500/10 px-1.5 py-1 rounded transition-colors cursor-pointer" title="Click to find and re-attach this file">
                                                    Fix
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-text-faint ml-auto shrink-0">{formatFileSize(file.size)}</span>
                                            )}
                                            <button onClick={() => handleFileRemove(i)} className="text-text-muted hover:text-red-400 p-1"><X size={12} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pro Tip Info */}
                    <div className="mt-2 flex items-start gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                        <Lightbulb size={12} className="text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-text-muted leading-tight">
                            <strong className="text-text-main">Pro Tip:</strong> Need to mention a specific file in your prompt?
                            Type <code className="font-mono text-primary bg-primary/10 px-0.5 rounded">{'{{file: Document}}'}</code> in the editor.
                        </span>
                    </div>
                </div>
            </div>

            {/* LOCAL OVERWRITE CONFIRMATION MODAL */}
            <ConfirmationModal
                isOpen={showOverwriteConfirm}
                title="Overwrite Preset?"
                message={`A preset named "${pendingPresetName}" already exists. Do you want to overwrite it with your current values?`}
                confirmText="Yes, Overwrite"
                isDangerous={true}
                onConfirm={() => {
                    onSavePreset(pendingPresetName);
                    setLastLoadedPreset(pendingPresetName);
                    setPresetName('');
                    setIsSaving(false);
                    setShowOverwriteConfirm(false);
                    if (onNotification) onNotification(`Preset "${pendingPresetName}" updated successfully!`, "success");
                }}
                onClose={() => {
                    setShowOverwriteConfirm(false);
                }}
            />
        </div>
    );
}

const getVariableSchema = (variable, rawContent) => {
    if (!rawContent) return "";
    const isFileVar = variable.toLowerCase().startsWith('file:') || variable.toLowerCase().startsWith('!file:');
    if (isFileVar) return "";
    const isRequired = variable.startsWith('!');
    let displayName = variable;
    if (variable.toLowerCase().startsWith('!file:')) displayName = variable.substring(6).trim();
    else if (variable.toLowerCase().startsWith('file:')) displayName = variable.substring(5).trim();
    else if (isRequired) displayName = variable.substring(1).trim();

    try {
        const escapedVarName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{\\{\\s*${escapedVarName}\\s*:(.*?)\\}\\}`, 'i');
        const match = rawContent.match(regex);
        return match && match[1] ? match[1].trim() : "";
    } catch (e) {
        return "";
    }
};

const arePropsEqual = (prevProps, nextProps) => {
    // 0. Compare active preset name
    if (prevProps.activePresetName !== nextProps.activePresetName) return false;

    // 1. Array comparison for variable names
    if (prevProps.variables?.length !== nextProps.variables?.length) return false;
    if (prevProps.variables?.some((v, i) => v !== nextProps.variables[i])) return false;

    // 2. Value inputs comparison
    const prevKeys = Object.keys(prevProps.values || {});
    const nextKeys = Object.keys(nextProps.values || {});
    if (prevKeys.length !== nextKeys.length) return false;
    if (prevKeys.some(k => prevProps.values[k] !== nextProps.values[k])) return false;

    // 3. Files metadata comparison
    if (prevProps.files?.length !== nextProps.files?.length) return false;
    if (prevProps.files?.some((f, i) => f.name !== nextProps.files[i].name || f.size !== nextProps.files[i].size)) return false;

    // 4. Ignored variables comparison
    if (prevProps.ignoredVariables?.length !== nextProps.ignoredVariables?.length) return false;
    if (prevProps.ignoredVariables?.some((v, i) => v !== nextProps.ignoredVariables[i])) return false;

    // 5. Presets comparison (Zero-Regression safeguard)
    const prevPresetsKeys = Object.keys(prevProps.presets || {});
    const nextPresetsKeys = Object.keys(nextProps.presets || {});
    if (prevPresetsKeys.length !== nextPresetsKeys.length) return false;
    if (JSON.stringify(prevProps.presets) !== JSON.stringify(nextProps.presets)) return false;

    // 6. Snippet variables comparison (Zero-Regression safeguard)
    if (prevProps.snippetVariables?.size !== nextProps.snippetVariables?.size) return false;
    if (prevProps.snippetVariables && nextProps.snippetVariables) {
        for (let v of prevProps.snippetVariables) {
            if (!nextProps.snippetVariables.has(v)) return false;
        }
    }

    // 7. Snippets list comparison (Zero-Regression safeguard)
    if (prevProps.snippets?.length !== nextProps.snippets?.length) return false;
    if (prevProps.snippets && nextProps.snippets) {
        if (prevProps.snippets.some((s, i) => s.name !== nextProps.snippets[i].name || s.content !== nextProps.snippets[i].content)) return false;
    }

    // 8. Variable schemas / defaults check from rawContent (Intelligent typing block)
    if (prevProps.variables && prevProps.variables.length > 0) {
        if (prevProps.variables.some(v => getVariableSchema(v, prevProps.rawContent) !== getVariableSchema(v, nextProps.rawContent))) {
            return false;
        }
    }

    return true;
};

export default React.memo(VariableInspector, arePropsEqual);
