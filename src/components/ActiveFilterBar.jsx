/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 */
import React from 'react';
import { X, Filter } from 'lucide-react';

export default function ActiveFilterBar({
    activeCollection,
    selectedTags = [],
    searchQuery = "",
    onClearCollection,
    onRemoveTag,
    onClearSearch,
    onClearAll,
    layout = "list" // "list" | "contained"
}) {
    const hasCollection = !!activeCollection;
    const hasTags = Array.isArray(selectedTags) && selectedTags.length > 0;
    const hasSearch = typeof searchQuery === 'string' && searchQuery.trim() !== "";

    if (!hasCollection && !hasTags && !hasSearch) return null;

    // --- CASE 1: STANDARD SIDEBAR DESIGN (100% unverändert) ---
    if (layout === "list") {
        return (
            <div className="px-3 py-2 bg-bg-surface/50 border-b border-border/40 animate-fade-in flex flex-col gap-2 shrink-0 select-none">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-faint uppercase tracking-wider">
                        <Filter size={10} />
                        <span>Active Filters</span>
                    </div>
                    <button
                        onClick={onClearAll}
                        className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wider cursor-pointer"
                    >
                        Clear All
                    </button>
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                    {hasCollection && (
                        <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary"
                            style={activeCollection.color && activeCollection.color !== 'none' ? {
                                backgroundColor: `${activeCollection.color}15`,
                                borderColor: `${activeCollection.color}30`,
                                color: activeCollection.color
                            } : {}}
                        >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeCollection.color || '#6366f1' }} />
                            <span className="truncate max-w-[80px]" title={activeCollection.name}>{activeCollection.name}</span>
                            <button onClick={(e) => { e.stopPropagation(); onClearCollection(); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                                <X size={10} />
                            </button>
                        </span>
                    )}

                    {hasTags && selectedTags.map(tag => (
                        <span 
                            key={tag}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-bg-elevated border border-border text-text-muted hover:text-text-main"
                        >
                            <span>#{tag}</span>
                            <button onClick={(e) => { e.stopPropagation(); onRemoveTag(tag); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                                <X size={10} />
                            </button>
                        </span>
                    ))}

                    {hasSearch && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-bg-elevated border border-border/80 text-text-muted">
                            <span className="italic">"{searchQuery}"</span>
                            <button onClick={(e) => { e.stopPropagation(); onClearSearch(); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                                <X size={10} />
                            </button>
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // --- CASE 2: KB-DESIGN (Präzise max-w-3xl Begrenzung für vertikale Symmetrie zur Toolbar) ---
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs py-1 select-none animate-fade-in max-w-3xl">
            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider flex items-center gap-1.5 shrink-0 mr-1">
                <Filter size={10} />
                <span>Active Filters:</span>
            </span>

            {/* Collection */}
            {hasCollection && (
                <span 
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary"
                    style={activeCollection.color && activeCollection.color !== 'none' ? {
                        backgroundColor: `${activeCollection.color}15`,
                        borderColor: `${activeCollection.color}30`,
                        color: activeCollection.color
                    } : {}}
                >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeCollection.color || '#6366f1' }} />
                    <span className="truncate max-w-[80px]" title={activeCollection.name}>{activeCollection.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); onClearCollection(); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                        <X size={10} />
                    </button>
                </span>
            )}

            {/* Tags */}
            {hasTags && selectedTags.map(tag => (
                <span 
                    key={tag}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-bg-elevated border border-border text-text-muted hover:text-text-main"
                >
                    <span>#{tag}</span>
                    <button onClick={(e) => { e.stopPropagation(); onRemoveTag(tag); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                        <X size={10} />
                    </button>
                </span>
            ))}

            {/* Search */}
            {hasSearch && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-bg-elevated border border-border/80 text-text-muted">
                    <span className="italic">"{searchQuery}"</span>
                    <button onClick={(e) => { e.stopPropagation(); onClearSearch(); }} className="hover:opacity-100 opacity-60 transition-opacity ml-0.5 cursor-pointer">
                        <X size={10} />
                    </button>
                </span>
            )}

            <button
                onClick={onClearAll}
                className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wider ml-2 shrink-0 cursor-pointer"
            >
                Clear All
            </button>
        </div>
    );
}
