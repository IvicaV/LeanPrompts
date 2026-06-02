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
import React, { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Check, Copy, Pin, Star, Folder, ChevronDown, Plus, X, Tag, BookOpen, Layers, Search, MoreVertical } from 'lucide-react';
import usePromptStore from '../stores/promptStore';
import { compilePrompt, resolveSnippets } from '../utils/variableParser';
import Rating from './Rating';
import BulkActionBar from './BulkActionBar';
import TagEditorPopover from './TagEditorPopover';
import DynamicTagList from './DynamicTagList';

// =========================================================================
// [PROTECTED: ZERO-REGRESSION PERFORMANCE SHIELD]
// Isoliert die Render-Kosten jeder Karte. React überspringt inaktive 
// Karten beim Tippen komplett (0ms Render-Zeit).
// =========================================================================
const PromptCard = memo(({
    prompt, isSelected, isActive, isPinned, isDropdownOpen,
    collections, snippets, promptBacklinks,
    activeMenuId, setActiveMenuId, menuPopupPos, setMenuPopupPos,
    collectionDropdownOpen, setCollectionDropdownOpen, collectionPopupPos, setCollectionPopupPos,
    isCreatingCollection, setIsCreatingCollection, newCollectionName, setNewCollectionName,
    backlinkDropdownOpen, setBacklinkDropdownOpen, backlinkPopupPos, setBacklinkPopupPos,
    onSelect, toggleSelection, handleTogglePin, requestDeleteSingle, onDuplicateRequest, setRating,
    onCreateCollection, assignToCollection, setTagEditorConfig, onOpenPromptNote, onOpenKnowledgeTile
}) => {
    const isSubmittingColRef = useRef(false);

    return (
        <div
            id={`prompt-card-${prompt.id}`}
            onClick={() => onSelect(prompt.id)}
            className={`
                group relative p-3 rounded-lg cursor-pointer border transition-all duration-200
                ${isPinned ? 'pinned-item shadow-sm' : ''}
                ${isActive
                    ? 'border-primary/40 shadow-sm bg-bg-hover'
                    : isDropdownOpen
                        ? 'bg-bg-hover shadow-sm border-border'
                        : isSelected
                            ? 'bg-primary/5 border-primary/20'
                            : 'border-transparent hover:bg-bg-hover hover:border-border'
                }
            `}
        >
            <div className="flex flex-col gap-1 w-full">
                <div className="flex items-start gap-3 w-full">

                    <div
                        className={`pt-1 shrink-0 ${(!isSelected && !isDropdownOpen) ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity`}
                        onClick={(e) => toggleSelection(e, prompt.id)}
                    >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}>
                            {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between relative mb-0.5">
                            <div className="flex items-center gap-2 min-w-0 pr-8">
                                {prompt.thumbnailImage && (
                                    <img 
                                        src={prompt.thumbnailImage} 
                                        className="w-7 h-7 rounded object-cover ring-1 ring-white/10 shrink-0 shadow-sm" 
                                        loading="lazy"
                                        alt="Thumbnail"
                                    />
                                )}
                                <div
                                    title={prompt.title}
                                    className={`font-medium text-sm truncate ${isActive ? 'text-primary' : 'text-text-main'}`}
                                >
                                    {prompt.title}
                                </div>
                            </div>

                            <div className="absolute -top-1 -right-1 flex items-center gap-1">
                                <button 
                                    id={`prompt-menu-btn-${prompt.id}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (activeMenuId === prompt.id) {
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
                                            setActiveMenuId(prompt.id);
                                        }
                                    }}
                                    className="p-1.5 text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all"
                                >
                                    <MoreVertical size={14} />
                                </button>
                                
                                {activeMenuId === prompt.id && createPortal(
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
                                                const elm = document.getElementById(`prompt-menu-btn-${prompt.id}`);
                                                const rect = elm ? elm.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                                                setTagEditorConfig({
                                                    isOpen: true,
                                                    ids: [prompt.id],
                                                    isBulk: false,
                                                    initialTags: prompt.tags || [],
                                                    anchorRect: {
                                                        top: rect.top,
                                                        bottom: rect.bottom,
                                                        left: rect.left,
                                                        right: rect.right,
                                                    }
                                                });
                                                setActiveMenuId(null);
                                            }} 
                                            className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                                        >
                                            <Tag size={12} /> Tags
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleTogglePin(e, prompt.id); setActiveMenuId(null); }} className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2">
                                            <Pin size={12} className={prompt.isPinned ? 'text-amber-500' : ''} /> {prompt.isPinned ? 'Unpin' : 'Pin to top'}
                                        </button>

                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (onDuplicateRequest) onDuplicateRequest(prompt.id); 
                                                setActiveMenuId(null); 
                                            }} 
                                            className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-all flex items-center gap-2"
                                        >
                                            <Copy size={12} /> Duplicate
                                        </button>

                                        <button onClick={(e) => { e.stopPropagation(); requestDeleteSingle(e, prompt.id); setActiveMenuId(null); }} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all flex items-center gap-2">
                                            <Trash2 size={12} /> Delete
                                        </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mb-0.5 pr-14">
                            <Rating
                                value={prompt.rating || 0}
                                onChange={(val) => setRating(prompt.id, val)}
                                size={10}
                            />

                            {prompt.chain && prompt.chain.length > 1 && (
                                <div className="flex items-center gap-1.5 ml-2 text-[10px] text-text-faint font-medium select-none pointer-events-none whitespace-nowrap shrink-0">
                                    <Layers size={11} className="opacity-60 shrink-0" />
                                    <span className="tracking-wide">{prompt.chain.length} Steps</span>
                                </div>
                            )}

                            <div className="relative ml-auto flex items-center gap-1">
                                {promptBacklinks && promptBacklinks.length > 0 && (
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuId(null);
                                                if (backlinkDropdownOpen === prompt.id) {
                                                    setBacklinkDropdownOpen(null);
                                                } else {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                                    
                                                    let left = rect.left;
                                                    if (left + 176 > window.innerWidth) { 
                                                        left = window.innerWidth - 176 - 16;
                                                    }
                                                    
                                                    setBacklinkPopupPos({
                                                        left: left,
                                                        ...(isFlipped 
                                                            ? { bottom: window.innerHeight - rect.top + 4 } 
                                                            : { top: rect.bottom + 4 })
                                                    });
                                                    setBacklinkDropdownOpen(prompt.id);
                                                }
                                            }}
                                            className={`p-1 rounded hover:bg-bg-hover transition-all text-text-muted hover:text-primary relative group/backlink ${backlinkDropdownOpen === prompt.id ? 'bg-bg-elevated text-primary' : ''}`}
                                            title={`${promptBacklinks.length} References`}
                                        >
                                            <BookOpen size={12} />
                                            <span className="absolute -top-1 -right-1 bg-bg-elevated text-[8px] px-0.5 rounded border border-border">
                                                {promptBacklinks.length}
                                            </span>
                                        </button>

                                        {backlinkDropdownOpen === prompt.id && createPortal(
                                            <div className="portal-root">
                                                <div
                                                    className="fixed inset-0 z-[9998]"
                                                    onClick={(e) => { e.stopPropagation(); setBacklinkDropdownOpen(null); }}
                                                ></div>
                                                <div
                                                    className="fixed bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 w-44 dm-dropdown"
                                                    style={backlinkPopupPos}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                                                        <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Referenced in</span>
                                                    </div>
                                                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                                        {promptBacklinks.map(link => (
                                                            <button
                                                                key={link.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (link.type === 'prompt' && onOpenPromptNote) {
                                                                        onOpenPromptNote(link.id, link.stepId);
                                                                    } else if (link.type === 'snippet') {
                                                                        window.dispatchEvent(new CustomEvent('NAVIGATE_TO', { detail: { type: 'snippet', id: link.id, tab: 'notes' } }));
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

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        if (collectionDropdownOpen === prompt.id) {
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
                                            setCollectionDropdownOpen(prompt.id);
                                        }
                                    }}
                                    className="p-1 rounded hover:bg-bg-hover transition-all group/col"
                                    title={prompt.collectionId
                                        ? `In: ${collections.find(c => c.id === prompt.collectionId)?.name}`
                                        : 'Add to Collection'
                                    }
                                >
                                    <div className="flex items-center gap-1">
                                        <Folder size={12} className={prompt.collectionId ? 'text-text-main' : 'text-text-faint'} />
                                        <div
                                            className={`w-1.5 h-1.5 rounded-full transition-all ${prompt.collectionId ? 'opacity-100' : 'opacity-0'}`}
                                            style={{ backgroundColor: prompt.collectionId ? (collections.find(c => c.id === prompt.collectionId)?.color || '#6366f1') : 'transparent' }}
                                        ></div>
                                    </div>
                                </button>

                                {collectionDropdownOpen === prompt.id && createPortal(
                                    <div className="portal-root">
                                        <div
                                            className="fixed inset-0 z-[9998]"
                                            onClick={(e) => { e.stopPropagation(); setCollectionDropdownOpen(null); setIsCreatingCollection(false); setNewCollectionName(""); }}
                                        ></div>
                                        <div 
                                            className="fixed w-44 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
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
                                                                    if (isSubmittingColRef.current) return;
                                                                    isSubmittingColRef.current = true;
                                                                    try {
                                                                        const newId = crypto.randomUUID();
                                                                        await onCreateCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                                        assignToCollection(prompt.id, newId);
                                                                        setNewCollectionName("");
                                                                        setIsCreatingCollection(false);
                                                                        setCollectionDropdownOpen(null);
                                                                    } finally {
                                                                        isSubmittingColRef.current = false;
                                                                    }
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
                                                        assignToCollection(prompt.id, null);
                                                        setCollectionDropdownOpen(null);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${!prompt.collectionId
                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                        : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                        }`}
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                    <span className="truncate">None (Uncategorized)</span>
                                                    {!prompt.collectionId && <Check size={10} className="ml-auto shrink-0" />}
                                                </button>
                                                {collections.map(col => (
                                                    <button
                                                        key={col.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            assignToCollection(prompt.id, col.id);
                                                            setCollectionDropdownOpen(null);
                                                        }}
                                                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] transition-all ${prompt.collectionId === col.id
                                                            ? 'bg-primary/10 text-primary font-semibold'
                                                            : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                                                            }`}
                                                    >
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: col.color || '#6366f1' }}
                                                        ></div>
                                                        <span className="truncate">{col.name}</span>
                                                        {prompt.collectionId === col.id && <Check size={12} className="ml-auto" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>

                        <div className="mt-1 space-y-1">
                            {prompt.tags && prompt.tags.length > 0 && (
                                <DynamicTagList tags={prompt.tags} maxTagWidth={80} />
                            )}
                            <div className="text-xs text-text-muted truncate font-mono opacity-60 group-hover:opacity-90 transition-opacity mt-1">
                                {prompt.content ? (() => {
                                    try {
                                        const compiled = compilePrompt(resolveSnippets(prompt.content, snippets), {});
                                        const trim = compiled.trim();
                                        return trim ? (trim.length > 300 ? trim.slice(0, 300) + "..." : trim) : "Empty...";
                                    } catch (e) {
                                        return prompt.content.length > 300 ? prompt.content.slice(0, 300) + "..." : prompt.content;
                                    }
                                })() : "Empty..."}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    // ---------------------------------------------------------------------
    // CUSTOM COMPARATOR: Der absolute Schutz vor Re-Render-Spam
    // ---------------------------------------------------------------------
    
    // 1. Wenn sich die eigentlichen Daten des Prompts ändern (Titel, Inhalt, etc.) -> Neu rendern
    if (prev.prompt !== next.prompt) return false;
    
    // 2. Wenn sich der globale Status für DIESE Karte ändert -> Neu rendern
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isActive !== next.isActive) return false;
    if (prev.isPinned !== next.isPinned) return false;
    if (prev.isDropdownOpen !== next.isDropdownOpen) return false;

    // 3. Wenn in DIESER Karte gerade ein Dropdown offen ist, müssen wir auf Eingaben reagieren
    if (next.isDropdownOpen) {
        if (prev.isCreatingCollection !== next.isCreatingCollection) return false;
        if (prev.newCollectionName !== next.newCollectionName) return false;
    }

    // 4. Globale Referenz-Updates (Collections, Snippets, Backlink-Anzahl)
    if (prev.collections !== next.collections) return false;
    if (prev.snippets !== next.snippets) return false;
    
    // Wir prüfen nur die LÄNGE der Arrays, nicht die Speicherreferenz (behebt den `|| []` Bug)
    if (prev.promptBacklinks?.length !== next.promptBacklinks?.length) return false;

    // Wenn nichts davon zutrifft: Prop-Changes ignorieren! Karte NICHT neu rendern.
    return true; 
});

export default function PromptList({
    prompts,
    activePromptId,
    onSelect,
    onDeleteRequest,
    onDuplicateRequest,
    onBulkDeleteRequest,
    tags,
    onCreateCollection,
    backlinks = {},
    onOpenKnowledgeTile,
    onOpenPromptNote
}) {
    const { deletePrompt, bulkDeletePrompts, togglePin, setRating, collections, assignToCollection, saveCollection, bulkAssignPromptsToCollection, bulkUpdatePromptTags, snippets, prompts: allPrompts } = usePromptStore();
    const [selectedIds, setSelectedIds] = useState([]);
    const [collectionDropdownOpen, setCollectionDropdownOpen] = useState(null); 
    const [backlinkDropdownOpen, setBacklinkDropdownOpen] = useState(null);
    const [backlinkPopupPos, setBacklinkPopupPos] = useState({ top: 0, left: 0 }); 
    const [collectionPopupPos, setCollectionPopupPos] = useState({ top: 0, left: 0 });
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    
    const isSubmittingColRef = useRef(false);

    const [activeMenuId, setActiveMenuId] = useState(null);
    const [menuPopupPos, setMenuPopupPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const closeMenu = () => setActiveMenuId(null);
        if (activeMenuId) window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [activeMenuId]);

    const [tagEditorConfig, setTagEditorConfig] = useState({
        isOpen: false,
        ids: [],
        isBulk: false,
        initialTags: [],
        anchorRect: null
    });

    const scrollRef = useRef(null);

    // AUTO-SCROLL TO ACTIVE PROMPT ON MOUNT OR EXTERNAL NAVIGATION
    // ZERO-REGRESSION: Simplified and robust since elements are no longer virtualized away
    useEffect(() => {
        if (activePromptId && scrollRef.current) {
            // Delay slightly to ensure React has fully committed the DOM
            requestAnimationFrame(() => {
                const container = scrollRef.current;
                const activeCard = document.getElementById(`prompt-card-${activePromptId}`);
                
                if (activeCard && container) {
                    const containerRect = container.getBoundingClientRect();
                    const cardRect = activeCard.getBoundingClientRect();
                    
                    // Only scroll if it's outside the comfortable viewing area
                    if (cardRect.top < containerRect.top || cardRect.bottom > containerRect.bottom) {
                        const exactTarget = container.scrollTop + (cardRect.top - containerRect.top) - (containerRect.height / 2) + (cardRect.height / 2);
                        container.scrollTo({ top: Math.max(0, exactTarget), behavior: 'smooth' });
                    }
                }
            });
        }
    }, [activePromptId]);

    const toggleSelection = (e, id) => {
        e.stopPropagation();
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleTogglePin = (e, id) => {
        e.stopPropagation();
        togglePin(id);
    };

    const requestDeleteSingle = (e, id) => {
        e.stopPropagation();
        if (onDeleteRequest) {
            onDeleteRequest(id);
        } else {
            deletePrompt(id);
        }
    };

    const requestBulkDelete = () => {
        if (onBulkDeleteRequest) {
            onBulkDeleteRequest(selectedIds, () => setSelectedIds([]));
        } else {
            bulkDeletePrompts(selectedIds);
            setSelectedIds([]);
        }
    };

    const allVisibleSelected = prompts.length > 0 && prompts.every(p => selectedIds.includes(p.id));

    const handleSelectAll = () => {
        if (allVisibleSelected) {
            const visibleIds = prompts.map(p => p.id);
            setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            const visibleIds = prompts.map(p => p.id);
            setSelectedIds(prev => {
                const newIds = new Set([...prev, ...visibleIds]);
                return Array.from(newIds);
            });
        }
    };

    return (
        <>
            <div className="flex-1 flex flex-col min-h-0 relative">
                {prompts.length > 0 && (
                    <div className="flex items-center gap-3 px-5 py-2 border-b border-border/50 bg-bg-surface/50 backdrop-blur-sm shrink-0 z-10">
                        <div
                            className={`pt-0.5 shrink-0 cursor-pointer group`}
                            onClick={handleSelectAll}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allVisibleSelected ? 'bg-primary border-primary' : 'border-text-muted hover:border-text-main'}`}>
                                {allVisibleSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                            </div>
                        </div>
                        <span className="text-xs font-medium text-text-muted select-none cursor-pointer hover:text-text-main transition-colors" onClick={handleSelectAll}>
                            Select All <span className="text-text-faint font-normal">({prompts.length})</span>
                        </span>
                    </div>
                )}
                
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar pb-16"
                >
                    {prompts.length === 0 ? (
                        <div className="p-8 text-center text-sm select-none text-text-muted">
                            {(allPrompts && allPrompts.length > 0) ? (
                                <div className="flex flex-col items-center gap-2 opacity-70">
                                    <Search size={20} className="text-text-faint mb-1" />
                                    <p className="font-medium text-text-main">No prompts match your filter.</p>
                                    <p className="text-xs text-text-muted max-w-[220px] leading-relaxed">
                                        Try adjusting your active collection, tags, or search query in the sidebar.
                                    </p>
                                </div>
                            ) : (
                                <span className="opacity-50">No prompts created yet.</span>
                            )}
                        </div>
                    ) : (
                        <>
                            {prompts.map(prompt => {
                                const isSelected = selectedIds.includes(prompt.id);
                                const isActive = activePromptId === prompt.id;
                                const isPinned = prompt.isPinned;
                                const isDropdownOpen = activeMenuId === prompt.id || backlinkDropdownOpen === prompt.id || collectionDropdownOpen === prompt.id || (tagEditorConfig.isOpen && tagEditorConfig.ids.includes(prompt.id));

                                return (
                                    <PromptCard 
                                        key={prompt.id}
                                        prompt={prompt}
                                        isSelected={isSelected}
                                        isActive={isActive}
                                        isPinned={isPinned}
                                        isDropdownOpen={isDropdownOpen}
                                        collections={collections}
                                        snippets={snippets}
                                        promptBacklinks={backlinks[prompt.id] || []}
                                        activeMenuId={activeMenuId}
                                        setActiveMenuId={setActiveMenuId}
                                        menuPopupPos={menuPopupPos}
                                        setMenuPopupPos={setMenuPopupPos}
                                        collectionDropdownOpen={collectionDropdownOpen}
                                        setCollectionDropdownOpen={setCollectionDropdownOpen}
                                        collectionPopupPos={collectionPopupPos}
                                        setCollectionPopupPos={setCollectionPopupPos}
                                        isCreatingCollection={isCreatingCollection}
                                        setIsCreatingCollection={setIsCreatingCollection}
                                        newCollectionName={newCollectionName}
                                        setNewCollectionName={setNewCollectionName}
                                        backlinkDropdownOpen={backlinkDropdownOpen}
                                        setBacklinkDropdownOpen={setBacklinkDropdownOpen}
                                        backlinkPopupPos={backlinkPopupPos}
                                        setBacklinkPopupPos={setBacklinkPopupPos}
                                        onSelect={onSelect}
                                        toggleSelection={toggleSelection}
                                        handleTogglePin={handleTogglePin}
                                        requestDeleteSingle={requestDeleteSingle}
                                        onDuplicateRequest={onDuplicateRequest}
                                        setRating={setRating}
                                        onCreateCollection={onCreateCollection}
                                        assignToCollection={assignToCollection}
                                        setTagEditorConfig={setTagEditorConfig}
                                        onOpenPromptNote={onOpenPromptNote}
                                        onOpenKnowledgeTile={onOpenKnowledgeTile}
                                    />
                                );
                            })}
                        </>
                    )}
                </div>

                <BulkActionBar
                    selectedCount={selectedIds.length}
                    onClearSelection={() => setSelectedIds([])}
                    onDelete={requestBulkDelete}
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
                                                    e.preventDefault();

                                                    // SYNCHRONOUS LOCK
                                                    if (isSubmittingColRef.current) return;
                                                    isSubmittingColRef.current = true;

                                                    try {
                                                        if (onCreateCollection) {
                                                            const newId = crypto.randomUUID();
                                                            await onCreateCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                            bulkAssignPromptsToCollection(selectedIds, newId);
                                                        }
                                                        setNewCollectionName("");
                                                        setIsCreatingCollection(false);
                                                        setCollectionDropdownOpen(null);
                                                        setSelectedIds([]);
                                                    } finally {
                                                        isSubmittingColRef.current = false;
                                                    }
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
                                        bulkAssignPromptsToCollection(selectedIds, null);
                                        setCollectionDropdownOpen(null);
                                        setSelectedIds([]);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-bg-hover text-text-muted hover:text-text-main transition-colors text-left"
                                >
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-400"></div>
                                    <span>Uncategorized</span>
                                </button>
                                {collections.map(col => (
                                    <button
                                        key={col.id}
                                        onClick={() => {
                                            bulkAssignPromptsToCollection(selectedIds, col.id);
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

            </div>

            <TagEditorPopover
                isOpen={tagEditorConfig.isOpen}
                onClose={() => setTagEditorConfig({ ...tagEditorConfig, isOpen: false })}
                onSave={(tags, mode) => {
                    if (tagEditorConfig.isBulk) {
                        bulkUpdatePromptTags(tagEditorConfig.ids, tags, mode);
                        setSelectedIds([]); // Clear selection after bulk tag
                    } else {
                        // Single edit: effectively replace
                        bulkUpdatePromptTags(tagEditorConfig.ids, tags, 'replace');
                    }
                }}
                initialTags={tagEditorConfig.initialTags}
                availableTags={(tags || []).map(t => t.name)}
                isBulk={tagEditorConfig.isBulk}
                anchorRect={tagEditorConfig.anchorRect}
            />


        </>
    );
}
