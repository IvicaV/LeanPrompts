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
import React, { useState, useEffect, useRef } from 'react';
import { getFaviconUrl } from '../../utils/faviconHelper';
import {
    Download,
    Upload,
    Trash2,
    CheckCircle,
    AlertTriangle,
    ShieldCheck,
    Plus,
    Globe,
    GripVertical,
    CheckSquare,
    Square,
    Settings as SettingsIcon,
    Palette,
    BellRing,
    Keyboard,
    Command,
    Save,
    Eye,
    AlertCircle,
    ExternalLink,
    Check,
    Sparkles,
    Info,
    LayoutGrid,
    Pencil,
    X,
    Package,
    Undo2,
    Search
} from 'lucide-react';
import { backupManager } from '../../utils/backup';
import { dbAPI } from '../../utils/db';
import usePromptStore from '../../stores/promptStore';
import useOnboardingStore from '../../stores/onboardingStore';
import ConfirmationModal from '../../components/ConfirmationModal';
import SmartMergeModal from '../../components/SmartMergeModal';
import UpdateConflictModal from '../../components/UpdateConflictModal';

export default function Settings({ onViewChange }) {
    // --- STORE & STATE ---
    const {
        loadPrompts,
        llms,
        updateLlms,
        resetLlms,
        settings,
        updateSettings,
        factoryReset,
        snippets, // Needed to check conflicts
        knowledgeTiles, // Needed to check conflicts
        prompts
    } = usePromptStore();

    const { startTour, resetTour } = useOnboardingStore();

    const [status, setStatus] = useState(null);
    const [msg, setMsg] = useState("");
    const [shadowBackupExists, setShadowBackupExists] = useState(false);

    const [isProcessingModal, setIsProcessingModal] = useState(false);
    const [isParsingFile, setIsParsingFile] = useState(false);
    
    // 🛡️ ZERO-REGRESSION HELPER: Smart Protocol Resolver
    const buildAndValidateUrl = (inputUrl) => {
        let finalUrl = inputUrl.trim();
        if (!/^https?:\/\//i.test(finalUrl)) {
            // Allow HTTP for local instances (Ollama, LM Studio), enforce HTTPS for web
            if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(finalUrl)) {
                finalUrl = `http://${finalUrl}`;
            } else {
                finalUrl = `https://${finalUrl}`;
            }
        }
        try {
            const urlObj = new URL(finalUrl);
            const forbiddenProtocols = ['javascript:', 'data:', 'chrome:', 'edge:', 'about:', 'file:'];
            if (forbiddenProtocols.includes(urlObj.protocol.toLowerCase())) return null;
            return finalUrl;
        } catch {
            return null;
        }
    };

    // MOUNT GUARD: Verhindert Memory Leaks, falls Komponente während asynchroner Tasks zerstört wird
    const isMounted = useRef(true);
    useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    // State for editing Quick Links
    const [editingLlmId, setEditingLlmId] = useState(null);
    const [editLlmName, setEditLlmName] = useState("");
    const [editLlmUrl, setEditLlmUrl] = useState("");

    // State for new LLM Link
    const [newLlmName, setNewLlmName] = useState("");
    const [newLlmUrl, setNewLlmUrl] = useState("");

    // State for Backup Options
    const [fullBackup, setFullBackup] = useState(true);

    // State for Drag & Drop
    const [draggedItem, setDraggedItem] = useState(null);

    // STATE FOR SMART IMPORT
    const [importContent, setImportContent] = useState(null);
    const [workflowImportData, setWorkflowImportData] = useState(null); // Workflow Bundle Data
    const [isSmartMergeModalOpen, setIsSmartMergeModalOpen] = useState(false);
    const [recentImports, setRecentImports] = useState([]);
    const [importOptions, setImportOptions] = useState([]);
    const [isSmartImport, setIsSmartImport] = useState(true);
    const [importResults, setImportResults] = useState(null); // NEW: Store results for report

    // NEW State for Workflow Conflict "Intelligent Update" Modal
    const [conflictModalData, setConflictModalData] = useState({
        isOpen: false,
        promptTitle: "",
        isExactContent: false,
        pendingContent: null
    });

    // State for Import Confirmation Modal
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: "",
        message: "",
        isDangerous: false,
        showCheckboxes: false
    });

    const getSafeHostname = (url) => {
        try { return new URL(url).hostname; }
        catch { return "unknown"; }
    };

    // --- HANDLERS: BACKUP ---

    const handleExport = async () => {
        const success = await backupManager.exportData(fullBackup);
        if (success) {
            updateSettings({ lastBackupTime: new Date().toISOString() });
            showMsg("success", "Export successful.");
        } else {
            showMsg("error", "Export failed.");
        }
    };

    const handleImportFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Blockiere Doppel-Klicks rigoros
        if (isParsingFile) {
            e.target.value = '';
            return;
        }

        e.target.value = '';

        const processFile = () => {
            setIsParsingFile(true); // Aktiviert sofort das Fullscreen-Overlay

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const fileString = ev.target.result; // Synchron lesen

                // YIELD THREAD
                setTimeout(() => {
                    if (!isMounted.current) return; // Guard
                    try {
                        const content = JSON.parse(fileString);

                        if (!content.data && content.prompts) content.data = content.prompts;

                        if (content.meta && content.meta.type === 'workflow_bundle') {
                            const existingMatch = prompts.find(p =>
                                p.id === content.prompt.id ||
                                p.title === content.prompt.title ||
                                p.title === `${content.prompt.title} (imported)`
                            );

                            setIsParsingFile(false);

                            if (existingMatch) {
                                const isExactContent = existingMatch.content === content.prompt.content;
                                setConflictModalData({
                                    isOpen: true,
                                    promptTitle: content.prompt.title,
                                    isExactContent,
                                    pendingContent: content,
                                    existingPromptId: existingMatch.id 
                                });
                                return;
                            }

                            setWorkflowImportData(content);
                            setIsSmartMergeModalOpen(true);
                            return;
                        }

                        setImportContent(content);
                        
                        const hasHistory = content.data?.some(p => (p.chain && p.chain.some(s => s.versions && s.versions.length > 0)) || (p.versions && p.versions.length > 0));
                        const hasNotes = content.data?.some(p => (p.chain && p.chain.some(s => s.notes && s.notes.trim() !== "")) || (p.notes && p.notes.trim() !== ""));
                        const hasSnippets = content.snippets && content.snippets.length > 0;
                        const hasCollections = content.collections && content.collections.length > 0;
                        const hasKnowledge = content.knowledgeBase && content.knowledgeBase.length > 0;
                        const hasSystem = content.system && content.system.llms;
                        const hasPrompts = content.data && content.data.length > 0;
                        const hasPresets = content.data?.some(p => p.presets && Object.keys(p.presets).length > 0);

                        const options = [
                            { id: 'prompts', label: 'Prompts (Base Content)', checked: hasPrompts, disabled: !hasPrompts },
                            { id: 'presets', label: 'Variable Presets', checked: hasPresets, disabled: !hasPresets },
                            { id: 'history', label: 'Version History', checked: hasHistory, disabled: !hasHistory },
                            { id: 'notes', label: 'Step Notes', checked: hasNotes, disabled: !hasNotes },
                            { id: 'snippets', label: 'Snippets', checked: hasSnippets, disabled: !hasSnippets },
                            { id: 'collections', label: 'Collections', checked: hasCollections, disabled: !hasCollections },
                            { id: 'knowledge', label: 'Knowledge Base', checked: hasKnowledge, disabled: !hasKnowledge },
                            { id: 'llms', label: 'Quick Launch Links', checked: hasSystem, disabled: !hasSystem }
                        ];

                        setImportOptions(options);
                        setIsParsingFile(false);

                        setModalConfig({
                            isOpen: true,
                            title: "Smart Import Selection",
                            message: `Found ${content.data?.length || 0} prompts. Select exactly what you want to restore. Legacy backups are fully supported.`,
                            showCheckboxes: true,
                            isDangerous: false,
                            type: 'import'
                        });

                    } catch (err) {
                        setIsParsingFile(false);
                        showMsg("error", "Invalid File Format");
                    }
                }, 50);
            };
            reader.readAsText(file);
        };

        const MAX_SAFE_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_SAFE_SIZE) {
            setModalConfig({
                isOpen: true,
                title: "Massive Backup Detected",
                message: `This backup file is exceptionally large (${(file.size / 1024 / 1024).toFixed(1)} MB).\n\nImporting it might temporarily freeze your browser while processing the data. Are you sure you want to proceed?`,
                isDangerous: true,
                type: 'large_file_warning',
                executeImport: processFile 
            });
            return;
        }

        processFile();
    };

    const toggleImportOption = (id) => {
        setImportOptions(prev => prev.map(opt =>
            opt.id === id ? { ...opt, checked: !opt.checked } : opt
        ));
    };

    const triggerImport = async () => {
        if (!importContent) return;

        setIsProcessingModal(true);
        const activeOptions = importOptions.reduce((acc, opt) => ({
            ...acc,
            [opt.id]: opt.checked && !opt.disabled
        }), {});

        setTimeout(async () => {
            if (!isMounted.current) return;
            try {
                const results = await backupManager.performSmartImport(importContent, activeOptions, isSmartImport);
                await loadPrompts();

                // --- Import gilt als frischer Backup-State (setzt den 14-Tage-Timer zurück) ---
                updateSettings({ lastBackupTime: new Date().toISOString() });

                setImportResults(results);
                setIsProcessingModal(false);
                setMsg("");

                setModalConfig({
                    isOpen: true,
                    title: isSmartImport ? "Smart Import Summary" : "Full Restore Complete",
                    message: isSmartImport
                        ? "Your library has been synchronized. Review the changes below to see what was updated or protected."
                        : "System has been 1:1 restored. Existing local data was replaced with backup content.",
                    type: 'report',
                    isDangerous: false
                });
            } catch (err) {
                setIsProcessingModal(false);
                setModalConfig({
                    isOpen: true,
                    title: "Import Error",
                    message: "An unexpected error occurred during the import process: " + err.message,
                    type: 'error',
                    isDangerous: true
                });
            }
            setImportContent(null);
        }, 50);
    };

    const handleConfirm = () => {
        if (modalConfig.type === 'import') {
            triggerImport();
        } else if (modalConfig.type === 'report' || modalConfig.type === 'error') {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setImportResults(null);
        }
        else if (modalConfig.type === 'undo_import') {
            executeUndoImport(modalConfig.data.importSessionId);
            setModalConfig(prev => ({ ...prev, isOpen: false }));
        }
        else if (modalConfig.type === 'reset_llms') {
            resetLlms();
            setModalConfig(prev => ({ ...prev, isOpen: false }));
        }
        else if (modalConfig.type === 'delete_all') {
            if (deleteConfirmText.trim().toUpperCase() === 'DELETE') {
                executeFactoryReset();
            }
        }
        // --- NEW: Handle Large File Warning Confirmation ---
        else if (modalConfig.type === 'large_file_warning') {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            if (modalConfig.executeImport) {
                modalConfig.executeImport();
            }
        }
    };

    const handleWorkflowMerge = async (finalData, conflicts) => {
        try {
            await backupManager.performWorkflowImport(finalData, conflicts, updateSettings);
            await loadPrompts();
            showMsg("success", "Workflow bundle imported successfully!");
        } catch (err) {
            console.error(err);
            showMsg("error", "Workflow import failed: " + err.message);
        }
        // Modal und Spinner erst schließen, wenn die DB-Arbeit fertig ist
        setIsSmartMergeModalOpen(false);
        setWorkflowImportData(null);
    };

    const handleConflictChoice = async (action) => {
        const { pendingContent, existingPromptId } = conflictModalData;
        
        // 1. Close the conflict modal immediately
        setConflictModalData({ ...conflictModalData, isOpen: false });

        if (!pendingContent) return;

        // 2. Construct the final data bundle. Embed update intent if applicable.
        let finalData = { ...pendingContent };
        if (action === 'update') {
            finalData.updateIntent = { existingPromptId };
        }

        // 3. DEFENSIVE: Compute conflicts on-the-fly.
        // This ensures backup.js correctly applies the "(imported)" suffix to duplicate 
        // snippets/knowledge tiles, or updates them intelligently.
        const computedConflicts = { snippets: [], knowledge: [] };
        
        if (finalData.snippets) {
            finalData.snippets.forEach(incoming => {
                const existing = snippets.find(s => s.name === incoming.name);
                if (existing) computedConflicts.snippets.push({ incoming, existing });
            });
        }
        
        if (finalData.knowledgeBase) {
            finalData.knowledgeBase.forEach(incoming => {
                const existing = knowledgeTiles.find(k => k.title === incoming.title);
                if (existing) computedConflicts.knowledge.push({ incoming, existing });
            });
        }

        // 4. DIRECT EXECUTION: Bypass SmartMergeModal and trigger the engine directly.
        setStatus('loading');
        try {
            await backupManager.performWorkflowImport(finalData, computedConflicts, updateSettings);
            await loadPrompts(); // Refresh Zustand store
            
            showMsg("success", `Workflow successfully ${action === 'update' ? 'updated' : 'duplicated'}!`);
        } catch (err) {
            console.error("Direct Workflow Import Failed:", err);
            showMsg("error", "Workflow import failed: " + err.message);
        }
    };

    const loadRecentImports = async () => {
        try {
            const imports = await backupManager.getRecentImports();
            setRecentImports(imports);
        } catch (err) {
            console.error("Failed to load recent imports:", err);
        }
    };

    useEffect(() => {
        loadRecentImports();
    }, [prompts, snippets, knowledgeTiles]);

    // Shadow Backup Recovery: Check for orphaned pre-import snapshots on mount
    useEffect(() => {
        const checkShadowBackup = async () => {
            try {
                const backup = await dbAPI.getShadowBackup('pre_import_snapshot');
                if (backup) setShadowBackupExists(true);
            } catch (e) { /* ignore - store may not exist yet */ }
        };
        checkShadowBackup();
    }, []);

    const handleUndoImport = async (importSessionId) => {
        setModalConfig({
            isOpen: true,
            title: "Undo Import",
            message: "Are you sure you want to undo this import? This will delete all new items and revert all affected Prompts/Presets to their previous state. This action cannot be reversed.",
            type: 'undo_import',
            data: { importSessionId }
        });
    };

    const executeUndoImport = async (importSessionId) => {
        setIsProcessingModal(true);
        usePromptStore.getState().setSyncing(true); // START MUTEX LOCK
        setTimeout(async () => {
            if (!isMounted.current) return;
            try {
                await backupManager.undoWorkflowImport(importSessionId);
                await loadPrompts();
                await loadRecentImports();
                showMsg("success", "Import successfully reversed.");
            } catch (err) {
                showMsg("error", "Undo failed: " + err.message);
            } finally {
                usePromptStore.getState().setSyncing(false); // RELEASE MUTEX
                setIsProcessingModal(false);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        }, 50);
    };

    const showMsg = (type, text) => {
        setStatus(type);
        setMsg(text);
        // INCREASED DURATION for readability
        const duration = type === 'success' ? 6000 : 10000;
        setTimeout(() => { setStatus(null); setMsg(""); }, duration);
    };

    // Shadow Backup Recovery: Restore the orphaned pre-import snapshot
    const handleRestoreShadowBackup = async () => {
        setStatus('loading');
        setMsg("Restoring safety snapshot...");
        try {
            const backup = await dbAPI.getShadowBackup('pre_import_snapshot');
            if (backup && backup.data) {
                await backupManager.performSmartImport(backup.data, {
                    prompts: true, history: true, notes: true, snippets: true,
                    collections: true, knowledge: true, llms: true
                }, false);
                await dbAPI.clearShadowBackup('pre_import_snapshot');
                setShadowBackupExists(false);
                await loadPrompts();
                showMsg("success", "Safety snapshot restored successfully!");
            }
        } catch (err) {
            showMsg("error", "Failed to restore safety snapshot: " + err.message);
        }
    };

    // --- HANDLERS: LLM LINKS ---

    const handleAddLlm = () => {
        if (!newLlmName || !newLlmUrl) return;

        const validatedUrl = buildAndValidateUrl(newLlmUrl);
        if (!validatedUrl) {
            showMsg("error", "Invalid URL format or unsafe protocol.");
            return;
        }

        const newItem = { id: crypto.randomUUID(), name: newLlmName, url: validatedUrl };
        updateLlms([...llms, newItem]);
        setNewLlmName(""); setNewLlmUrl("");
    };

    const handleDeleteLlm = (id) => {
        updateLlms(llms.filter(l => l.id !== id));
        if (editingLlmId === id) cancelEdit();
    };

    const handleEditLlm = (llm) => {
        setEditingLlmId(llm.id);
        setEditLlmName(llm.name);
        setEditLlmUrl(llm.url);
    };

    const handleSaveEdit = (id) => {
        if (!editLlmName || !editLlmUrl) return;

        const validatedUrl = buildAndValidateUrl(editLlmUrl);
        if (!validatedUrl) {
            showMsg("error", "Invalid URL format or unsafe protocol.");
            return;
        }

        const updatedLlms = llms.map(l => l.id === id ? { ...l, name: editLlmName, url: validatedUrl } : l);
        updateLlms(updatedLlms);
        cancelEdit();
    };

    const cancelEdit = () => {
        setEditingLlmId(null);
        setEditLlmName("");
        setEditLlmUrl("");
    };

    const handleResetDefaults = () => {
        setModalConfig({
            isOpen: true,
            title: "Reset Quick Launch?",
            message: "This will revert your AI links to the default list (ChatGPT, Claude, etc.).",
            isDangerous: true,
            type: 'reset_llms'
        });
    };

    // --- HANDLERS: FACTORY RESET (DELETE ALL) ---
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    const handleDeleteAll = () => {
        setDeleteConfirmText("");
        setModalConfig({
            isOpen: true,
            title: "Reset to Factory Defaults?",
            message: "This will erase ALL your personal data and restore the extension to its original state:\n\n• All Prompts, Snippets, Presets & Collections will be deleted\n• All Knowledge Base entries will be removed\n• All Settings & LLM links will be reset to defaults\n• The tutorial content will be restored\n• Onboarding tours will replay\n\nThis action cannot be undone.",
            isDangerous: true,
            type: 'delete_all'
        });
    };

    const executeFactoryReset = async () => {
        setIsProcessingModal(true);
        setTimeout(async () => {
            if (!isMounted.current) return;
            try {
                await factoryReset();
                showMsg('success', 'Extension has been reset to factory defaults. Welcome back!');
                if (onViewChange) onViewChange('library');
            } catch (err) {
                showMsg('error', 'Reset failed: ' + err.message);
            }
            setIsProcessingModal(false);
            setModalConfig(prev => ({ ...prev, isOpen: false }));
        }, 50);
    };

    // --- HANDLERS: DRAG & DROP ---

    const onDragStart = (e, index) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setDragImage(e.target, 0, 0);
    };

    const onDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

        const items = [...llms];
        const item = items[draggedItem];
        items.splice(draggedItem, 1);
        items.splice(index, 0, item);

        setDraggedItem(index);
        updateLlms(items);
    };

    const onDragEnd = () => {
        setDraggedItem(null);
    };


    // --- RENDER ---
    return (
        <div className="flex-1 bg-bg p-12 overflow-y-auto custom-scrollbar" >
            <div className="max-w-2xl mx-auto space-y-8 pb-20">

                {/* CRASH RECOVERY BANNER */}
                {shadowBackupExists && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-red-500 shrink-0" size={24} />
                            <div>
                                <h4 className="font-bold text-red-500 text-sm">Emergency Snapshot Detected</h4>
                                <p className="text-xs text-text-muted mt-0.5">A previous import failed. Your library was preserved right before the crash.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={handleRestoreShadowBackup}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-red-500/20"
                            >
                                Restore Snapshot
                            </button>
                            <button
                                onClick={async () => {
                                    await dbAPI.clearShadowBackup('pre_import_snapshot');
                                    setShadowBackupExists(false);
                                }}
                                className="px-3 py-2 bg-bg-surface border border-border text-text-muted hover:text-text-main rounded-lg text-xs font-medium transition-all"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* HEADER */}
                <div>
                    <h2 className="text-2xl font-bold text-text-main mb-2">Settings & Data</h2>
                    <p className="text-text-muted">Manage your local library and preferences.</p>
                </div>

                {/* --- CARD 1: INTERFACE & SAFETY --- */}
                <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-primary/10 rounded-lg text-primary">
                            <Palette size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-text-main">Preferences & Safety</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Customize your workflow and interaction safety.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div
                            className="flex items-center justify-between p-4 bg-bg-elevated rounded-xl border border-border cursor-pointer group hover:border-primary/30 transition-all"
                            onClick={() => updateSettings({ confirmDelete: !settings.confirmDelete })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg transition-colors ${settings.confirmDelete ? 'bg-primary text-white' : 'bg-bg text-text-muted'}`}>
                                    <BellRing size={20} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-text-main">Confirm before deleting</div>
                                    <p className="text-xs text-text-muted mt-0.5">Show a popup before removing prompts or steps.</p>
                                </div>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-all border shadow-inner ${settings.confirmDelete ? 'bg-primary border-primary' : 'toggle-track-off'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.confirmDelete ? 'translate-x-4' : 'translate-x-0'} shadow-sm`} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- CARD: GUIDED TUTORIALS --- */}
                <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-primary/10 rounded-lg text-primary">
                            <Info size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-text-main">Tutorials & Help</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Need a refresher? Restart the guided tours for the Studio Dashboard or the Quick Popup.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => {
                                if (onViewChange) onViewChange('library');
                                resetTour('dashboard');
                            }}
                            className="flex items-center justify-center gap-2 p-3 bg-bg-elevated border border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        >
                            <LayoutGrid size={18} className="text-text-muted group-hover:text-primary transition-colors" />
                            <span className="text-sm font-bold text-text-main">Restart Dashboard Tour</span>
                        </button>
                        <button
                            onClick={() => resetTour('popup')}
                            className="flex items-center justify-center gap-2 p-3 bg-bg-elevated border border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        >
                            <Sparkles size={18} className="text-text-muted group-hover:text-primary transition-colors" />
                            <span className="text-sm font-bold text-text-main">Restart Popup Tour</span>
                        </button>
                    </div>
                </div>

                {/* --- CARD 2: LLM MANAGEMENT --- */}
                <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-bg-elevated rounded-lg text-text-muted">
                            <Globe size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-text-main">LLM Quick Launch</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Customize the AI models available in the popup launcher. Drag to reorder.
                            </p>
                        </div>
                    </div>

                    {/* Scroll Area */}
                    <div className="space-y-2 mb-6 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                        {llms.map((llm, index) => (
                            <div
                                key={llm.id}
                                draggable={editingLlmId !== llm.id}
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={(e) => onDragOver(e, index)}
                                onDragEnd={onDragEnd}
                                className={`flex items-center justify-between p-3 bg-bg-elevated rounded-lg border group ${editingLlmId !== llm.id ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedItem === index
                                    ? 'opacity-50 border-dashed border-primary'
                                    : 'border-border hover:border-primary/50'
                                    }`}
                            >
                                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                    {draggedItem !== index && editingLlmId !== llm.id && (
                                        <GripVertical size={16} className="text-text-muted cursor-grab shrink-0" />
                                    )}

                                    {editingLlmId === llm.id ? (
                                        <div className="flex flex-col gap-2 flex-1 min-w-0 pr-2">
                                            <input
                                                className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-main focus:border-primary focus:outline-none"
                                                value={editLlmName}
                                                onChange={e => setEditLlmName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveEdit(llm.id);
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                autoFocus
                                                placeholder="Model Name"
                                            />
                                            <input
                                                className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-main focus:border-primary focus:outline-none"
                                                value={editLlmUrl}
                                                onChange={e => setEditLlmUrl(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveEdit(llm.id);
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                placeholder="URL (e.g. chatgpt.com)"
                                            />
                                        </div>
                                    ) : (
                                        <a
                                            href={llm.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 w-fit min-w-0 group/link hover:opacity-80 transition-opacity relative z-10"
                                            title={`Open ${llm.name}`}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <img
                                                src={getFaviconUrl(llm.url, llm.name)}
                                                alt=""
                                                className="w-5 h-5 shrink-0 transition-all opacity-70 dark:invert-[0.8] dark:hue-rotate-180"
                                            />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-text-main truncate group-hover/link:text-primary transition-colors">{llm.name}</div>
                                                <div className="text-xs text-text-muted truncate">{llm.url}</div>
                                            </div>
                                        </a>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                    {editingLlmId === llm.id ? (
                                        <>
                                            <button
                                                onClick={() => handleSaveEdit(llm.id)}
                                                className="p-2 text-green-500 hover:bg-green-500/10 rounded transition-all"
                                                title="Save (Enter)"
                                            >
                                                <Check size={18} />
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="p-2 text-text-muted hover:bg-bg-surface rounded transition-all"
                                                title="Cancel (Esc)"
                                            >
                                                <X size={18} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleEditLlm(llm)}
                                                className="p-2 text-text-muted hover:text-primary hover:bg-bg-surface rounded opacity-0 group-hover:opacity-100 transition-all"
                                                title="Edit"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteLlm(llm.id)}
                                                className="p-2 text-text-muted hover:text-red-400 hover:bg-bg-surface rounded opacity-0 group-hover:opacity-100 transition-all"
                                                title="Remove"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add New Input */}
                    <div className="flex gap-2">
                        <input
                            placeholder="Name"
                            className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
                            value={newLlmName}
                            onChange={e => setNewLlmName(e.target.value)}
                        />
                        <input
                            placeholder="URL"
                            className="flex-[2] bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
                            value={newLlmUrl}
                            onChange={e => setNewLlmUrl(e.target.value)}
                        />
                        <button
                            onClick={handleAddLlm}
                            className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 rounded-lg flex items-center justify-center transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleResetDefaults}
                            className="text-xs text-text-muted hover:text-text-main underline"
                        >
                            Reset defaults
                        </button>
                    </div>
                </div>

                {/* --- CARD 3: KEYBOARD SHORTCUTS --- */}
                <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-primary-subtle rounded-lg text-primary">
                            <Keyboard size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-text-main">Keyboard Shortcuts</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Master your workflow with global and internal hotkeys.
                            </p>
                        </div>
                    </div>



                    <div className="space-y-6">

                        {/* SECTION: GLOBAL */}
                        <div>
                            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3 pl-1">Global (Browser Managed)</h4>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Sparkles size={16} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-text-main">
                                                Activate <span className="font-bold underline decoration-2 underline-offset-2">Q</span>uick Popup
                                            </span>
                                            <p className="text-[11px] text-text-muted">Opens the LeanPrompts window</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Alt</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Shift</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Q</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Plus size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-text-main">
                                            <span className="font-bold underline decoration-2 underline-offset-2">J</span>ump to New Prompt
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Alt</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Shift</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">J</kbd>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION: INTERNAL */}
                        <div>
                            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3 pl-1">App Internal</h4>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Globe size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-text-main">
                                            Open <span className="font-bold underline decoration-2 underline-offset-2">L</span>ibrary / Dashboard
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Alt</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Shift</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">L</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Command size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-text-main">
                                            <span className="font-bold underline decoration-2 underline-offset-2">K</span>eyboard Search / Command Palette
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Ctrl</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">K</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Search size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-text-main">
                                                Editor Search & Replace
                                            </div>
                                            <p className="text-[10px] text-text-muted mt-0.5">Find text inside the active prompt/snippet</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Ctrl</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">F</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Save size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-text-main">
                                                <span className="font-bold underline decoration-2 underline-offset-2">S</span>ave Global Snapshot
                                            </div>
                                            <p className="text-[10px] text-text-muted mt-0.5">(Dashboard only)</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Ctrl</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">S</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <Eye size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-text-main">
                                                Toggle <span className="font-bold underline decoration-2 underline-offset-2">P</span>review Mode
                                            </div>
                                            <p className="text-[10px] text-text-muted mt-0.5">(Dashboard only)</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Ctrl</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">P</kbd>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-bg rounded text-text-muted group-hover:text-primary transition-colors">
                                            <LayoutGrid size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-text-main">
                                                Toggle All Sidebars (<span className="font-bold underline decoration-2 underline-offset-2">Z</span>en-Mode)
                                            </div>
                                            <p className="text-[10px] text-text-muted mt-0.5">Maximize workspace instantly (Dashboard only)</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Alt</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Shift</kbd>
                                        <span className="text-text-muted">+</span>
                                        <kbd className="px-2 py-1 bg-bg border border-border rounded shadow-sm text-[10px] font-bold text-text-main min-w-[32px] text-center">Z</kbd>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CONTEXT NOTE (MOVED TO BOTTOM) */}
                    <div className="mt-6 p-4 bg-bg-elevated border border-border rounded-lg flex items-start gap-3">
                        <div className="text-text-muted mt-0.5"><AlertCircle size={16} /></div>
                        <div className="flex-1">
                            <p className="text-[13px] text-text-main font-medium leading-relaxed">
                                Browser Shortcut Conflicts
                            </p>
                            <p className="text-[12px] text-text-muted leading-relaxed mt-1">
                                Some hotkeys may be reserved by Chrome or your OS. Global shortcuts (like Alt+Shift+Q) are managed by the browser.
                            </p>
                            <button
                                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
                                className="mt-3 text-[12px] font-bold text-primary hover:underline flex items-center gap-1 transition-colors"
                            >
                                Configure Global Shortcuts <ExternalLink size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- CARD 4: DATA BACKUP --- */}
                <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-bg-elevated rounded-lg text-text-muted">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-lg font-semibold text-text-main">Data Backup</h3>
                                {settings.lastBackupTime && (
                                    <span className="text-[11px] text-text-muted italic opacity-60">
                                        (Last Backup: {new Date(settings.lastBackupTime).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })})
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-text-muted mt-1">
                                Your data is stored locally (IndexedDB). Snapshots, Presets and Notes are included in backups.
                            </p>
                        </div>
                    </div>

                    <div className="mb-4">
                        <div
                            className="flex items-center gap-2 cursor-pointer group select-none"
                            onClick={() => setFullBackup(!fullBackup)}
                        >
                            <div className={`transition-colors ${fullBackup ? 'text-primary' : 'text-text-muted group-hover:text-text-main'}`}>
                                {fullBackup ? <CheckSquare size={18} /> : <Square size={18} />}
                            </div>
                            <span className={`text-sm font-medium transition-colors ${fullBackup ? 'text-text-main' : 'text-text-muted group-hover:text-text-main'}`}>
                                Full System Backup (Includes Settings, Snippets, Presets & Notes)
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={handleExport}
                            className="flex flex-col items-center justify-center p-6 border border-border bg-bg-elevated hover:border-primary/50 hover:bg-bg-elevated/80 rounded-xl transition-all group"
                        >
                            <Download size={24} className="mb-3 text-text-muted group-hover:text-primary transition-colors" />
                            <span className="font-semibold text-text-main">Export Backup</span>
                            <span className="text-xs text-text-muted mt-1">{fullBackup ? 'Full System' : 'Prompts Only'} JSON</span>
                        </button>

                        <label className="flex flex-col items-center justify-center p-6 border border-border bg-bg-elevated hover:border-primary/50 hover:bg-bg-elevated/80 rounded-xl transition-all group cursor-pointer relative">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImportFile}
                                id="importFileInput"
                                className="hidden"
                            />
                            <Upload size={24} className="mb-3 text-text-muted group-hover:text-primary transition-colors" />
                            <span className="font-semibold text-text-main">Import Backup</span>
                            <span className="text-xs text-text-muted mt-1">Drag & Drop JSON</span>
                        </label>
                    </div>

                    {status && (
                        <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium animate-fade-in ${status === 'success' ? 'bg-green-500/10 text-green-500' :
                            status === 'loading' ? 'bg-primary/10 text-primary' :
                                'bg-red-500/10 text-red-500'
                            }`}>
                            {status === 'success' ? <CheckCircle size={16} /> : status === 'loading' ? <Sparkles size={16} className="animate-pulse" /> : <AlertTriangle size={16} />}
                            {status === 'loading' ? "Synchronizing with Database..." : msg}
                        </div>
                    )}
                </div>

                {/* --- CARD 4.5: IMPORT HISTORY LOG --- */}
                {recentImports.length > 0 && (
                    <div className="bg-bg-surface border border-border rounded-xl p-6 shadow-sm overflow-hidden animate-fade-in">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 bg-bg-elevated rounded-lg text-text-muted">
                                <Undo2 size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-text-main">Imported Workflows</h3>
                                <p className="text-sm text-text-muted mt-1 leading-relaxed">
                                    Review imported Workflows. You can easily rollback accidental imports to instantly remove all items added during that session. <br />
                                    <span className="text-xs opacity-70 italic">Note: This only applies to Workflow Bundles, not full system backups.</span>
                                </p>
                            </div>
                        </div>

                        <div className="bg-bg border border-border shadow-sm rounded-lg overflow-hidden divide-y divide-border/50">
                            {recentImports.map(session => (
                                <div key={session.id} className="p-4 flex items-center justify-between hover:bg-bg-elevated/50 transition-colors group/item">
                                    <div>
                                        <h4 className="font-bold text-sm text-text-main flex items-center gap-2">
                                            <Package size={14} className="text-indigo-400 opacity-80" />
                                            {session.bundleName}
                                        </h4>
                                        <p className="text-xs text-text-muted mt-1 font-mono">
                                            {new Date(session.importedAt).toLocaleString(undefined, {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleUndoImport(session.id)}
                                        className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted bg-bg-surface border border-border hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 active:scale-95 rounded-lg transition-all"
                                        title="Revert this import"
                                    >
                                        <Undo2 size={14} className="transition-transform group-hover/item:-rotate-45" /> Rollback
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- VISUAL DIVIDER --- */}
                <div className="py-6 flex items-center gap-6 opacity-50">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Critical Zone</span>
                    <div className="h-px bg-border flex-1" />
                </div>

                {/* --- CARD 5: DANGER ZONE (FACTORY RESET) --- */}
                <div className="bg-bg-surface border border-red-500/20 rounded-xl p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-red-500/10 rounded-lg text-red-500">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Irreversible actions. Please export a backup before proceeding.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleDeleteAll}
                        className="w-full flex items-center justify-center gap-3 p-4 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 rounded-xl transition-all group"
                    >
                        <Trash2 size={20} className="text-red-400 group-hover:text-red-300 transition-colors" />
                        <span className="font-semibold text-red-400 group-hover:text-red-300 transition-colors">Reset to Factory Defaults</span>
                    </button>
                </div>

            </div>

            <SmartMergeModal
                isOpen={isSmartMergeModalOpen}
                onClose={() => { setIsSmartMergeModalOpen(false); setWorkflowImportData(null); }}
                uploadData={workflowImportData}
                onConfirm={handleWorkflowMerge}
                existingSnippets={snippets}
                existingKnowledge={knowledgeTiles}
            />

            <UpdateConflictModal
                isOpen={conflictModalData.isOpen}
                onClose={() => setConflictModalData({ ...conflictModalData, isOpen: false })}
                onSelectAction={handleConflictChoice}
                existingPromptTitle={conflictModalData.promptTitle}
                isExactContent={conflictModalData.isExactContent}
            />

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                isLoading={isProcessingModal}
                title={modalConfig.title}
                message={modalConfig.message}
                showCheckboxes={modalConfig.showCheckboxes}
                checkboxOptions={importOptions}
                onCheckboxChange={toggleImportOption}
                onConfirm={handleConfirm}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                confirmText={modalConfig.type === 'report' ? "Got it" : (modalConfig.type === 'error' ? "Got it" : (modalConfig.type === 'delete_all' ? "Permanently Delete Everything" : (modalConfig.type === 'undo_import' ? "Confirm Undo" : (isSmartImport ? "Start Smart Import" : "Start Full Restore"))))}
                hideCancel={modalConfig.type === 'report' || modalConfig.type === 'error'}
            >
                {/* CASE: Detailed Report Modal */}
                {modalConfig.type === 'report' && importResults && (
                    <div className="mt-4 overflow-hidden border border-border rounded-xl bg-bg-surface/30">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-bg-elevated/50 text-text-faint uppercase tracking-tighter font-bold">
                                <tr>
                                    <th className="px-4 py-2">Category</th>
                                    <th className="px-2 py-2 text-center">New</th>
                                    <th className="px-2 py-2 text-center">Updated</th>
                                    <th className="px-2 py-2 text-center">Skipped</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {[
                                    { label: 'Prompts', key: 'prompts' },
                                    { label: 'Snippets', key: 'snippets' },
                                    { label: 'Collections', key: 'collections' },
                                    { label: 'Guides', key: 'knowledge' },
                                    { label: 'Links', key: 'system' }
                                ].map(row => {
                                    const data = importResults[row.key] || { added: 0, updated: 0, skipped: 0 };
                                    const hasActivity = data.added > 0 || data.updated > 0 || data.skipped > 0;

                                    if (!hasActivity) return null;

                                    return (
                                        <tr key={row.key} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 py-3 font-medium text-text-main">{row.label}</td>
                                            <td className={`px-2 py-3 text-center ${data.added > 0 ? 'text-green-500 font-bold' : 'text-text-faint'}`}>{data.added}</td>
                                            <td className={`px-2 py-3 text-center ${data.updated > 0 ? 'text-primary font-bold' : 'text-text-faint'}`}>{data.updated}</td>
                                            <td className={`px-2 py-3 text-center ${data.skipped > 0 ? 'text-amber-500 font-bold' : 'text-text-faint'}`}>{data.skipped}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="p-3 bg-primary/5 flex items-center gap-2 border-t border-border/30">
                            <ShieldCheck size={14} className="text-primary" />
                            <span className="text-[10px] text-text-muted">
                                {isSmartImport
                                    ? "Smart Protection was active: No newer local data was overwritten."
                                    : "Full Restore was active: Selection was strictly reset to backup state."}
                            </span>
                        </div>
                    </div>
                )}

                {/* CASE: Import Selection (Toggle Mode) */}
                {modalConfig.type === 'import' && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                        <div
                            onClick={() => setIsSmartImport(!isSmartImport)}
                            className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSmartImport
                                ? 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                                : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                                }`}
                        >
                            <div className={`mt-0.5 shrink-0 transition-colors ${isSmartImport ? 'text-primary' : 'text-amber-500'}`}>
                                {isSmartImport ? <Sparkles size={18} /> : <AlertTriangle size={18} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1 gap-2">
                                    <span className="text-sm font-bold text-text-main truncate">
                                        {isSmartImport ? 'Smart Merge (Safe)' : 'Full Restore (Destructive)'}
                                    </span>
                                    <div className={`shrink-0 transition-colors ${isSmartImport ? 'text-primary' : 'text-amber-500'}`}>
                                        {isSmartImport ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </div>
                                </div>
                                <p className="text-[11px] text-text-muted leading-relaxed">
                                    {isSmartImport
                                        ? 'Only merges newer or missing content. Protects your more recent local work from being overwritten by older backups.'
                                        : 'A 1:1 restore that replaces everything in the selected categories. Existing local data in these areas will be deleted.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* CASE: Delete All Confirmation (Type to confirm) */}
                {modalConfig.type === 'delete_all' && (
                    <div className="mt-4 pt-4 border-t border-red-500/20">
                        <label className="block text-xs font-bold text-text-muted mb-2">
                            Type <span className="text-red-400 font-mono">DELETE</span> to confirm:
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type DELETE here..."
                            className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none transition-all ${deleteConfirmText.trim().toUpperCase() === 'DELETE'
                                ? 'border-red-500 focus:ring-1 focus:ring-red-500'
                                : 'border-border focus:border-text-muted'
                                }`}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && deleteConfirmText.trim().toUpperCase() === 'DELETE') {
                                    handleConfirm();
                                }
                            }}
                        />
                        {deleteConfirmText.length > 0 && deleteConfirmText.trim().toUpperCase() !== 'DELETE' && (
                            <p className="text-[10px] text-red-400 mt-1.5 ml-1">Type exactly "DELETE" to enable the button.</p>
                        )}
                    </div>
                )}
            </ConfirmationModal>

            {isParsingFile && (
                <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pointer-events-auto">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                    <h3 className="text-lg font-bold text-white">Analyzing Backup File...</h3>
                    <p className="text-sm text-white/70 mt-2 text-center max-w-sm">Please wait while the system checks file integrity. Large files may take a few seconds.</p>
                </div>
            )}
        </div >
    );
}