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
export const scanWorkflowDependencies = (prompt, allSnippets, allKnowledgeTiles) => {
    const foundSnippets = new Map();
    const foundKBTiles = new Map();

    const nameRegex = /(?<![a-zA-Z0-9_.+\-])(?:@([a-zA-Z0-9_-]+)|@\{([^}]+)\})/g;
    const idRegex = /@#([a-zA-Z0-9_.-]+)/g;
    const kbTitleRegex = /\[\[(.*?)\]\]/g;
    const kbIdRegex = /\[\[kb:([a-zA-Z0-9_.-]+)\]\]/g;

    // Helper to find snippet by name
    const getSnippetByName = (name) => allSnippets.find(s => s.name === name);
    const getSnippetById = (id) => allSnippets.find(s => s.id === id);
    const getKbByTitle = (title) => allKnowledgeTiles.find(t => t.title === title);
    const getKbById = (id) => allKnowledgeTiles.find(t => t.id === id);

    const scanText = (text) => {
        if (!text) return;

        // Scan for Snippet Names
        let match;
        nameRegex.lastIndex = 0;
        while ((match = nameRegex.exec(text)) !== null) {
            const name = match[1] || match[2];
            const snip = getSnippetByName(name);
            if (snip && !foundSnippets.has(snip.id)) {
                foundSnippets.set(snip.id, snip);
                scanSnippet(snip); // Recursive
            }
        }

        // Scan for Snippet IDs (in notes)
        idRegex.lastIndex = 0;
        while ((match = idRegex.exec(text)) !== null) {
            const id = match[1];
            const snip = getSnippetById(id);
            if (snip && !foundSnippets.has(snip.id)) {
                foundSnippets.set(snip.id, snip);
                scanSnippet(snip); // Recursive
            }
        }

        // Scan for KB Titles
        kbTitleRegex.lastIndex = 0;
        while ((match = kbTitleRegex.exec(text)) !== null) {
            const title = match[1].trim();
            if (!title.startsWith('kb:') && !title.startsWith('prompt:')) {
                const kb = getKbByTitle(title);
                if (kb && !foundKBTiles.has(kb.id)) {
                    foundKBTiles.set(kb.id, kb);
                }
            }
        }

        // Scan for KB IDs (in notes)
        kbIdRegex.lastIndex = 0;
        while ((match = kbIdRegex.exec(text)) !== null) {
            const id = match[1].trim();
            const kb = getKbById(id);
            if (kb && !foundKBTiles.has(kb.id)) {
                foundKBTiles.set(kb.id, kb);
            }
        }
    };

    const scanSnippet = (snip) => {
        scanText(snip.content);
        scanText(snip.notes);
    };

    // 1. Scan the prompt content
    scanText(prompt.content);

    // 2. Scan all chain steps (content and notes)
    if (prompt.chain) {
        prompt.chain.forEach(step => {
            scanText(step.content);
            scanText(step.notes);
        });
    }

    return {
        snippets: Array.from(foundSnippets.values()),
        knowledgeBase: Array.from(foundKBTiles.values())
    };
};
