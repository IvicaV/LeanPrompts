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
import { X, RefreshCw, FilePlus2, AlertTriangle, FileDiff } from 'lucide-react';
import useBodyLock from '../hooks/useBodyLock';

export default function UpdateConflictModal({
    isOpen,
    onClose,
    onSelectAction, // Will receive 'update' or 'duplicate'
    existingPromptTitle,
    isExactContent
}) {
    useBodyLock();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-bg-surface border border-border shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-fade-in-up dm-modal">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-border/50 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-text-main">
                        <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg">
                            <AlertTriangle size={20} />
                        </div>
                        <h2 className="text-xl font-bold">Workflow Conflict</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-text-muted hover:text-text-main hover:bg-bg-elevated rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="p-4 bg-bg dark:bg-black/20 rounded-xl border border-border dark:border-white/5">
                        <p className="text-sm text-text-main leading-relaxed">
                            A Workflow named <span className="font-bold text-primary">"{existingPromptTitle}"</span> already exists in your library.
                        </p>
                        {isExactContent ? (
                            <p className="mt-2 text-sm text-yellow-500 font-medium bg-yellow-500/10 p-2 rounded border border-yellow-500/20">
                                The imported file appears to be an <b>EXACT COPY</b> of your existing Workflow.
                            </p>
                        ) : (
                            <p className="mt-2 text-sm text-indigo-400 font-medium bg-indigo-500/10 p-2 rounded border border-indigo-500/20">
                                The content differs. This seems to be an <b>UPDATED VERSION</b>.
                            </p>
                        )}
                    </div>
                    <p className="text-sm text-text-muted">How would you like to handle this import?</p>
                </div>

                {/* Actions - Vertically Stacked Cards */}
                <div className="p-4 pt-0 space-y-3">
                    {/* Update Card */}
                    <button
                        onClick={() => onSelectAction('update')}
                        className="w-full text-left p-4 rounded-xl border border-border/50 dark:border-white/5 bg-bg dark:bg-white/[0.02] hover:bg-bg-elevated dark:hover:bg-white/[0.04] hover:border-primary/50 dark:hover:border-primary/40 transition-all group flex gap-4 items-start focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                        <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <div className="font-bold text-sm text-text-main group-hover:text-primary transition-colors">
                                Update Existing Workflow
                            </div>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed pr-2">
                                Overwrites the existing content with this new version.
                                <span className="text-green-500/80 ml-1 block mt-1">
                                    ✓ A flawless Auto-Snapshot of the old version will be saved first (Rollback available).
                                </span>
                            </p>
                        </div>
                    </button>

                    {/* Duplicate Card */}
                    <button
                        onClick={() => onSelectAction('duplicate')}
                        className="w-full text-left p-4 rounded-xl border border-border/50 dark:border-white/5 bg-bg dark:bg-white/[0.02] hover:bg-bg-elevated dark:hover:bg-white/[0.04] hover:border-text-main/30 dark:hover:border-white/10 transition-all group flex gap-4 items-start focus:outline-none focus:ring-2 focus:ring-text-muted"
                    >
                        <div className="p-2 bg-text-muted/10 text-text-muted rounded-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                            <FilePlus2 size={20} />
                        </div>
                        <div>
                            <div className="font-bold text-sm text-text-main">
                                Create as Duplicate
                            </div>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed pr-2">
                                Adds this file as a completely separate Workflow to your library. It might be renamed to avoid conflicts.
                            </p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
