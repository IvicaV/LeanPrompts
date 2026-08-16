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
import React, { useState, useRef, useEffect } from 'react';
import { History, RotateCcw, Trash2, Edit2, FileDiff, Eye, GitCommitVertical, Save } from 'lucide-react';
import usePromptStore from '../stores/promptStore';
import DiffViewer from './DiffViewer';

/**
 * VersionHistory Component
 * Accepts `versions` prop directly. The parent component decides WHICH versions to show.
 * Accepts `currentContent` for Diff View.
 * Accepts `onRestore` callback to handle specific restoration logic.
 */
export default function VersionHistory({
    prompt,         // Backwards compatibility
    item,           // Generic item (prompt or snippet)
    versions,
    currentContent,
    onRestore,
    onUpdateNote,   // Optional: generic note updater
    onDeleteVersion, // Optional: generic delete handler
    onManualSnapshot // Optional: manual snapshot trigger
}) {
    const { savePrompt, updateVersionNote } = usePromptStore();

    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [activeVersionId, setActiveVersionId] = useState(null); // Tracks the currently active/viewed version
    const [showEvolution, setShowEvolution] = useState(false); // Toggle: Raw vs Diff
    const scrollRef = useRef(null);
    const [scrollTargetId, setScrollTargetId] = useState(null);

    // Context resolution
    const targetItem = item || prompt;

    // Scroll to the target snapshot AFTER React has re-rendered the DOM
    // FIX: Using precise coordinate scrolling instead of scrollIntoView to prevent the entire Dashboard body from shifting up.
    useEffect(() => {
        if (scrollTargetId && scrollRef.current) {
            requestAnimationFrame(() => {
                const container = scrollRef.current;
                const el = container.querySelector(`[data-version-id="${scrollTargetId}"]`);
                if (el) {
                    const elRect = el.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    // Safe scrolling: only touch the local container's scrollTop
                    container.scrollTo({
                        top: container.scrollTop + (elRect.top - containerRect.top) - 16,
                        behavior: 'smooth'
                    });
                }
                setScrollTargetId(null);
            });
        }
    }, [scrollTargetId, showEvolution, currentContent]);

    const handleDeleteVersion = (versionId) => {
        if (onDeleteVersion) {
            onDeleteVersion(versionId);
            return;
        }

        // Backwards compatibility logic for prompts
        if (!prompt) return;
        const newVersions = prompt.versions?.filter(v => v.id !== versionId) || [];
        const newChain = prompt.chain?.map(step => ({
            ...step,
            versions: step.versions?.filter(v => v.id !== versionId) || []
        }));

        savePrompt({ ...prompt, versions: newVersions, chain: newChain });
    };

    const startEditing = (version) => {
        setEditingId(version.id);
        setEditValue(version.note);
    };

    const saveEditing = (versionId) => {
        if (editValue.trim()) {
            if (onUpdateNote) {
                onUpdateNote(versionId, editValue.trim());
            } else if (targetItem) {
                updateVersionNote(targetItem.id, versionId, editValue.trim());
            }
        }
        setEditingId(null);
    };

    const historyList = versions || [];
    const hasUnsavedChanges = currentContent && historyList.length > 0 && currentContent.trim() !== historyList[0].content.trim();

    return (
        <div className="flex flex-col h-full bg-bg text-text-main">

            {/* HEADER */}
            <div className="p-4 border-b border-border bg-bg-surface shrink-0 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                        <History size={12} /> Timeline
                    </h3>
                    <span className="text-[10px] text-text-faint bg-bg-elevated px-2 py-0.5 rounded-full border border-border">
                        {historyList.length} Snapshots
                    </span>
                </div>

                {/* VIEW CONTROLS */}
                <button
                    onClick={() => {
                        const nextEvolution = !showEvolution;
                        setShowEvolution(nextEvolution);
                        // When closing diff view: smooth scroll to active snapshot or top of timeline
                        if (!nextEvolution) {
                            if (activeVersionId) {
                                setScrollTargetId(activeVersionId);
                            } else if (scrollRef.current) {
                                scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        }
                    }}
                    className={`w-full p-1.5 rounded-md text-[10px] font-medium border transition-all flex items-center justify-center gap-1.5 ${showEvolution
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-bg-elevated border-transparent text-text-muted hover:text-text-main group/diff'
                        }`}
                    title="Toggle Diff View (Evolutionary)"
                >
                    {showEvolution ? <FileDiff size={12} /> : <Eye size={12} className="group-hover/diff:scale-110 transition-transform" />}
                    Diff View (Evolution)
                </button>
            </div>

            {/* LIST */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {!hasUnsavedChanges && historyList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-text-muted opacity-50 select-none">
                        <GitCommitVertical className="w-8 h-8 mb-2 opacity-30" />
                        <p className="text-xs">No history found for this view.</p>
                        <p className="text-[10px] mt-1">Make changes & save to see history.</p>
                    </div>
                ) : (
                    <>
                        {/* UNSAVED CHANGES SECTION */}
                        {hasUnsavedChanges && (
                            <div className="relative pl-4 border-l-2 border-dashed border-amber-500/30 group mb-8">
                                <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-bg shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse"></div>

                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                                            <Save size={10} /> Pending Snapshot
                                        </span>
                                        <span className="text-[10px] text-amber-500/70 leading-tight pr-4">
                                            The editor content has changed since the last snapshot. 
                                            Create a snapshot to freeze this state in the timeline.
                                        </span>
                                    </div>
                                    {onManualSnapshot && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onManualSnapshot();
                                            }}
                                            className="shrink-0 flex items-center gap-1.5 px-2 py-1.2 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold uppercase tracking-wider transition-all border border-amber-500/30 hover:border-amber-500/50"
                                        >
                                            <Save size={10} />
                                            Snapshot
                                        </button>
                                    )}
                                </div>

                                <div className="mb-2">
                                    {showEvolution ? (
                                        <div className="animate-fade-in relative text-[10px] bg-amber-500/5 p-2 rounded border border-amber-500/20">
                                            <DiffViewer oldText={historyList[0].content} newText={currentContent} />
                                        </div>
                                    ) : (
                                        <div
                                            className="bg-amber-500/5 p-2.5 rounded border border-transparent hover:border-amber-500/20 cursor-pointer transition-colors group/preview"
                                            onClick={() => setShowEvolution(true)}
                                        >
                                            <div className="text-[10px] text-text-muted group-hover/preview:text-text-main font-mono leading-normal line-clamp-3 select-none">
                                                {currentContent.replace(/\n/g, ' ').substring(0, 180)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* EVOLUTIONARY SNAPSHOTS */}
                        {historyList.map((v, index) => {
                            const oldContent = historyList[index + 1]?.content || "";
                            const newContent = v.content;

                            return (
                                <div 
                                    key={v.id} 
                                    data-version-id={v.id} 
                                    className={`relative pl-4 border-l transition-colors group py-2 -my-2 rounded-r-lg
                                        ${activeVersionId === v.id 
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10' 
                                            : 'border-border hover:border-primary/50'
                                        }`}
                                >

                                    {/* Timeline Dot */}
                                    <div className={`absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 transition-all 
                                        ${(index === 0 && !hasUnsavedChanges)
                                            ? 'bg-primary border-primary shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                                            : activeVersionId === v.id
                                                ? 'border-primary bg-bg'
                                                : 'bg-bg border-border group-hover:border-primary'
                                        }`}
                                    ></div>

                                    {/* ITEM HEADER */}
                                    <div className="flex justify-between items-start mb-1 min-h-[20px]">
                                        {editingId === v.id ? (
                                            <input
                                                autoFocus
                                                className="flex-1 bg-bg-elevated text-xs px-1.5 py-0.5 rounded border border-primary outline-none text-text-main"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={() => saveEditing(v.id)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEditing(v.id)}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2 group/title overflow-hidden">
                                                <span
                                                    onClick={() => startEditing(v)}
                                                    className="text-xs font-semibold text-text-main cursor-text hover:text-primary truncate max-w-[120px]"
                                                    title={v.note}
                                                >
                                                    {v.note}
                                                </span>
                                                <button
                                                    onClick={() => startEditing(v)}
                                                    className="opacity-0 group-hover/title:opacity-100 text-text-muted hover:text-primary transition-opacity"
                                                    title="Click to rename"
                                                >
                                                    <Edit2 size={10} />
                                                </button>
                                            </div>
                                        )}

                                        <span className="text-[9px] text-text-muted whitespace-nowrap ml-2">
                                            {new Date(v.timestamp).toLocaleString(undefined, {
                                                month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    </div>

                                    {/* CONTENT */}
                                    <div className="mb-2">
                                        {showEvolution ? (
                                            <div className="animate-fade-in relative text-[10px] bg-bg-elevated/50 p-2 rounded border border-border">
                                                {index === historyList.length - 1 ? (
                                                    <div className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-text-muted select-text p-1">
                                                        {newContent}
                                                    </div>
                                                ) : (
                                                    <DiffViewer oldText={oldContent} newText={newContent} />
                                                )}
                                                <div className="mt-1.5 text-[8px] text-text-faint uppercase font-bold tracking-tighter text-right border-t border-border/10 pt-1">
                                                    {index === historyList.length - 1 ? 'Initial Version' : 'Evolution'}
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="bg-bg-elevated p-2.5 rounded border border-transparent group-hover:border-border/50 cursor-pointer transition-colors group/preview"
                                                onClick={() => { 
                                                    setShowEvolution(true); 
                                                    setScrollTargetId(v.id);
                                                    setActiveVersionId(v.id);
                                                }}
                                                title="Click to see evolutionary diff"
                                            >
                                                <div className="text-[10px] text-text-muted group-hover/preview:text-text-main font-mono leading-normal line-clamp-3 select-none">
                                                    {v.content.replace(/\n/g, ' ').substring(0, 180)}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => {
                                                onRestore(v.content);
                                                setScrollTargetId(v.id);
                                                setActiveVersionId(v.id);
                                            }}
                                            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary hover:text-white px-2 py-1 rounded transition-all shadow-sm active:scale-95"
                                            title="Load this version into the editor"
                                        >
                                            <RotateCcw size={10} strokeWidth={3} /> Load to Editor
                                        </button>

                                        <button
                                            onClick={() => handleDeleteVersion(v.id)}
                                            className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors ml-auto grayscale hover:grayscale-0"
                                            title="Delete Snapshot"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}