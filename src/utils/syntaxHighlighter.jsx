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
import { formatLeanText } from './leanFormat';

/**
 * Lightweight syntax highlighter using regex for VS Code-like colors.
 * Integrates with formatLeanText to preserve Variables and Snippets.
 */
export const highlightSyntax = (text, lang, onNavigateToPrompt) => {
    if (!text || !lang) return formatLeanText(text, onNavigateToPrompt);

    const l = lang.toLowerCase();
    let tokens = [];

    // Basic regex-based highlighting rules per language
    if (l === 'javascript' || l === 'js' || l === 'json') {
        // Strings, Keywords, Numbers, Comments
        tokens = [
            { regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, className: 'text-emerald-600 dark:text-emerald-400' }, // Strings
            { regex: /\b(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|await|implements|package|protected|static|interface|private|public|true|false|null)\b/g, className: 'text-blue-600 dark:text-blue-400' }, // Keywords
            { regex: /\b(?:\d+)\b/g, className: 'text-orange-600 dark:text-orange-400' }, // Numbers
            { regex: /(?:\/\/.*|\/\*[\s\S]*?\*\/)/g, className: 'text-zinc-500 dark:text-zinc-400 italic' } // Comments
        ];
    } else if (l === 'python' || l === 'py') {
        tokens = [
            { regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, className: 'text-emerald-600 dark:text-emerald-400' },
            { regex: /\b(?:and|as|assert|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|None|True|False)\b/g, className: 'text-blue-600 dark:text-blue-400' },
            { regex: /\b(?:\d+)\b/g, className: 'text-orange-600 dark:text-orange-400' },
            { regex: /(?:#.*)/g, className: 'text-zinc-500 dark:text-zinc-400 italic' }
        ];
    } else if (l === 'css') {
        tokens = [
            { regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, className: 'text-emerald-600 dark:text-emerald-400' },
            { regex: /(?:[.#][\w-]+)/g, className: 'text-purple-600 dark:text-yellow-400' }, // Selectors
            { regex: /\b(?:[\w-]+)(?=\s*:)/g, className: 'text-blue-600 dark:text-blue-400' }, // Properties
            { regex: /(?::\s*[^;]+;)/g, className: 'text-orange-600 dark:text-orange-400' }, // Values (simplified)
            { regex: /(?:\/\*[\s\S]*?\*\/)/g, className: 'text-zinc-500 dark:text-zinc-400 italic' }
        ];
    } else if (l === 'html' || l === 'xml') {
        tokens = [
            { regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, className: 'text-emerald-600 dark:text-emerald-400' },
            { regex: /(?:<[^>!/]+)/g, className: 'text-blue-600 dark:text-blue-400 font-bold' }, // Open tags
            { regex: /(?:<\/[^>]+>)/g, className: 'text-blue-600 dark:text-blue-400 font-bold' }, // Close tags
            { regex: /\b(?:[\w-]+)=/g, className: 'text-sky-600 dark:text-sky-400' }, // Attributes
            { regex: /(?:<!--[\s\S]*?-->)/g, className: 'text-zinc-500 dark:text-zinc-400 italic' }
        ];
    } else if (l === 'shell' || l === 'bash' || l === 'sh') {
        tokens = [
            { regex: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, className: 'text-emerald-600 dark:text-emerald-400' },
            { regex: /\b(?:sudo|cd|ls|mkdir|rm|cp|mv|git|config|npm|node|yarn|pip|python|grep|awk|sed|echo|cat|chmod|chown)\b/g, className: 'text-purple-600 dark:text-yellow-400 font-bold' }, // Commands
            { regex: /(?:\s-[\w-]+|--[\w-]+)/g, className: 'text-zinc-600 dark:text-zinc-400' }, // Flags
            { regex: /(?:#.*)/g, className: 'text-zinc-500 dark:text-zinc-400 italic' }
        ];
    }

    if (tokens.length === 0) return formatLeanText(text, onNavigateToPrompt);

    // One-pass replacement using a combined regex to avoid nested HTML issues
    const combinedRegex = new RegExp(tokens.map(t => `(${t.regex.source})`).join('|') + '|(\\{\\{.*?\\}\\}|@\\{.*?\\}|@[\\w.-]+|<[^>]+>|\\[.*?\\]\\(.*?\\))', 'g');

    const parts = text.split(combinedRegex).filter(Boolean);
    const result = [];

    let currentPos = 0;
    while (currentPos < parts.length) {
        const part = parts[currentPos];
        let matched = false;

        // Check if part matches any token
        for (let i = 0; i < tokens.length; i++) {
            if (new RegExp('^' + tokens[i].regex.source + '$').test(part)) {
                result.push(<span key={currentPos} className={tokens[i].className}>{part}</span>);
                matched = true;
                break;
            }
        }

        if (!matched) {
            // Check if it's a LeanPrompt token (Variables, Snippets)
            const formatted = formatLeanText(part, onNavigateToPrompt);
            if (Array.isArray(formatted)) {
                result.push(...formatted.map((f, fi) => React.isValidElement(f) ? React.cloneElement(f, { key: `${currentPos}-${fi}` }) : f));
            } else {
                result.push(formatted);
            }
        }
        currentPos++;
    }

    return result;
};
