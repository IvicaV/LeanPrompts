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
import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Code2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { highlightSyntax } from '../../../utils/syntaxHighlighter';

export default function CodeBlock({ inline, className, children, node, onNavigateToPrompt, collectionColor, ...props }) {
    // 1. Sicheres Extrahieren von Sprache und Modifier
    let lang = '';
    let modifier = null;

    if (className && className.startsWith('language-')) {
        let rawLang = className.replace('language-', '').trim();
        const lastChar = rawLang.slice(-1);
        
        // Prüfen, ob das letzte Zeichen ein Modifier ist (- oder +)
        if (lastChar === '-' || lastChar === '+') {
            // Ausnahme: Wenn die Sprache exakt "c++" ist, ist das '+' Teil des Namens!
            if (rawLang.toLowerCase() === 'c++') {
                lang = rawLang;
            } else {
                modifier = lastChar;
                lang = rawLang.slice(0, -1); // Modifier abschneiden
            }
        } else {
            lang = rawLang;
        }
    }

    const [copied, setCopied] = useState(false);

    // 2. Intelligenter Initial-Zustand (inkl. Fallback auf Auto-Heuristik)
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (modifier === '-') return true;  // Explizit eingeklappt
        if (modifier === '+') return false; // Explizit ausgeklappt
        
        // Auto-Heuristik: Ab 15 Zeilen einklappen
        const lineCount = String(children).split('\n').length;
        return lineCount > 15; 
    });

    // In react-markdown v9, 'inline' is no longer passed directly.
    // We determine inline status by the absence of a language class AND the absence of newlines.
    const isInline = !className?.includes('language-') && !String(children).includes('\n');

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getBorderColor = () => {
        if (collectionColor) return ''; // Overridden by inline style
        return 'border-border/50';
    };

    // Unified component for rendering the formatted content with whitespace preservation
    const RenderFormattedContent = ({ isBlock }) => {
        const text = String(children);
        // Split by lines to preserve indentation/structure
        const lines = text.split('\n');

        return (
            <div className={isBlock ? "whitespace-pre-wrap leading-relaxed" : "whitespace-pre"}>
                {lines.map((line, lineIdx) => (
                    <div key={lineIdx} className={isBlock ? "min-h-[1.2em]" : "inline"}>
                        {isBlock ? highlightSyntax(line, lang, onNavigateToPrompt) : line}
                        {lineIdx < lines.length - 1 && !isBlock && '\n'}
                    </div>
                ))}
            </div>
        );
    };

    // --- INLINE CODE RENDERER ---
    if (isInline) {
        return (
            <code className="bg-bg-elevated border border-border px-1.5 py-0.5 rounded text-text-main font-mono text-[0.9em] align-baseline" {...props}>
                {String(children)}
            </code>
        );
    }

    // --- BLOCK CODE RENDERER ---
    const borderStyle = collectionColor ? { borderColor: `${collectionColor}80` } : {};

    return (
        <div 
            className={`my-6 rounded-xl group ${getBorderColor()} border ${collectionColor ? '' : 'dark:border-white/10'} bg-zinc-100 dark:bg-zinc-800 shadow-xl overflow-hidden transition-all duration-300 flex flex-col`}
            style={borderStyle}
        >
            {/* Clickable Header Bar — replaces the old floating absolute buttons */}
            <div 
                className="flex items-center justify-between px-4 py-2.5 bg-black/5 dark:bg-black/20 cursor-pointer select-none hover:bg-black/[0.08] dark:hover:bg-black/40 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Code ausklappen" : "Code einklappen"}
            >
                <div className="flex items-center gap-2 text-text-muted">
                    <Code2 size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {lang || 'Code'}
                    </span>
                    {isCollapsed && (
                        <span className="text-[9px] font-mono opacity-50 ml-1">
                            ({String(children).split('\n').length} lines)
                        </span>
                    )}
                </div>
                
                <div className="flex items-center gap-1.5">
                    {/* COPY BUTTON */}
                    <button
                        onClick={handleCopy}
                        className="p-1.5 flex items-center justify-center text-text-muted hover:text-primary transition-all duration-200 rounded-md hover:bg-white/50 dark:hover:bg-white/10"
                        title={copied ? "Copied!" : "Copy code"}
                    >
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    
                    <div className="w-px h-4 bg-border/50 mx-1"></div>
                    
                    {/* COLLAPSE TOGGLE */}
                    <div className="p-1.5 text-text-muted transition-all duration-200">
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </div>
                </div>
            </div>

            {/* Animated Content Area (Framer Motion) */}
            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                        <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto text-text-main bg-white dark:bg-black/40 shadow-inner">
                            <RenderFormattedContent isBlock={true} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
