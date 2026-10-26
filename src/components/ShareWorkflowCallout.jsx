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
import { Sparkles, X, Share2 } from 'lucide-react';

export default function ShareWorkflowCallout({ onDismiss, onAction }) {
    return (
        <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-[#222227] text-text-main rounded-2xl p-3.5 shadow-2xl dark:shadow-[0_20px_40px_rgba(0,0,0,0.85)] border border-zinc-200 dark:border-zinc-700/80 dark:ring-1 dark:ring-white/10 animate-in fade-in slide-in-from-top-1 duration-150 text-left select-none pointer-events-auto"
        >
            {/* Seamless Pointer Arrow pointing straight up to the 3-dots button */}
            <div className="absolute -top-2 right-[9px] w-4 h-2 overflow-hidden pointer-events-none">
                <div className="w-2.5 h-2.5 bg-white dark:bg-[#222227] border-t border-l border-zinc-200 dark:border-zinc-700/80 rotate-45 mx-auto mt-1" />
            </div>

            {/* Header: Badge & Close Button */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                    <Sparkles size={11} className="text-indigo-500 fill-indigo-500" />
                    NEW
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onDismiss) onDismiss();
                    }}
                    className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Title */}
            <h4 className="text-[13px] font-bold text-text-main leading-snug mb-1">
                Share Workflows Privately
            </h4>

            {/* Description */}
            <p className="text-xs text-text-muted leading-relaxed">
                Privately share your complete workflow — including linked snippets and knowledge tiles — directly with friends or colleagues via an instant web link.
            </p>

            {/* Action CTA Button */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (onAction) onAction();
                }}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-colors cursor-pointer"
            >
                <Share2 size={13} />
                <span>Share Workflow</span>
            </button>
        </div>
    );
}
