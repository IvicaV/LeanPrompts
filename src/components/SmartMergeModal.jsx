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
import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckSquare, Square, Package, ArrowRight, Layers, BookOpen, FileText } from 'lucide-react';
import useBodyLock from '../hooks/useBodyLock';

export default function SmartMergeModal({ isOpen, onClose, uploadData, onConfirm, existingSnippets, existingKnowledge }) {
    useBodyLock();
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [conflicts, setConflicts] = useState({ snippets: [], knowledge: [] });
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        if (!isOpen || !uploadData) return;

        // Analyze what's in the bundle vs what exists locally
        const newConflicts = {
            snippets: [],
            knowledge: []
        };
        const defaultSelected = new Set();

        // Check Prompt (Always included for now)
        if (uploadData.prompt) {
            defaultSelected.add('prompt');
        }

        // Check Snippets
        if (uploadData.snippets) {
            uploadData.snippets.forEach(incoming => {
                const existing = existingSnippets.find(s => s.name === incoming.name);
                if (existing) {
                    newConflicts.snippets.push({ incoming, existing });
                } else {
                    defaultSelected.add(`snippet_${incoming.id}`);
                }
            });
        }

        // Check Knowledge
        if (uploadData.knowledgeBase) {
            uploadData.knowledgeBase.forEach(incoming => {
                const existing = existingKnowledge.find(k => k.title === incoming.title);
                if (existing) {
                    newConflicts.knowledge.push({ incoming, existing });
                } else {
                    defaultSelected.add(`kb_${incoming.id}`);
                }
            });
        }

        setConflicts(newConflicts);

        // Auto-select conflicting items by default (will be imported with '(imported)' suffix)
        newConflicts.snippets.forEach(c => defaultSelected.add(`snippet_${c.incoming.id}`));
        newConflicts.knowledge.forEach(c => defaultSelected.add(`kb_${c.incoming.id}`));

        setSelectedItems(defaultSelected);
        setIsResolving(false);

    }, [isOpen, uploadData, existingSnippets, existingKnowledge]);


    if (!isOpen || !uploadData) return null;

    const toggleItem = (id) => {
        const next = new Set(selectedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedItems(next);
    };

    const handleImport = () => {
        setIsResolving(true);
        // Build the final approved bundle
        const finalData = {
            prompt: selectedItems.has('prompt') ? uploadData.prompt : null,
            snippets: uploadData.snippets?.filter(s => selectedItems.has(`snippet_${s.id}`)) || [],
            knowledgeBase: uploadData.knowledgeBase?.filter(k => selectedItems.has(`kb_${k.id}`)) || [],
            updateIntent: uploadData.updateIntent || null,
            _embeddedCollections: uploadData._embeddedCollections || []
        };

        // YIELD THREAD: Garantierte UI-Aktualisierung vor dem Datenbank-Freeze
        setTimeout(() => {
            onConfirm(finalData, conflicts);
        }, 50);
    };

    const hasConflicts = conflicts.snippets.length > 0 || conflicts.knowledge.length > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="modal-glass-panel rounded-xl overflow-hidden max-w-2xl w-full flex flex-col max-h-[90vh] dm-modal">

                {/* Header */}
                <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-bg-surface shrink-0">
                    <h3 className="font-bold text-text-main flex items-center gap-2">
                        <Package size={18} className="text-indigo-400" />
                        Import Workflow Bundle
                    </h3>
                    <button onClick={onClose} className="p-2 text-text-muted hover:text-text-main rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-bg space-y-6 custom-scrollbar">

                    {/* The Prompt */}
                    {uploadData.prompt && (
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-text-faint uppercase tracking-wider">1. Main Prompt</h4>
                            <div
                                className={`bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors`}
                                onClick={() => toggleItem('prompt')}
                            >
                                <div className={`transition-colors ${selectedItems.has('prompt') ? 'text-primary' : 'text-text-muted'}`}>
                                    {selectedItems.has('prompt') ? <CheckSquare size={16} /> : <Square size={16} />}
                                </div>
                                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                    <FileText size={16} className="text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium text-text-main truncate">{uploadData.prompt.title}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* New/Safe Items */}
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-text-faint uppercase tracking-wider">2. New Dependencies (Safe to Import)</h4>
                        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                            {uploadData.snippets?.filter(s => !conflicts.snippets.some(c => c.incoming.id === s.id)).map(s => (
                                <div key={s.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleItem(`snippet_${s.id}`)}>
                                    <div className={`transition-colors ${selectedItems.has(`snippet_${s.id}`) ? 'text-primary' : 'text-text-muted'}`}>
                                        {selectedItems.has(`snippet_${s.id}`) ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </div>
                                    <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                                        <Layers size={12} className="text-amber-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-mono font-bold text-text-main truncate">@{s.name}</div>
                                    </div>
                                </div>
                            ))}
                            {uploadData.knowledgeBase?.filter(k => !conflicts.knowledge.some(c => c.incoming.id === k.id)).map(k => (
                                <div key={k.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleItem(`kb_${k.id}`)}>
                                    <div className={`transition-colors ${selectedItems.has(`kb_${k.id}`) ? 'text-primary' : 'text-text-muted'}`}>
                                        {selectedItems.has(`kb_${k.id}`) ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </div>
                                    <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center shrink-0">
                                        <BookOpen size={12} className="text-orange-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-text-main truncate">[[{k.title}]]</div>
                                    </div>
                                </div>
                            ))}

                            {(!uploadData.snippets?.filter(s => !conflicts.snippets.some(c => c.incoming.id === s.id)).length &&
                                !uploadData.knowledgeBase?.filter(k => !conflicts.knowledge.some(c => c.incoming.id === k.id)).length) && (
                                    <div className="p-4 text-center text-sm text-text-muted italic">No new dependencies found.</div>
                                )}
                        </div>
                    </div>

                    {/* Conflicts */}
                    {hasConflicts && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-500">
                                <AlertTriangle size={16} />
                                <h4 className="text-[10px] font-bold uppercase tracking-wider">3. Existing Name Conflicts</h4>
                            </div>
                            <p className="text-xs text-text-muted">
                                You already have items with these names. If you choose to import them, we will append <strong>(imported)</strong> to the new ones to keep your existing data safe. The prompt will be automatically updated to point to the new imported versions.
                            </p>

                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg overflow-hidden divide-y divide-border">
                                {conflicts.snippets.map(c => (
                                    <div key={c.incoming.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleItem(`snippet_${c.incoming.id}`)}>
                                        <div className={`transition-colors ${selectedItems.has(`snippet_${c.incoming.id}`) ? 'text-primary' : 'text-text-muted'}`}>
                                            {selectedItems.has(`snippet_${c.incoming.id}`) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                                            <Layers size={12} className="text-amber-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-mono font-bold text-text-main truncate">@{c.incoming.name}</div>
                                            <div className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                                                Will become: <span className="font-bold text-amber-500">@{c.incoming.name} (imported)</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {conflicts.knowledge.map(c => (
                                    <div key={c.incoming.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated transition-colors" onClick={() => toggleItem(`kb_${c.incoming.id}`)}>
                                        <div className={`transition-colors ${selectedItems.has(`kb_${c.incoming.id}`) ? 'text-primary' : 'text-text-muted'}`}>
                                            {selectedItems.has(`kb_${c.incoming.id}`) ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center shrink-0">
                                            <BookOpen size={12} className="text-orange-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-text-main truncate">[[{c.incoming.title}]]</div>
                                            <div className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                                                Will become: <span className="font-bold text-amber-500">[[{c.incoming.title} (imported)]]</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-bg-surface flex items-center justify-between shrink-0">
                    <div className="text-xs text-text-muted">
                        Selected: <span className="font-bold text-text-main">{selectedItems.size}</span> items
                    </div>
                    <button
                        onClick={handleImport}
                        disabled={isResolving || selectedItems.size === 0}
                        className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isResolving ? 'Importing...' : 'Complete Import'}
                    </button>
                </div>

            </div>
        </div>
    );
}
