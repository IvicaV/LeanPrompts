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
import React from 'react';
import { Trash2, Folder, Tag, X } from 'lucide-react';

export default function BulkActionBar({
    selectedCount,
    onClearSelection,
    onDelete,
    onAddTags,
    onAddToCollection
}) {
    if (selectedCount === 0) return null;

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border p-2 z-20 animate-slide-up shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-center gap-6 max-w-4xl mx-auto px-4 w-full">
                {/* Left: Info & Clear */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Selected</span>
                        <span className="text-sm font-bold text-text-main leading-none">{selectedCount} items</span>
                    </div>
                    <button
                        onClick={onClearSelection}
                        className="p-1.5 rounded-full hover:bg-bg-elevated text-text-muted hover:text-text-main transition-colors"
                        title="Clear Selection"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onAddTags}
                        className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-bg-elevated group min-w-[3rem] transition-all"
                        title="Add Tags"
                    >
                        <Tag size={18} className="text-text-muted group-hover:text-primary mb-0.5 transition-colors" />
                        <span className="text-[9px] font-medium text-text-muted group-hover:text-primary transition-colors">Tags</span>
                    </button>

                    <button
                        onClick={onAddToCollection}
                        className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-bg-elevated group min-w-[3rem] transition-all"
                        title="Move to Collection"
                    >
                        <Folder size={18} className="text-text-muted group-hover:text-primary mb-0.5 transition-colors" />
                        <span className="text-[9px] font-medium text-text-muted group-hover:text-primary transition-colors">Move</span>
                    </button>

                    <div className="w-px h-8 bg-border mx-1"></div>

                    <button
                        onClick={onDelete}
                        className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-red-500/10 group min-w-[3rem] transition-all"
                        title="Delete Selected"
                    >
                        <Trash2 size={18} className="text-text-muted group-hover:text-red-500 mb-0.5 transition-colors" />
                        <span className="text-[9px] font-medium text-text-muted group-hover:text-red-500 transition-colors">Delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
