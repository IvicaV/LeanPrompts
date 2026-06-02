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
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag as TagIcon, Search, Plus, CheckCircle2 } from 'lucide-react';
import useBodyLock from '../hooks/useBodyLock';

export default function MultiTaggerModal({
    isOpen,
    onClose,
    promptTitle,
    allTags = [], // [{ name, count }]
    currentTags = [], // ["tag1", "tag2"]
    onSave
}) {
    useBodyLock();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState([]);

    // Sync local selected state with props when opening
    useEffect(() => {
        if (isOpen) {
            setSelected(currentTags || []);
            setSearch('');
        }
    }, [isOpen, currentTags]);

    // Filter tags based on search and Sort Alphabetically
    const filtered = useMemo(() => {
        const lowerSearch = search.toLowerCase();

        // 0. Merge allTags with any selected tags that might not be in allTags yet
        const tagsMap = new Map(allTags.map(t => [t.name, t]));
        selected.forEach(selTag => {
            if (!tagsMap.has(selTag)) {
                tagsMap.set(selTag, { name: selTag, count: 0 });
            }
        });

        const mergedTags = Array.from(tagsMap.values());

        // 1. Filter
        const matches = mergedTags.filter(t => t.name.toLowerCase().includes(lowerSearch));

        // 2. Sort Alphabetically (Case Insensitive)
        return matches.sort((a, b) => a.name.localeCompare(b.name));
    }, [allTags, search, selected]);

    // Handle toggle
    const toggleTag = (tagName) => {
        setSelected(prev =>
            prev.includes(tagName)
                ? prev.filter(t => t !== tagName)
                : [...prev, tagName]
        );
    };

    const handleApply = () => {
        onSave(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="modal-glass-panel w-full max-w-lg rounded-xl overflow-hidden flex flex-col max-h-[85vh] outline-none dm-modal"
                    onClick={e => e.stopPropagation()}
                >

                    {/* Header */}
                    <div className="p-4 border-b border-border flex items-center justify-between bg-bg-surface/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 rounded-lg">
                                <TagIcon size={18} className="text-primary" />
                            </div>
                            <div className="flex flex-col">
                                <h3 className="text-sm font-bold text-text-main uppercase tracking-wider leading-tight mb-0.5">Manage Tags</h3>
                                <p className="text-[11px] text-text-muted font-medium truncate max-w-[280px]">
                                    for <span className="text-text-main font-semibold">"{promptTitle}"</span>
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-bg-elevated rounded-lg text-text-muted transition-all hover:text-text-main group">
                            <X size={20} className="group-hover:rotate-90 transition-transform duration-200" />
                        </button>
                    </div>

                    {/* Search Area */}
                    <div className="p-4 border-b border-border bg-bg-surface/30">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-faint" size={16} />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search existing or create new..."
                                className="w-full bg-bg border border-border rounded-lg pl-11 pr-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/5 transition-all placeholder:text-text-faint/50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault();
                                        if (search.trim()) {
                                            const newTag = search.trim();
                                            if (!selected.includes(newTag)) {
                                                toggleTag(newTag);
                                                setSearch('');
                                            }
                                        }
                                    }
                                    if (e.key === 'Escape') onClose();
                                }}
                            />
                            {search && !allTags.some(t => t.name.toLowerCase() === search.toLowerCase()) && (
                                <button
                                    onClick={() => { toggleTag(search.trim()); setSearch(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-primary text-white text-[10px] font-bold rounded-md hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-1.5"
                                >
                                    <Plus size={12} strokeWidth={3} /> Create "{search}"
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tags List */}
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-bg/20 min-h-[150px]">
                        <div className="flex flex-wrap gap-2">
                            {filtered.length > 0 ? (
                                filtered.map(tag => {
                                    const isSelected = selected.includes(tag.name);
                                    return (
                                        <div
                                            key={tag.name}
                                            className={`group relative flex items-center gap-2 pl-2.5 pr-2 py-1.5 h-[30px] rounded-md border transition-all cursor-pointer select-none ${isSelected
                                                ? 'bg-primary border-primary text-white shadow-sm shadow-primary/20 ring-1 ring-primary/50'
                                                : 'bg-bg-elevated border-border text-text-muted hover:border-text-main hover:bg-bg-elevated/80'
                                                }`}
                                            onClick={() => toggleTag(tag.name)}
                                        >
                                            <span className="text-xs font-semibold">{tag.name}</span>
                                            {tag.count > 0 && !isSelected && (
                                                <span className="text-[10px] text-black/[0.45] dark:text-white/[0.45] px-1 py-0.5 bg-black/5 dark:bg-white/5 rounded-sm font-mono">{tag.count}</span>
                                            )}
                                            {isSelected && <CheckCircle2 size={13} className="shrink-0 text-white" />}
                                        </div>
                                    );
                                })
                            ) : search ? (
                                <div className="w-full flex flex-col items-center justify-center py-12 text-text-muted/40 gap-3">
                                    <div className="p-4 bg-bg-elevated rounded-full">
                                        <TagIcon size={32} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm italic font-medium">No results for "{search}"</p>
                                    <button
                                        onClick={() => { toggleTag(search.trim()); setSearch(''); }}
                                        className="text-xs text-primary font-bold hover:underline"
                                    >
                                        Create it as a new tag?
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full flex flex-col items-center justify-center py-12 text-text-muted/40 gap-3">
                                    <div className="p-4 bg-bg-elevated rounded-full">
                                        <TagIcon size={32} strokeWidth={1} />
                                    </div>
                                    <p className="text-sm italic font-medium text-center">Your tag library is empty.<br />Type above to create your first tag.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-bg-surface/50 border-t border-border flex items-center justify-between backdrop-blur-md">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-text-faint font-bold uppercase tracking-wider mb-0.5">Selection</span>
                            <span className="text-[12px] text-text-main font-bold">
                                {selected.length} {selected.length === 1 ? 'tag' : 'tags'} picked
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main transition-all rounded-lg hover:bg-bg-elevated"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApply}
                                className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <CheckCircle2 size={14} />
                                Apply Changes
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
