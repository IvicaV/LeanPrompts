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
import { FileText, BookOpen, Code } from 'lucide-react';

/**
 * NoteRenderer - Renders note text with clickable internal links
 * Parses: [[Prompt: Title]], [[KB: Title]], @snippet-name
 */
export default function NoteRenderer({ text, onNavigate, prompts = [], snippets = [], knowledgeTiles = [] }) {
    if (!text) return null;

    // Parse and render text with clickable links
    const renderContent = () => {
        const parts = [];
        let lastIndex = 0;

        // Combined regex for all link types
        // [[Prompt: Title]] or [[KB: Title]] or @snippet-name
        const linkRegex = /\[\[(Prompt|KB):\s*([^\]]+)\]\]|@(\S+)/g;

        let match;
        while ((match = linkRegex.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                parts.push(
                    <span key={`text-${lastIndex}`}>
                        {text.slice(lastIndex, match.index)}
                    </span>
                );
            }

            if (match[1] && match[2]) {
                // [[Prompt: Title]] or [[KB: Title]]
                const type = match[1].toLowerCase();
                const title = match[2].trim();

                // Find matching item
                const item = type === 'prompt'
                    ? prompts.find(p => p.title === title)
                    : knowledgeTiles.find(t => t.title === title);

                parts.push(
                    <button
                        key={`link-${match.index}`}
                        onClick={() => item && onNavigate({ type, id: item.id })}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-all ${item
                                ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
                                : 'bg-red-500/10 text-red-400 cursor-not-allowed'
                            }`}
                        title={item ? `Go to ${title}` : `${title} not found`}
                        disabled={!item}
                    >
                        {type === 'prompt' ? <FileText size={10} /> : <BookOpen size={10} />}
                        {title}
                    </button>
                );
            } else if (match[3]) {
                // @snippet-name
                const snippetName = match[3];
                const snippet = snippets.find(s => s.name === snippetName);

                parts.push(
                    <button
                        key={`snippet-${match.index}`}
                        onClick={() => snippet && onNavigate({ type: 'snippet', id: snippet.id })}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-all ${snippet
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer'
                                : 'bg-red-500/10 text-red-400 cursor-not-allowed'
                            }`}
                        title={snippet ? `Go to @${snippetName}` : `@${snippetName} not found`}
                        disabled={!snippet}
                    >
                        <Code size={10} />
                        @{snippetName}
                    </button>
                );
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(
                <span key={`text-end`}>
                    {text.slice(lastIndex)}
                </span>
            );
        }

        return parts;
    };

    return (
        <div className="whitespace-pre-wrap text-sm text-text-main leading-relaxed">
            {renderContent()}
        </div>
    );
}
