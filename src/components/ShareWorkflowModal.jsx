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
import React, { useState, useEffect, useMemo } from 'react';
import { X, Package, CheckSquare, Square, FileJson, Layers, BookOpen, Share2 } from 'lucide-react';
import download from 'downloadjs';
import { scanWorkflowDependencies } from '../utils/workflowScan';
import useBodyLock from '../hooks/useBodyLock';
import usePromptStore from '../stores/promptStore';

export default function ShareWorkflowModal({ isOpen, onClose, prompt, snippets, knowledgeTiles }) {
    useBodyLock();
    const [includeHistory, setIncludeHistory] = useState(false);
    const [includeNotes, setIncludeNotes] = useState(true);
    const [includePresets, setIncludePresets] = useState(false);
    const [selectedDependencies, setSelectedDependencies] = useState(new Set());
    const [isExporting, setIsExporting] = useState(false);

    // Scan for dependencies whenever the modal opens or prompt changes
    const dependencies = useMemo(() => {
        if (!prompt || !isOpen) return { snippets: [], knowledgeBase: [] };
        return scanWorkflowDependencies(prompt, snippets || [], knowledgeTiles || []);
    }, [prompt, snippets, knowledgeTiles, isOpen]);

    // --- 100% BULLETPROOF SMART DETECTORS (READ-ONLY) ---
    const hasNotes = useMemo(() => {
        if (!prompt) return false;
        return prompt.chain?.some(step => step.notes && step.notes.trim() !== "") || false;
    }, [prompt]);

    const hasHistory = useMemo(() => {
        if (!prompt) return false;
        return prompt.chain?.some(step => step.versions && step.versions.length > 0) || (prompt.versions && prompt.versions.length > 0);
    }, [prompt]);

    const hasPresets = useMemo(() => {
        if (!prompt) return false;
        return prompt.presets && Object.keys(prompt.presets).length > 0;
    }, [prompt]);

    // STRICT ISOLATION: Setzt die initialen Werte NUR, wenn das Modal aufpoppt.
    // Keine Dependency auf die has*-Variablen, um User-Inputs bei geöffnetem Modal nicht zu überschreiben.
    useEffect(() => {
        if (isOpen) {
            setIncludeNotes(hasNotes);
            setIncludeHistory(false); // Aus Performance-Gründen (Dateigröße) immer default false
            setIncludePresets(false);
            
            // Die Dependency-Logic aus dem bestehenden Code
            const allIds = new Set();
            dependencies.snippets.forEach(s => allIds.add(s.id));
            dependencies.knowledgeBase.forEach(kb => allIds.add(kb.id));
            setSelectedDependencies(allIds);
        }
    }, [isOpen]); // <-- NUR isOpen. Absolut sicher.

    if (!isOpen || !prompt) return null;

    const toggleDependency = (id) => {
        const newSet = new Set(selectedDependencies);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedDependencies(newSet);
    };

    const handleExport = () => {
        setIsExporting(true);
        try {
            const promptToExport = JSON.parse(JSON.stringify(prompt));

            // Handle Step Notes and History
            if (promptToExport.chain) {
                promptToExport.chain = promptToExport.chain.map(step => {
                    const newStep = { ...step };
                    if (!includeHistory) newStep.versions = [];
                    if (!includeNotes) newStep.notes = "";
                    return newStep;
                });
            }
            if (!includeHistory) promptToExport.versions = [];

            // Handle Variable Presets and Heavy Base64 Files
            if (promptToExport.presets) {
                if (!includePresets) {
                    delete promptToExport.presets;
                } else {
                    Object.keys(promptToExport.presets).forEach(key => {
                        promptToExport.presets[key].files = (promptToExport.presets[key].files || []).map(f => ({
                            name: f.name,
                            type: f.type,
                            size: f.size,
                            isGhost: true
                        }));
                    });
                }
            }

            // Filter dependencies based on user selection
            const snippetsToExport = dependencies.snippets.filter(s => selectedDependencies.has(s.id)).map(s => {
                const newSnip = { ...s };
                if (!includeNotes) newSnip.notes = "";
                return newSnip;
            });
            const kbToExport = dependencies.knowledgeBase.filter(kb => selectedDependencies.has(kb.id));

            // Embed referenced collection to prevent orphaned reference crash in receiver side
            const embeddedCollections = [];
            try {
                const { collections } = usePromptStore.getState();
                if (promptToExport.collectionId && collections) {
                    const col = collections.find(c => c.id === promptToExport.collectionId);
                    if (col) {
                        embeddedCollections.push({
                            id: col.id,
                            name: col.name,
                            color: col.color || '#6366f1',
                            icon: col.icon || null,
                            createdAt: col.createdAt || new Date().toISOString()
                        });
                    }
                }
            } catch (e) {
                console.warn("[Backup] Failed to fetch collections from store during export:", e);
            }

            const exportData = {
                meta: {
                    version: 3, // Version 3 for Workflow Bundles
                    type: 'workflow_bundle',
                    exportedAt: new Date().toISOString(),
                    app: "LeanPrompts"
                },
                prompt: promptToExport,
                snippets: snippetsToExport,
                knowledgeBase: kbToExport,
                _embeddedCollections: embeddedCollections
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const safeTitle = prompt.title.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
            const fileName = `workflow-${safeTitle}.json`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            onClose();
        } catch (err) {
            console.error('Workflow export failed', err);
        } finally {
            setIsExporting(false);
        }
    };

    const totalDeps = dependencies.snippets.length + dependencies.knowledgeBase.length;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden max-w-lg w-full flex flex-col max-h-[90vh] dm-modal">

                {/* Header */}
                <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-bg-surface shrink-0">
                    <h3 className="font-bold text-text-main flex items-center gap-2">
                        <Package size={18} className="text-indigo-400" />
                        Export Workflow Bundle
                    </h3>
                    <button onClick={onClose} className="p-2 text-text-muted hover:text-text-main rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-bg space-y-6 custom-scrollbar">

                    {/* Section 1: The Prompt */}
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-text-faint uppercase tracking-wider">1. The Prompt</h4>
                        <div className="bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                <Share2 size={16} className="text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-text-main truncate">{prompt.title}</div>
                                <div className="text-xs text-text-muted">{prompt.chain?.length || 1} Step{(prompt.chain?.length || 1) !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">INCLUDED</div>
                        </div>
                    </div>

                    {/* Section 2: Dependencies */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-text-faint uppercase tracking-wider">2. Smart Dependencies</h4>
                            <span className="text-[10px] text-indigo-400 font-medium bg-indigo-400/10 px-2 py-0.5 rounded-full">{totalDeps} found</span>
                        </div>

                        {totalDeps === 0 ? (
                            <div className="text-sm text-text-muted italic bg-bg-surface border border-border border-dashed rounded-lg p-4 text-center">
                                No external snippets or knowledge tiles referenced.
                            </div>
                        ) : (
                            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                                {dependencies.snippets.map(s => (
                                    <div key={s.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleDependency(s.id)}>
                                        <div className={`transition-colors ${selectedDependencies.has(s.id) ? 'text-primary' : 'text-text-muted'}`}>
                                            {selectedDependencies.has(s.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                                            <Layers size={12} className="text-amber-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-mono font-bold text-text-main truncate">@{s.name}</div>
                                        </div>
                                    </div>
                                ))}
                                {dependencies.knowledgeBase.map(kb => (
                                    <div key={kb.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleDependency(kb.id)}>
                                        <div className={`transition-colors ${selectedDependencies.has(kb.id) ? 'text-primary' : 'text-text-muted'}`}>
                                            {selectedDependencies.has(kb.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center shrink-0">
                                            <BookOpen size={12} className="text-orange-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-text-main truncate">[[{kb.title}]]</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
                            These items will be seamlessly imported into the receiver's database. If they already possess an item with the same name, they can choose to merge or skip.
                        </p>
                    </div>

                    {/* Section 3: Content Options */}
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-text-faint uppercase tracking-wider">3. Content Options</h4>
                        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                            
                            <div 
                                className={`flex items-center gap-3 p-3 transition-colors ${hasNotes ? 'cursor-pointer hover:bg-bg-elevated' : 'opacity-50 cursor-not-allowed bg-bg/50'}`} 
                                onClick={() => hasNotes && setIncludeNotes(!includeNotes)}
                            >
                                <div className={`transition-colors ${!hasNotes ? 'text-text-faint' : includeNotes ? 'text-primary' : 'text-text-muted'}`}>
                                    {includeNotes && hasNotes ? <CheckSquare size={16} /> : <Square size={16} />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-main">Include Notes</span>
                                    <span className="text-xs text-text-muted">
                                        {hasNotes ? 'Export notes attached to the prompt steps and snippets.' : 'No notes available in this workflow.'}
                                    </span>
                                </div>
                            </div>

                            <div 
                                className={`flex items-center gap-3 p-3 transition-colors ${hasHistory ? 'cursor-pointer hover:bg-bg-elevated' : 'opacity-50 cursor-not-allowed bg-bg/50'}`} 
                                onClick={() => hasHistory && setIncludeHistory(!includeHistory)}
                            >
                                <div className={`transition-colors ${!hasHistory ? 'text-text-faint' : includeHistory ? 'text-primary' : 'text-text-muted'}`}>
                                    {includeHistory && hasHistory ? <CheckSquare size={16} /> : <Square size={16} />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-main">Include Version History</span>
                                    <span className="text-xs text-text-muted">
                                        {hasHistory ? 'Export all historical snapshots. This may increase file size.' : 'No historical snapshots exist for this workflow.'}
                                    </span>
                                </div>
                            </div>

                            <div 
                                className={`flex items-center gap-3 p-3 transition-colors ${hasPresets ? 'cursor-pointer hover:bg-bg-elevated' : 'opacity-50 cursor-not-allowed bg-bg/50'}`} 
                                onClick={() => hasPresets && setIncludePresets(!includePresets)}
                            >
                                <div className={`transition-colors ${!hasPresets ? 'text-text-faint' : includePresets ? 'text-primary' : 'text-text-muted'}`}>
                                    {includePresets && hasPresets ? <CheckSquare size={16} /> : <Square size={16} />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-main">Include Variable Presets</span>
                                    <span className="text-xs text-text-muted mt-0.5">
                                        {hasPresets 
                                            ? <span className="text-amber-500/80 font-medium">Warning: Presets may contain sensitive data. Attached files are exported as empty placeholders.</span>
                                            : 'No presets saved for this workflow.'}
                                    </span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div >

                {/* Footer */}
                < div className="p-4 border-t border-border bg-bg-surface flex items-center justify-end shrink-0" >
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isExporting ? 'Packaging...' : <><Package size={18} /> Export Bundle (.json)</>}
                    </button>
                </div >

            </div >
        </div >
    );
}
