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

/**
 * Shared utility to highlight Variables, Snippets, XML Tags and Links in text.
 * @param {string} text - The raw text to format.
 * @param {function} onNavigateToPrompt - Callback for clicking prompt links.
 * @returns {Array} - Array of React elements or strings.
 */
export const formatLeanText = (text, onNavigateToPrompt) => {
    if (typeof text !== 'string') return text;

    // Regex for: `InlineCode`, {{Variables}}, @Snippets, <XMLTags>, [Links](url)
    const parts = text.split(/(`[^`\n]+`|\{\{.*?\}\}|(?<![a-zA-Z0-9_.+\-])@(?:\{.*?\}|[\w.-]+)|<[^>]+>|\[.*?\]\(.*?\))/g);

    return parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
            return (
                <code key={i} className="bg-bg-elevated border border-border px-1.5 py-0.5 rounded text-text-main font-mono text-[0.9em]">
                    {part.slice(1, -1)}
                </code>
            );
        }
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return <span key={i} className="cm-variable text-primary font-mono">{part}</span>;
        }
        if (part.startsWith('@')) {
            return <span key={i} className="cm-snippet text-amber-600 dark:text-amber-400 font-mono">{part}</span>;
        }
        // XML Tags: <tag>, </tag>, <tag />
        if (part.startsWith('<') && part.endsWith('>')) {
            return (
                <span key={i} className="text-emerald-600 dark:text-emerald-400 font-bold opacity-90 italic font-mono">
                    {part}
                </span>
            );
        }
        // Links: [Text](url)
        if (part.startsWith('[') && part.includes('](')) {
            const match = /\[(.*?)\]\((.*?)\)/.exec(part);
            if (match) {
                const [_, label, href] = match;
                const isPromptLink = href?.startsWith('prompt:');
                const isSnippetLink = href?.startsWith('snippet:');

                if (onNavigateToPrompt && isPromptLink) {
                    return (
                        <a
                            key={i}
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const promptTitle = decodeURIComponent(href.replace('prompt:', ''));
                                onNavigateToPrompt(promptTitle);
                            }}
                            className="text-primary hover:underline font-medium cursor-pointer"
                        >
                            {label}
                        </a>
                    );
                }
                if (isSnippetLink) {
                    return <span key={i} className="text-amber-600 dark:text-amber-400 font-mono font-medium">{label}</span>;
                }
                return <a key={i} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={href}>{label}</a>;
            }
        }
        return part;
    });
};

export const replaceLeanLinksOutsideCode = (text, snippets = []) => {
    if (!text) return "";
    // Split text by inline code OR code blocks to protect them
    const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

    return parts.map(part => {
        // If it's a code block or inline code, return as-is
        if (part.startsWith('`')) {
            return part;
        }

        // Otherwise apply replacements
        let res = part.replace(/\[\[(.*?)\]\]/g, (match, title) => `[${title}](prompt:${encodeURIComponent(title)})`);
        
        // Handle Snippets
        res = res.replace(/(?<![a-zA-Z0-9_.+\-])@(?:\{([^{}]+)\}|([\w.-]+))/g, (match, nameInBrackets, nameSimple) => {
            const cleanName = (nameInBrackets || nameSimple || "").trim();
            const exists = snippets.some(s => s.name === cleanName);
            if (exists) {
                return `[${match}](snippet:${encodeURIComponent(cleanName)})`;
            }
            return match;
        });
        
        return res;
    }).join("");
};
