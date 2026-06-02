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
import { Sparkles, X, Check, ArrowRight } from 'lucide-react';

export default function SuggestionBar({ suggestions, onApply, onIgnore }) {
    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-primary-subtle dark:bg-primary/10 border-b border-primary/20 dark:border-primary/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-inner"
            >
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-primary dark:text-primary mr-2 shrink-0">
                        <Sparkles size={16} className="animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wider">Suggestions</span>
                    </div>

                    <div className="flex flex-wrap gap-2 min-w-0 flex-1">
                        {suggestions.map((s, i) => {
                            const newFormat = s.text ? `{{${s.text.replace(/^\[+|\]+$/g, '').replace(/^\{+|\}+$/g, '')}}}` : '';
                            
                            return (
                                <motion.div
                                    key={`${s.text}-${i}`}
                                    layout
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    // Pille darf maximal 280px breit werden, shrink-0 verhindert zusammenquetschen in der Flexbox
                                    className="flex items-center gap-1.5 bg-bg-surface dark:bg-zinc-800 border border-primary/20 dark:border-primary/30 rounded-full pl-3 pr-1 py-1 text-xs text-primary dark:text-primary shadow-sm max-w-[280px]"
                                >
                                    {/* Alter Text: Abgeschnitten auf max 90px */}
                                    <code className="truncate max-w-[90px]" title={s.text}>
                                        {s.text}
                                    </code>
                                    
                                    <ArrowRight size={10} className="text-primary/40 shrink-0" />
                                    
                                    {/* Neuer Text: Abgeschnitten auf max 90px */}
                                    <code 
                                        className="font-bold text-primary dark:text-primary truncate max-w-[90px]"
                                        title={newFormat}
                                    >
                                        {newFormat}
                                    </code>
                                    
                                    <div className="w-px h-3 bg-primary/20 dark:bg-primary/20 mx-1 shrink-0"></div>
                                    
                                    <button
                                        onClick={() => onIgnore(s.text)}
                                        className="p-0.5 hover:bg-primary/10 dark:hover:bg-primary/10 rounded-full text-primary/40 hover:text-primary transition-colors shrink-0"
                                        title="Ignore this suggestion"
                                    >
                                        <X size={12} />
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 ml-auto shrink-0">
                    {/* DYNAMISCHER BUTTON + TOOLTIP (Aus deiner vorherigen Idee) */}
                    <button
                        onClick={() => onApply()}
                        title="Converts the remaining placeholders into standard {{ }} variables"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-md text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary-hover transition-all"
                    >
                        <Check size={14} /> 
                        {suggestions.length > 1 ? `Update ${suggestions.length} Variables` : 'Update Variable'}
                    </button>
                    <div className="w-px h-6 bg-primary/20 dark:bg-primary/20 mx-1"></div>
                    <button
                        onClick={() => onIgnore(null)}
                        className="p-1.5 hover:bg-primary/10 dark:hover:bg-primary/10 rounded-md text-primary/40 hover:text-primary transition-colors"
                        title="Dismiss all suggestions"
                    >
                        <X size={16} />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
