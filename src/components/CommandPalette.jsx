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
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, FileText, Blocks, ArrowRight, ShieldCheck } from 'lucide-react';
import useBodyLock from '../hooks/useBodyLock';

export default function CommandPalette({ isOpen, onClose, prompts, snippets, onSelect }) {
    useBodyLock();
    const [search, setSearch] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    // Filtered Results
    const results = React.useMemo(() => {
        if (!search.trim()) return [];
        const q = search.toLowerCase();

        const staticActions = [
            {
                id: 'action-full-backup',
                title: 'Full-Backup',
                type: 'action',
                icon: 'backup',
                content: 'Create a full system backup (JSON)'
            }
        ];

        const filteredActions = staticActions.filter(a =>
            a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
        );

        const filteredPrompts = prompts.map(p => ({ ...p, type: 'prompt' }))
            .filter(p => p.title.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q));

        const filteredSnippets = snippets.map(s => ({ ...s, type: 'snippet' }))
            .filter(s => s.name.toLowerCase().includes(q) || s.content?.toLowerCase().includes(q));

        return [...filteredActions, ...filteredPrompts, ...filteredSnippets].slice(0, 8);
    }, [search, prompts, snippets]);

    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50); // Erhöht auf 50ms für robusten Fokus
        }
    }, [isOpen]);

    // === ZERO-REGRESSION: GLOBAL ESCAPE LISTENER ===
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        // Capture-Phase (true) garantiert, dass ESC die Palette schließt,
        // BEVOR das Event an Editoren im Hintergrund durchgereicht wird.
        document.addEventListener('keydown', handleEscape, true);
        return () => document.removeEventListener('keydown', handleEscape, true);
    }, [isOpen, onClose]);

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            onSelect(results[selectedIndex]);
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[999999] flex items-start justify-center pt-[15vh] px-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="w-full max-w-xl bg-bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden relative z-10"
                    >
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-elevated/50">
                            <Search size={20} className="text-text-muted" />
                            <input
                                ref={inputRef}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search everything..."
                                className="w-full bg-transparent text-text-main text-base outline-none placeholder:text-text-faint"
                            />
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-surface border border-border text-[10px] text-text-muted font-bold">
                                ESC
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto no-scrollbar p-2">
                            {results.length > 0 ? (
                                <div className="space-y-1">
                                    {results.map((item, index) => (
                                        <button
                                            key={item.id}
                                            onClick={() => { onSelect(item); onClose(); }}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${selectedIndex === index
                                                ? 'bg-primary/10 border-primary/20 text-primary shadow-inner'
                                                : 'text-text-muted hover:text-text-main hover:bg-bg-hover border-transparent'
                                                } border`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`p-2 rounded-lg ${selectedIndex === index ? 'bg-primary text-white' : 'bg-bg-elevated text-text-muted'
                                                    }`}>
                                                    {item.type === 'prompt' ? <FileText size={16} /> :
                                                        item.type === 'snippet' ? <Blocks size={16} /> :
                                                            <ShieldCheck size={16} />}
                                                </div>
                                                <div className="text-left min-w-0">
                                                    <div className={`text-sm font-bold truncate ${selectedIndex === index ? 'text-text-main' : ''}`}>
                                                        {item.type === 'snippet' ? `@${item.name}` : item.title}
                                                    </div>
                                                    <div className="text-[10px] opacity-60 truncate font-mono">
                                                        {item.content?.substring(0, 60)}...
                                                    </div>
                                                </div>
                                            </div>
                                            {selectedIndex === index && <ArrowRight size={14} className="shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            ) : search.trim() ? (
                                <div className="p-8 text-center text-text-muted flex flex-col items-center gap-3">
                                    <div className="p-4 bg-bg-elevated rounded-full">
                                        <Command size={32} className="opacity-20" />
                                    </div>
                                    <p className="text-sm">No results found for "{search}"</p>
                                </div>
                            ) : (
                                <div className="p-12 text-center text-text-muted select-none">
                                    <p className="text-xs uppercase tracking-widest font-bold opacity-30">Type to search prompts & snippets</p>
                                </div>
                            )}
                        </div>

                        <div className="px-4 py-2 bg-bg-elevated/30 border-t border-border flex items-center gap-4 text-[10px] text-text-faint font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-1"><ArrowRight size={10} className="rotate-90" /> Navigate</span>
                            <span className="flex items-center gap-1"><ArrowRight size={10} className="rotate-180" /> Select</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
