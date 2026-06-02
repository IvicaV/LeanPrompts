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
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, X, AlertCircle } from 'lucide-react';

/**
 * REFACTORING BAR COMPONENT
 * Erscheint am oberen Rand des Workspace, wenn der Scanner alternative 
 * Platzhalter-Syntax (wie [[ ]] oder [ ]) gefunden hat.
 */
export default function RefactoringBar({ matches, onApply, onIgnore }) {
  if (!matches || matches.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="bg-primary/5 border-b border-primary/20 overflow-hidden shrink-0"
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
        
        {/* INFO AREA */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary shrink-0">
            <Wand2 size={14} />
          </div>
          <div className="text-xs text-text-main font-medium truncate">
            Alternative syntax detected: 
            <span className="ml-2 text-text-muted font-mono bg-bg-elevated/50 px-1.5 py-0.5 rounded border border-border/50 text-[10px]">
              {matches.slice(0, 3).join(', ')}
              {matches.length > 3 && ` +${matches.length - 3} more`}
            </span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApply}
            className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-[11px] font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center gap-2"
          >
            Standardize to {'{{ }}'}
          </button>
          
          <div className="w-px h-4 bg-primary/20 mx-1"></div>
          
          <button
            onClick={onIgnore}
            className="p-1.5 text-text-muted hover:text-text-main hover:bg-bg-elevated rounded-md transition-all"
            title="Ignore suggestions"
          >
            <X size={14} />
          </button>
        </div>

      </div>
    </motion.div>
  );
}