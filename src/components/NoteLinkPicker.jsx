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
import { createPortal } from 'react-dom';
import { FileText, BookOpen, Code, Search } from 'lucide-react';

/**
 * NoteLinkPicker - Autocomplete dropdown for inserting internal links
 * Triggers: [[ for Prompts/KB, @ for Snippets
 */
export default function NoteLinkPicker({
    isOpen,
    onClose,
    onSelect,
    trigger, // '[[' or '@'
    searchQuery: externalSearchQuery,
    position, // { top, left }
    prompts = [],
    snippets = [],
    knowledgeTiles = []
}) {
    const [activeTab, setActiveTab] = useState('prompts'); // 'prompts' | 'kb'
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [localSearchQuery, setLocalSearchQuery] = useState('');
    const containerRef = useRef(null);
    const searchInputRef = useRef(null);

    // Use local search query for filtering
    const searchQuery = localSearchQuery || externalSearchQuery || '';

    // Reset local search when picker opens/closes
    useEffect(() => {
        if (isOpen) {
            setLocalSearchQuery('');
            // Focus search input after render
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Filter items based on search query - NO LIMIT
    const filteredPrompts = prompts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredKB = knowledgeTiles.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredSnippets = snippets.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Current list based on trigger and tab
    const currentItems = trigger === '@'
        ? filteredSnippets
        : (activeTab === 'prompts' ? filteredPrompts : filteredKB);

    // Reset selection when items change
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery, activeTab, trigger]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, currentItems.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && currentItems[selectedIndex]) {
                e.preventDefault();
                handleSelect(currentItems[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Tab' && trigger === '[[') {
                e.preventDefault();
                setActiveTab(prev => prev === 'prompts' ? 'kb' : 'prompts');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentItems, selectedIndex, trigger]);

    const handleSelect = (item) => {
        if (trigger === '@') {
            onSelect({ type: 'snippet', id: item.id, text: `@${item.name}` });
        } else if (activeTab === 'prompts') {
            onSelect({ type: 'prompt', id: item.id, text: `[[Prompt: ${item.title}]]` });
        } else {
            onSelect({ type: 'kb', id: item.id, text: `[[KB: ${item.title}]]` });
        }
    };

    if (!isOpen) return null;

    const totalCount = trigger === '@'
        ? snippets.length
        : (activeTab === 'prompts' ? prompts.length : knowledgeTiles.length);

    const content = (
        <div
            ref={containerRef}
            className="fixed bg-bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-[10000] w-80 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Tabs for [[ trigger */}
            {trigger === '[[' && (
                <div className="flex border-b border-border bg-bg-elevated">
                    <button
                        onClick={() => setActiveTab('prompts')}
                        className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${activeTab === 'prompts'
                                ? 'text-primary border-b-2 border-primary bg-bg-surface'
                                : 'text-text-muted hover:text-text-main'
                            }`}
                    >
                        <FileText size={12} /> Prompts ({prompts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('kb')}
                        className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${activeTab === 'kb'
                                ? 'text-primary border-b-2 border-primary bg-bg-surface'
                                : 'text-text-muted hover:text-text-main'
                            }`}
                    >
                        <BookOpen size={12} /> KB ({knowledgeTiles.length})
                    </button>
                </div>
            )}

            {/* Header for @ trigger */}
            {trigger === '@' && (
                <div className="px-3 py-2 border-b border-border bg-bg-elevated">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                        <Code size={12} /> Snippets ({snippets.length})
                    </span>
                </div>
            )}

            {/* Search Input */}
            <div className="p-2 border-b border-border bg-bg">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={localSearchQuery}
                        onChange={(e) => setLocalSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-main placeholder:text-text-faint focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Items List */}
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {currentItems.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                        {searchQuery ? 'No matches found' : 'No items available'}
                    </div>
                ) : (
                    currentItems.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-all ${index === selectedIndex
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-text-main hover:bg-bg-elevated'
                                }`}
                        >
                            {trigger === '@' ? (
                                <Code size={14} className="text-text-muted shrink-0" />
                            ) : activeTab === 'prompts' ? (
                                <FileText size={14} className="text-text-muted shrink-0" />
                            ) : (
                                <BookOpen size={14} className="text-text-muted shrink-0" />
                            )}
                            <span className="truncate">
                                {trigger === '@' ? item.name : item.title}
                            </span>
                        </button>
                    ))
                )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-border bg-bg-elevated text-[10px] text-text-faint flex items-center justify-between">
                <span>{currentItems.length} / {totalCount}</span>
                <span>↑↓ Navigate</span>
                <span>Enter Select</span>
                {trigger === '[[' && <span>Tab Switch</span>}
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
