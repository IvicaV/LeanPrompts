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
import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { EditorView, Decoration, ViewPlugin, WidgetType, tooltips, keymap } from '@codemirror/view';
import { redo } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { RangeSetBuilder, EditorSelection } from '@codemirror/state';
import { X, Save, Maximize2, Minimize2, Eye, EyeOff, Edit3, Image as ImageIcon, Pin, Tag, Folder, Sparkles, ChevronDown, Plus, Check, Tags, Share2, FileJson, FileText, Download, Terminal, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import TagInput from '../../../components/TagInput';
import { compressImage } from '../../../utils/imageCompression';
import MultiTaggerModal from '../../../components/MultiTaggerModal';
import CodeBlock from './CodeBlock';
import DynamicTagList from '../../../components/DynamicTagList';
import { formatLeanText, replaceLeanLinksOutsideCode, safeUrlTransform } from '../../../utils/leanFormat';
import { stripComments } from '../../../utils/variableParser';
import { styleTags, tags } from '@lezer/highlight';
import { leanBaseTheme, leanSyntaxHighlighting } from '../../../utils/editorTheme';
import useBodyLock from '../../../hooks/useBodyLock';

/**
 * CUSTOM MARKDOWN EXTENSION (Adapted for KnowledgeTileEditor)
 * Defines atomic nodes for Comments to ensure they are highlighted correctly.
 */
const leanLanguageExt = {
    defineNodes: [],
    parseBlock: [],
    parseInline: [],
    props: [
        styleTags({})
    ]
};

const commentDecorationPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.buildDeco(view);
    }
    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDeco(update.view);
        }
    }
    buildDeco(view) {
        const builder = new RangeSetBuilder();
        const doc = view.state.doc;
        const fullText = doc.toString();
        const commentRanges = [];
        const inlineCodeRanges = [];
        
        let i = 0;
        const len = fullText.length;
        let inBlockComment = false;
        let inObsidianComment = false;
        let inHtmlComment = false;
        let inLineComment = false;
        let inInlineCode = false;
        let inFencedBlock = false;
        let startIdxInline = -1;
        let startIdxComment = -1;

        while (i < len) {
            // HIGHEST PRIORITY: Fenced Code Blocks (```)
            if (fullText.slice(i, i + 3) === '```') {
                inFencedBlock = !inFencedBlock;
                i += 3;
                continue;
            }

            // Inside a code block, ignore all other Markdown/Comment formatting
            if (inFencedBlock) {
                i++;
                continue;
            }

            // HIGHEST PRIORITY: Inline Code blocks EVERYTHING else
            if (inInlineCode) {
                if (fullText[i] === '`') {
                    inInlineCode = false;
                    inlineCodeRanges.push({ from: startIdxInline, to: i + 1 });
                } else if (fullText[i] === '\n') {
                    inInlineCode = false;
                    inlineCodeRanges.push({ from: startIdxInline, to: i });
                }
                i++;
                continue;
            }

            if (fullText[i] === '`') {
                inInlineCode = true;
                startIdxInline = i;
                i++;
                continue;
            }

            // LOWER PRIORITY: Comments
            if (inBlockComment) {
                if (fullText.slice(i, i + 2) === '*/') {
                    inBlockComment = false;
                    commentRanges.push({ from: startIdxComment, to: i + 2 });
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (inObsidianComment) {
                if (fullText.slice(i, i + 2) === '%%') {
                    inObsidianComment = false;
                    commentRanges.push({ from: startIdxComment, to: i + 2 });
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (inHtmlComment) {
                if (fullText.slice(i, i + 3) === '-->') {
                    inHtmlComment = false;
                    commentRanges.push({ from: startIdxComment, to: i + 3 });
                    i += 3;
                } else {
                    i++;
                }
                continue;
            }

            if (inLineComment) {
                if (fullText[i] === '\n') {
                    inLineComment = false;
                    commentRanges.push({ from: startIdxComment, to: i });
                    i++;
                } else {
                    i++;
                }
                continue;
            }

            if (fullText.slice(i, i + 2) === '%%') {
                let isStartOfLine = true;
                let j = i - 1;
                while (j >= 0) {
                    if (fullText[j] === '\n') break;
                    if (fullText[j] !== ' ' && fullText[j] !== '\t') {
                        isStartOfLine = false;
                        break;
                    }
                    j--;
                }
                if (isStartOfLine) {
                    inObsidianComment = true;
                    startIdxComment = i;
                    i += 2;
                    continue;
                }
            }

            if (fullText.slice(i, i + 2) === '//') {
                let j = i - 1;
                let spaceCount = 0;
                let isStartOfLine = false;
                while (j >= 0) {
                    if (fullText[j] === '\n') { isStartOfLine = true; break; }
                    else if (fullText[j] === ' ') spaceCount++;
                    else if (fullText[j] === '\t') spaceCount += 2;
                    else break;
                    j--;
                }
                if (j < 0) isStartOfLine = true;

                const charBefore = i > 0 ? fullText[i - 1] : '';
                if ((isStartOfLine || spaceCount >= 2 || charBefore === '\t') && charBefore !== ':') {
                    inLineComment = true;
                    startIdxComment = i;
                    i += 2;
                    continue;
                }
            }

            if (fullText.slice(i, i + 2) === '/*') {
                inBlockComment = true;
                startIdxComment = i;
                i += 2;
                continue;
            }

            if (fullText.slice(i, i + 4) === '<!--') {
                inHtmlComment = true;
                startIdxComment = i;
                i += 4;
                continue;
            }

            i++;
        }

        if (inInlineCode) inlineCodeRanges.push({ from: startIdxInline, to: len });
        if (inBlockComment) commentRanges.push({ from: startIdxComment, to: len });
        if (inObsidianComment) commentRanges.push({ from: startIdxComment, to: len });
        if (inHtmlComment) commentRanges.push({ from: startIdxComment, to: len });
        if (inLineComment) commentRanges.push({ from: startIdxComment, to: len });

        const visibleRanges = view.visibleRanges;
        const matches = [];
        for (const { from: rangeFrom, to: rangeTo } of visibleRanges) {
            for (const cr of commentRanges) {
                if (cr.to >= rangeFrom && cr.from <= rangeTo) {
                    matches.push({
                        from: Math.max(rangeFrom, cr.from),
                        to: Math.min(rangeTo, cr.to),
                        value: Decoration.mark({ class: "cm-lean-comment" })
                    });
                }
            }
            for (const ir of inlineCodeRanges) {
                if (ir.to >= rangeFrom && ir.from <= rangeTo) {
                    matches.push({
                        from: Math.max(rangeFrom, ir.from),
                        to: Math.min(rangeTo, ir.to),
                        value: Decoration.mark({ class: "cm-inline-code" })
                    });
                }
            }
        }
        matches.sort((a, b) => a.from - b.from);
        for (let m of matches) {
            builder.add(m.from, m.to, m.value);
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

const leanCommentTheme = EditorView.theme({
  ".cm-lean-comment": {
    color: "#8b949e !important",
    fontStyle: "italic !important",
    opacity: "0.5 !important"
  },
  ".cm-inline-code": {
    fontFamily: "var(--font-mono, monospace) !important",
    backgroundColor: "rgba(115, 115, 115, 0.15) !important",
    color: "var(--text-main) !important",
    padding: "0.1em 0.3em !important",
    borderRadius: "3px !important",
    fontSize: "0.9em !important"
  }
});

class MarkdownErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Markdown Rendering Error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return this.props.fallback || <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg">Preview Error (Invalid Markdown)</div>;
        }
        return this.props.children;
    }
}


// --- INLINE IMAGE WIDGET ---
class ImageWidget extends WidgetType {
    constructor(url, title, width, separator = '=') {
        super();
        this.url = url;
        this.title = title;     // Text part of alt
        this.width = width;     // Width part if any
        this.separator = separator; // '=' (new) or '|' (legacy)
    }

    toDOM(view) {
        const container = document.createElement("div");
        container.className = "relative inline-block group my-2 select-none";

        const img = document.createElement("img");
        img.src = this.url;
        img.alt = this.title;
        img.loading = "lazy";
        img.decoding = "async";
        img.className = "rounded-lg border border-border block shadow-sm bg-bg-surface transition-all";
        img.style.maxHeight = "500px";
        img.style.maxWidth = "100%";
        if (this.width) {
            img.style.width = this.width;
        }

        // DELETE BUTTON
        const btn = document.createElement("button");
        btn.className = "absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform scale-90 group-hover:scale-100 z-10 flex items-center justify-center backdrop-blur-sm";
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        btn.title = "Remove Image";
        btn.onmousedown = (e) => e.stopPropagation(); // Prevent drag start interference
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const pos = view.posAtDOM(container);
            if (pos === null) return; // ZERO-REGRESSION: Guard against detached DOM nodes

            let altText = this.title || "";
            if (this.width) altText += `${this.separator}${this.width}`;
            const length = 2 + altText.length + 2 + this.url.length + 1;

            view.dispatch({ changes: { from: pos, to: pos + length } });
        };

        // RESIZE HANDLE
        const resizeHandle = document.createElement("div");
        resizeHandle.className = "absolute bottom-1 right-1 w-6 h-6 bg-white/90 dark:bg-zinc-800/90 hover:bg-white text-primary rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10 border border-border flex items-center justify-center transform hover:scale-110";
        resizeHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l6 6"/><path d="M3 3h6"/><path d="M3 3v6"/><path d="M21 21l-6-6"/><path d="M21 21h-6"/><path d="M21 21v-6"/></svg>';

        let startX = 0;
        let startWidth = 0;

        resizeHandle.onmousedown = (e) => {
            e.preventDefault(); e.stopPropagation();
            startX = e.clientX;
            startWidth = img.offsetWidth;

            const onMouseMove = (moveEvent) => {
                const currentWidth = startWidth + (moveEvent.clientX - startX);
                img.style.width = `${Math.max(50, currentWidth)}px`; // Min width 50px
            };

            const onMouseUp = (upEvent) => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);

                // Commit Change
                const newWidth = `${Math.round(img.offsetWidth)}px`;
                const pos = view.posAtDOM(container);
                if (pos === null) return; // ZERO-REGRESSION: Guard against detached DOM nodes

                // Construct new Markdown
                let oldAlt = this.title || "";
                if (this.width) oldAlt += `${this.separator}${this.width}`;
                const oldLength = 2 + oldAlt.length + 2 + this.url.length + 1;

                // Always write the new, table-safe '=' syntax
                const newMarkdown = `![${this.title}=${newWidth}](${this.url})`;

                view.dispatch({
                    changes: { from: pos, to: pos + oldLength, insert: newMarkdown }
                });
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        };

        container.appendChild(img);
        container.appendChild(btn);
        container.appendChild(resizeHandle);
        return container;
    }

    eq(other) {
        return this.url === other.url && this.title === other.title && this.width === other.width && this.separator === other.separator;
    }

    ignoreEvent() {
        return false;
    }
}

const inlineImagePlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.buildDeco(view);
    }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDeco(update.view);
        }
    }

    buildDeco(view) {
        const builder = new RangeSetBuilder();
        const doc = view.state.doc;
        // Regex for Base64 Markdown Images: ![alt](data:image/...)
        const regex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;

        // =========================================================================
        // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
        // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
        // This restricts inline image decoration building to strictly the visible UI viewport.
        // Iterating the full document on every keystroke causes severe typing latency.
        // =========================================================================
        const visibleRanges = view.visibleRanges;
        let lastPos = 0; // ZERO-REGRESSION: Prevents overlapping ranges when visibleRanges share the same line

        for (const { from, to } of visibleRanges) {
            // FIX: Round range boundaries to complete lines safely
            const startLine = doc.lineAt(from);
            const endLine = doc.lineAt(to);

            // Skip if this range has already been fully covered (prevents double-scan)
            const scanStart = Math.max(startLine.from, lastPos);
            if (scanStart >= endLine.to) continue;

            const text = doc.sliceString(scanStart, endLine.to);
            let match;

            while ((match = regex.exec(text))) {
                const start = scanStart + match.index; // Offset adjusted!
                const end = start + match[0].length;
                const rawAlt = match[1];
                const url = match[2];

                let title = rawAlt;
                let width = null;
                let separator = '=';

                // Check '=' first (new table-safe syntax), then '|' (legacy)
                if (rawAlt.includes('=')) {
                    const parts = rawAlt.split('=');
                    const lastPart = parts[parts.length - 1];
                    if (/^\d+(px|%)?$/.test(lastPart.trim())) {
                        width = lastPart.trim();
                        title = parts.slice(0, -1).join('=');
                        separator = '=';
                    }
                } else if (rawAlt.includes('|')) {
                    const parts = rawAlt.split('|');
                    const lastPart = parts[parts.length - 1];
                    if (/^\d+(px|%)?$/.test(lastPart.trim())) {
                        width = lastPart.trim();
                        title = parts.slice(0, -1).join('|');
                        separator = '|';
                    }
                }

                builder.add(start, end, Decoration.replace({
                    widget: new ImageWidget(url, title, width, separator),
                    inclusive: false
                }));
            }
            lastPos = endLine.to;
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

const imageAtomicRanges = EditorView.atomicRanges.of((view) => {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const regex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;

    // =========================================================================
    // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
    // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
    // Atomic ranges are queried very frequently to manage cursor steps.
    // Iterating the full document text for base64 images here locks the UI thread.
    // =========================================================================
    const visibleRanges = view.visibleRanges;
    let lastPos = 0; // ZERO-REGRESSION: Prevents overlapping ranges when visibleRanges share the same line

    for (const { from, to } of visibleRanges) {
        // Apply Viewport-Slicing correction for atomic deletion as well
        const startLine = doc.lineAt(from);
        const endLine = doc.lineAt(to);

        const scanStart = Math.max(startLine.from, lastPos);
        if (scanStart >= endLine.to) continue;

        const text = doc.sliceString(scanStart, endLine.to);
        
        let match;
        while ((match = regex.exec(text))) {
            const start = scanStart + match.index; // Offset adjusted!
            const end = start + match[0].length;
            builder.add(start, end);
        }
        lastPos = endLine.to;
    }
    return builder.finish();
});

export default function KnowledgeTileEditor({
    isOpen,
    onClose,
    onSave,
    prompts = [],
    snippets = [],
    tile,
    isNew = false,
    tags: availableTags = [],
    collections = [],
    onCreateCollection,
    onNavigateToPrompt,
    onNavigateToSnippet,
    onNotification,
    isDarkMode
}) {
    // Early return MOVED below hooks to avoid Error #310
    useBodyLock();

    const [title, setTitle] = useState(tile?.title || "");
    const [content, setContent] = useState(tile?.content || "");
    const [localTags, setLocalTags] = useState(tile?.tags || []);
    // FIX: Singular collectionId
    const [localCollectionId, setLocalCollectionId] = useState(tile?.collectionId || tile?.collectionIds?.[0] || null);
    const [isPinned, setIsPinned] = useState(tile?.isPinned || false);
    const [isMultiTaggerOpen, setIsMultiTaggerOpen] = useState(false);

    // Editor State
    const [isPreview, setIsPreview] = useState(tile?.content ? true : false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const titleInputRef = useRef(null); // Ref for title focus

    // Export State
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExportingImg, setIsExportingImg] = useState(false);
    const exportRef = useRef(null);

    // Focus title on mount if it's a new note (empty title)
    useEffect(() => {
        if (!tile.title) {
            // Small timeout to ensure render
            setTimeout(() => titleInputRef.current?.focus({ preventScroll: true }), 50);
        }
    }, []);

    // Collection Menu State
    const [showCollectionMenu, setShowCollectionMenu] = useState(false);
    const [collectionPopupPos, setCollectionPopupPos] = useState({ top: 0, left: 0 });
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");

    // Initial State Ref for Dirty Check
    const initialTileState = useMemo(() => ({
        title: tile?.title || "",
        content: tile?.content || "",
        tags: tile?.tags || [],
        collectionId: tile?.collectionId || tile?.collectionIds?.[0] || null, // FIX
        isPinned: tile?.isPinned || false
    }), [tile]);

    const checkDirty = () => {
        if (title !== initialTileState.title) return true;
        if (content !== initialTileState.content) return true;
        if (isPinned !== initialTileState.isPinned) return true;
        if (JSON.stringify(localTags) !== JSON.stringify(initialTileState.tags)) return true;
        if (localCollectionId !== initialTileState.collectionId) return true; // FIX
        return false;
    };

    const handleSave = () => {
        onSave({
            ...tile,
            title,
            content,
            tags: localTags,
            collectionId: localCollectionId, // FIX
            isPinned
        });
        onClose();
    };

    const handleCloseAttempt = () => {
        if (checkDirty()) {
            setShowUnsavedModal(true);
        } else {
            onClose();
        }
    };

    const handleSaveAndClose = () => {
        handleSave();
    };

    const handleDiscardAndClose = () => {
        onClose();
    };

    // --- EXPORT LOGIC ---
    const handleDownloadMarkdown = () => {
        const docContent = tile?.content || content || "";
        const blob = new Blob([docContent], { type: "text/markdown" });
        const safeTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
        download(blob, `leanprompts-note-${safeTitle}.md`);
        setShowExportMenu(false);
        if (onNotification) onNotification("Markdown Format exported successfully.", "success");
    };

    const handleDownloadJson = () => {
        const exportData = {
            meta: {
                version: 2,
                type: 'knowledge_tile_export',
                exportedAt: new Date().toISOString(),
                app: "LeanPrompts"
            },
            knowledgeBase: [{
                ...tile,
                title,
                content,
                tags: localTags,
                collectionId: localCollectionId,
                isPinned
            }]
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const safeTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
        download(blob, `leanprompts-note-${safeTitle}.json`);
        setShowExportMenu(false);
        if (onNotification) onNotification("JSON Format exported successfully.", "success");
    };

    const handleDownloadImage = async () => {
        if (!exportRef.current) return;
        setIsExportingImg(true);
        setShowExportMenu(false);
        try {
            const renderPromise = toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("CANVAS_TIMEOUT")), 15000));
            const dataUrl = await Promise.race([renderPromise, timeoutPromise]);
            
            const safeTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
            download(dataUrl, `leanprompts-note-${safeTitle}.png`);
            if (onNotification) onNotification("Image exported successfully.", "success");
        } catch (err) {
            console.error('Image export failed', err);
            if (onNotification) {
                onNotification(err.message === "CANVAS_TIMEOUT" ? "Note too long for image render. Please use Markdown or JSON export." : "Image export failed. Please try again.", "error");
            } else {
                alert(err.message === "CANVAS_TIMEOUT" ? "Note too long for image render. Please use Markdown or JSON export." : "Image export failed. Please try again.");
            }
        } finally {
            setIsExportingImg(false);
        }
    };

    // --- AUTOCOMPLETION LOGIC ---
    const promptLinkCompletions = (context) => {
        // Trigger on '#'
        let word = context.matchBefore(/#\w*/);
        if (!word) return null;
        if (word.from === word.to && !context.explicit) return null;

        const query = word.text.substring(1).toLowerCase();

        let options = [];
        if (query) {
            const scoredPrompts = prompts
                .map(p => {
                    const titleLower = (p.title || '').toLowerCase();
                    let score = 0;

                    if (titleLower === query) {
                        score = 100;
                    } else if (titleLower.startsWith(query)) {
                        score = 80;
                    } else if (titleLower.includes(query)) {
                        score = 50;
                    } else if (p.content && p.content.toLowerCase().includes(query)) {
                        score = 10;
                    }

                    return { prompt: p, score };
                })
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score);

            options = scoredPrompts.map(item => ({
                label: `#${item.prompt.title}`,
                displayLabel: item.prompt.title,
                detail: "Link Prompt",
                apply: `[[${item.prompt.title}]]`,
                type: 'reference',
                boost: item.score
            }));
        } else {
            options = prompts.map(p => ({
                label: `#${p.title}`,
                displayLabel: p.title,
                detail: "Link Prompt",
                apply: `[[${p.title}]]`,
                type: 'reference'
            }));
        }

        return {
            from: word.from,
            filter: false,
            options
        };
    };

    const snippetLinkCompletions = (context) => {
        // Trigger on '@'
        let word = context.matchBefore(/@\w*/);
        if (!word) return null;
        if (word.from === word.to && !context.explicit) return null;

        const query = word.text.substring(1).toLowerCase();

        let options = [];
        if (query) {
            const scoredSnippets = snippets
                .map(s => {
                    const nameLower = (s.name || '').toLowerCase();
                    let score = 0;

                    if (nameLower === query) {
                        score = 100;
                    } else if (nameLower.startsWith(query)) {
                        score = 80;
                    } else if (nameLower.includes(query)) {
                        score = 50;
                    } else if (s.content && s.content.toLowerCase().includes(query)) {
                        score = 10;
                    }

                    return { snippet: s, score };
                })
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score);

            options = scoredSnippets.map(item => ({
                label: `@${item.snippet.name}`,
                displayLabel: item.snippet.name,
                detail: "Link Snippet",
                apply: `@${item.snippet.name}`,
                type: 'variable',
                boost: item.score
            }));
        } else {
            options = snippets.map(s => ({
                label: `@${s.name}`,
                displayLabel: s.name,
                detail: "Link Snippet",
                apply: `@${s.name}`,
                type: 'variable'
            }));
        }

        return {
            from: word.from,
            filter: false,
            options
        };
    };

    // --- IMAGE HANDLING ---
    const insertImageAtCursor = (base64, title = "Image") => {
        setContent(prev => prev + `\n![${title}](${base64})\n`);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Compress image to max 1200px, 80% quality WebP to prevent CodeMirror state bloat
            const base64 = await compressImage(file, 1200, 0.8);
            insertImageAtCursor(base64, file.name);
        } catch (err) {
            if (onNotification) onNotification("Failed to process image.", "error");
        }

        // Reset input so the same file can be re-selected
        if (e.target) e.target.value = '';
    };

    const interactionHandler = useMemo(() => EditorView.domEventHandlers({
        // 1. Paste-Handler (Strg+V)
        paste: (event, view) => {
            // GUARD 1: Proaktiver Schutz vor massiven Text-Dumps
            const pastedText = event.clipboardData?.getData('text/plain');
            const MAX_KB_LENGTH = 100000;

            if (pastedText && pastedText.length > MAX_KB_LENGTH) {
                event.preventDefault();
                if (onNotification) onNotification(`Paste blocked: Text is too large (${Math.round(pastedText.length / 1024)} KB). Max allowed is 100 KB.`, "error");
                return true;
            }

            // GUARD 2: Bild-Kompression & Blockierung anderer Dateien
            const items = event.clipboardData?.items;
            if (!items) return false;

            let hasFiles = false;
            for (const item of items) {
                if (item.kind === 'file') {
                    hasFiles = true;
                    if (item.type.indexOf('image') !== -1) {
                        event.preventDefault();
                        const file = item.getAsFile();
                        
                        compressImage(file, 1200, 0.8).then(base64 => {
                            const textToInsert = `![Pasted Image](${base64})`;
                            const { state, dispatch } = view;
                            const range = state.selection.ranges[0]; 
                            
                            dispatch(state.changeByRange(r => ({
                                changes: [{ from: r.from, to: r.to, insert: textToInsert }],
                                range: EditorSelection.cursor(r.from + textToInsert.length)
                            })));
                        }).catch(() => {
                            if (onNotification) onNotification("Image paste failed", "error");
                        });
                        return true;
                    }
                }
            }

            // Blockiert PDFs, JSONs etc., die als Datei (Copy&Paste) kommen
            if (hasFiles) {
                event.preventDefault();
                if (onNotification) onNotification("Only images are supported in notes. Use Prompts for documents.", "warning");
                return true;
            }

            return false;
        },

        // 2. Drag & Drop Handler
        drop: (event, view) => {
            const items = event.dataTransfer?.files;
            if (!items || items.length === 0) return false;

            // GUARD 3: Verhindert IMMER den Browser-Redirect (Crash-Schutz)
            event.preventDefault(); 

            let processedImage = false;
            for (const file of items) {
                if (file.type.startsWith('image/')) {
                    processedImage = true;
                    
                    compressImage(file, 1200, 0.8).then(base64 => {
                        const textToInsert = `![Dropped Image](${base64})`;
                        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                        const insertPos = pos ? pos.pos : view.state.doc.length;
                        
                        view.dispatch({
                            changes: { from: insertPos, insert: textToInsert },
                            selection: { anchor: insertPos + textToInsert.length }
                        });
                    }).catch(() => {
                        if (onNotification) onNotification("Image drop failed", "error");
                    });
                    break; // Verarbeitet nur das erste Bild
                }
            }

            if (!processedImage) {
                if (onNotification) onNotification("Only image files can be dropped here.", "error");
            }
            return true;
        },

        // 3. Keydown-Handler (für Markdown-Wrapping)
        keydown: (event, view) => {
            const { state, dispatch } = view;
            if (!state.selection.ranges.some(r => !r.empty)) return false;

            const wrapChars = { '*': '*', '_': '_', '~': '~', '`': '`' };
            const char = wrapChars[event.key];
            
            if (char) {
                event.preventDefault(); 
                dispatch(state.changeByRange(range => {
                    if (range.empty) return { range };
                    const text = state.doc.sliceString(range.from, range.to);
                    return {
                        changes: [{ from: range.from, to: range.to, insert: char + text + char }],
                        range: EditorSelection.range(range.from + 1, range.to + 1)
                    };
                }));
                return true; 
            }
            return false;
        }
    }), [onNotification]); // Dependency hinzugefügt

    const extensions = useMemo(() => [
        keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }]), // Custom: Ctrl+Shift+Z = Redo (IDE-standard)
        autocompletion({
            override: [promptLinkCompletions, snippetLinkCompletions],
            activateOnTyping: true
        }),
        markdown({ extensions: [leanLanguageExt] }),
        html(),
        xml(),
        EditorView.lineWrapping,
        interactionHandler,
        inlineImagePlugin, // Visualizes Base64 images
        imageAtomicRanges, // Makes them atomic (delete as one block)
        leanBaseTheme,
        leanSyntaxHighlighting,
        commentDecorationPlugin,
        leanCommentTheme,
        tooltips({ parent: document.body }) // Fix: Prevent popup cutoff by modal overflow
    ], [prompts, snippets, interactionHandler]);

    // Define change handler at top level (Bug Fix: Avoid Error #310)
    const handleContentChange = useCallback((val) => setContent(val), [setContent]);

    if (!isOpen) return null;


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`bg-bg border border-border dark:border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 dm-modal dark:bg-[#09090b] ${isMaximized ? 'w-full h-full' : 'w-[900px] h-[85vh]'}`}
            >
                {/* 1. HEADER */}
                <div className="border-b border-border dark:border-white/5 bg-bg-surface/50 dark:bg-[#09090b] shrink-0 flex flex-col gap-2 p-4 pb-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col flex-1 min-w-0 gap-1">
                            <input
                                ref={titleInputRef}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-transparent text-xl font-bold text-text-main focus:outline-none w-full placeholder:text-text-muted/50 truncate"
                                placeholder="Untitled Note"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            {/* EXPORT MENU */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    disabled={isExportingImg}
                                    className="p-1.5 text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                                    title="Export Note"
                                >
                                    {isExportingImg ? <span className="animate-pulse px-1 font-mono text-[10px]">...</span> : <Download size={16} />}
                                </button>
                                
                                {showExportMenu && (
                                    <>
                                        <div className="fixed inset-0 z-[60]" onClick={() => setShowExportMenu(false)}></div>
                                        <div className="absolute right-0 top-full mt-1 w-56 bg-bg-surface border border-border rounded-lg shadow-2xl z-[70] p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                            <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                                                <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Export Note</span>
                                            </div>
                                            
                                            <button onClick={handleDownloadJson} className="w-full flex items-start gap-2 p-2 rounded text-left transition-all hover:bg-bg-hover group">
                                                <FileJson size={14} className="text-primary mt-0.5" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-text-main group-hover:text-primary">Export .json</span>
                                                    <span className="text-[10px] text-text-muted">Share with LeanPrompts users</span>
                                                </div>
                                            </button>
                                            
                                            <button onClick={handleDownloadMarkdown} className="w-full flex items-start gap-2 p-2 rounded text-left transition-all hover:bg-bg-hover group">
                                                <FileText size={14} className="text-blue-500 mt-0.5" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-text-main group-hover:text-blue-400">Export .md</span>
                                                    <span className="text-[10px] text-text-muted">Plain text for Notion, GitHub</span>
                                                </div>
                                            </button>
                                            
                                            <button onClick={handleDownloadImage} className="w-full flex items-start gap-2 p-2 rounded text-left transition-all hover:bg-bg-hover group">
                                                <ImageIcon size={14} className="text-purple-500 mt-0.5" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-text-main group-hover:text-purple-400">Export .png</span>
                                                    <span className="text-[10px] text-text-muted">Beautiful snapshot for Socials</span>
                                                </div>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="h-4 w-px bg-border mx-1"></div>

                            {/* MODE TOGGLE */}
                            <button
                                onClick={() => setIsPreview(!isPreview)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none ${!isPreview
                                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                    : 'bg-bg-elevated text-text-muted hover:text-text-main hover:bg-border'
                                    }`}
                            >
                                {!isPreview ? <><Eye size={14} /> Preview</> : <><Edit3 size={14} /> Edit</>}
                            </button>

                            <div className="h-5 w-px bg-border mx-1"></div>

                            {/* WINDOW CONTROLS */}
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="p-1.5 text-text-muted hover:text-text-main hover:bg-bg-hover rounded-md transition-colors"
                            >
                                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>

                            <button
                                onClick={handleCloseAttempt}
                                className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-md transition-colors ml-1"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* 2. METADATA BAR */}
                    <div className="pb-3 flex flex-wrap items-center gap-4">
                        <div className="flex items-start gap-1.5 shrink-0 max-w-full">
                            {isPreview ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0 h-[42px] px-4 bg-bg-surface/50 border border-transparent rounded-lg overflow-hidden">
                                    <Tag size={14} className="text-text-muted mr-1 flex-shrink-0" />
                                    <DynamicTagList tags={localTags} maxTagWidth={220} />
                                </div>
                            ) : (
                                <>
                                    <TagInput
                                        tags={localTags}
                                        onChange={setLocalTags}
                                        availableTags={(availableTags || []).map(t => t.name || t)}
                                    />
                                    <button
                                        onClick={() => setIsMultiTaggerOpen(true)}
                                        className="p-2.5 rounded-lg bg-bg-surface/50 border border-border text-text-muted hover:text-primary hover:border-primary hover:bg-primary/5 transition-all shadow-sm group shrink-0"
                                        title="Open Multi-Tagger"
                                    >
                                        <Tags size={16} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* COLLECTION SELECTOR */}
                        <div className="flex items-center gap-2 border-l border-border pl-4">
                            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Collection:</span>
                            <div className="relative">
                                <button
                                    onClick={(e) => {
                                        if (!showCollectionMenu) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const isFlipped = (window.innerHeight - rect.bottom) < 250;
                                            
                                            let leftPos = rect.left;
                                            if (leftPos + 208 > window.innerWidth - 16) {
                                                leftPos = window.innerWidth - 208 - 16;
                                            }
                                            
                                            setCollectionPopupPos({
                                                left: leftPos,
                                                ...(isFlipped 
                                                    ? { bottom: window.innerHeight - rect.top + 4 } 
                                                    : { top: rect.bottom + 4 })
                                            });
                                        }
                                        setShowCollectionMenu(!showCollectionMenu);
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-bg-surface/50 hover:border-primary text-xs font-medium transition-all group"
                                >
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: collections.find(c => c.id === localCollectionId)?.color || '#9ca3af' }}
                                    ></div>
                                    <span className="text-text-main">
                                        {collections.find(c => c.id === localCollectionId)?.name || 'None'}
                                    </span>
                                    <ChevronDown size={12} className="text-text-muted group-hover:text-primary" />
                                </button>

                                {showCollectionMenu && createPortal(
                                    <div className="portal-root">
                                        <div className="fixed inset-0 z-[9998]" onClick={() => { setShowCollectionMenu(false); setIsCreatingCollection(false); setNewCollectionName(""); }}></div>
                                        <div 
                                            className="fixed w-52 bg-bg-surface border border-border rounded-xl shadow-2xl z-[9999] p-1.5 animate-in fade-in zoom-in-95 duration-150 dm-dropdown"
                                            style={collectionPopupPos}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="px-2 py-1.5 mb-1 border-b border-border/50 flex justify-between items-center bg-bg-surface sticky top-0 z-10">
                                                <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">Move to</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setIsCreatingCollection(true); }}
                                                    className="p-1 hover:bg-bg-hover rounded text-primary"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            </div>

                                            {isCreatingCollection && (
                                                <div className="p-2 border-b border-border/50" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            autoFocus
                                                            className="flex-1 min-w-0 bg-bg-elevated text-[10px] px-1.5 py-1 rounded border border-border focus:border-primary focus:outline-none text-text-main"
                                                            placeholder="Name..."
                                                            value={newCollectionName}
                                                            onChange={e => setNewCollectionName(e.target.value)}
                                                            onKeyDown={async (e) => {
                                                                if (e.key === 'Enter' && newCollectionName.trim()) {
                                                                    e.stopPropagation();
                                                                    if (onCreateCollection) {
                                                                        const newId = crypto.randomUUID();
                                                                        await onCreateCollection({ id: newId, name: newCollectionName.trim(), color: '#6366f1' });
                                                                        setLocalCollectionId(newId);
                                                                    }
                                                                    setNewCollectionName("");
                                                                    setIsCreatingCollection(false);
                                                                    setShowCollectionMenu(false);
                                                                }
                                                            }}
                                                        />
                                                        <button className="p-1 hover:text-red-400" onClick={() => setIsCreatingCollection(false)}><X size={12} /></button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                <button
                                                    onClick={() => { setLocalCollectionId(null); setShowCollectionMenu(false); }}
                                                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${!localCollectionId ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0"></div>
                                                    <span>None (Uncategorized)</span>
                                                    {!localCollectionId && <Check size={12} className="ml-auto shrink-0" />}
                                                </button>
                                                {collections.map(col => (
                                                    <button
                                                        key={col.id}
                                                        onClick={() => { setLocalCollectionId(col.id); setShowCollectionMenu(false); }}
                                                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all ${localCollectionId === col.id ? 'bg-primary/10 text-primary font-semibold' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}
                                                    >
                                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color || '#6366f1' }}></div>
                                                        <span className="truncate">{col.name}</span>
                                                        {localCollectionId === col.id && <Check size={12} className="ml-auto shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. CONTENT AREA */}
                {/* 3. CONTENT AREA */}
                <div className="flex-1 overflow-hidden flex flex-col relative bg-bg-surface dark:bg-[#131316] min-h-0 border-t dark:border-white/5">
                    {isPreview ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                            <div className="prose dark:prose-invert max-w-none mx-auto text-text-main">
                                <MarkdownErrorBoundary>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkBreaks]}
                                        urlTransform={safeUrlTransform}
                                        rehypePlugins={[]} // Ensure no conflicting plugins
                                        components={{
                                            table: ({node, ...props}) => (
                                                <div className="w-full overflow-x-auto custom-scrollbar my-6 rounded-xl border border-border/50 bg-bg-surface/30">
                                                    <table className="w-full text-left border-collapse text-sm" {...props} />
                                                </div>
                                            ),
                                            thead: ({node, ...props}) => (
                                                <thead className="bg-bg-elevated/50 text-text-main border-b border-border/80" {...props} />
                                            ),
                                            th: ({node, ...props}) => (
                                                <th className="p-3 font-bold text-xs uppercase tracking-wider whitespace-nowrap border-r border-border/20 last:border-r-0" {...props} />
                                            ),
                                            td: ({node, ...props}) => (
                                                <td className="p-3 text-text-muted border-b border-border/30 border-r border-border/20 last:border-r-0 min-w-[140px] align-top leading-relaxed" {...props} />
                                            ),
                                            pre: ({ node, ...props }) => <>{props.children}</>,
                                            code: (props) => <CodeBlock {...props} collectionColor={collections.find(c => c.id === localCollectionId)?.color || null} onNavigateToPrompt={onNavigateToPrompt} />,
                                            p: ({ children }) => (
                                                <p className="mb-3 leading-normal text-text-main/90">
                                                    {React.Children.map(children, child =>
                                                        typeof child === 'string' ? formatLeanText(child, onNavigateToPrompt) : child
                                                    )}
                                                </p>
                                            ),
                                            a: ({ node, children, href, ...props }) => {
                                                // 🛡️ SECURITY GUARD: Smart Blacklist for Phishing/XSS
                                                const safeHref = (href || '').trim();
                                                const isInternal = safeHref.startsWith('prompt:') || safeHref.startsWith('snippet:');
                                                
                                                const isDangerous = safeHref.toLowerCase().startsWith('javascript:') || 
                                                                    safeHref.toLowerCase().startsWith('vbscript:') || 
                                                                    safeHref.toLowerCase().startsWith('data:text/html');

                                                if (isDangerous) {
                                                    return <span className="text-red-500 line-through cursor-not-allowed" title="Blocked for your safety: This link contains unsafe code">{children}</span>;
                                                }

                                                if (isInternal) {
                                                    const isPromptLink = safeHref.startsWith('prompt:');
                                                    const isSnippetLink = safeHref.startsWith('snippet:');
                                                    const target = decodeURIComponent(safeHref.split(':')[1]);

                                                    if (isPromptLink && typeof onNavigateToPrompt === 'function') {
                                                        return (
                                                            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigateToPrompt(target); }} className="text-primary hover:underline font-medium cursor-pointer relative z-20" title={`Go to prompt: ${target}`}>
                                                                {children}
                                                            </a>
                                                        );
                                                    }
                                                    if (isSnippetLink && typeof onNavigateToSnippet === 'function') {
                                                        return (
                                                            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigateToSnippet(target); }} className="text-blue-500 hover:underline font-medium cursor-pointer relative z-20" title={`Go to snippet: ${target}`}>
                                                                {children}
                                                            </a>
                                                        );
                                                    }
                                                }
                                                
                                                return (
                                                  <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline relative z-20" onClick={(e) => e.stopPropagation()}>
                                                    {children}
                                                  </a>
                                                )
                                            },
                                            img: ({ node, alt, src, ...props }) => {
                                                // 🛡️ SECURITY GUARD: Image Whitelisting
                                                const safeSrc = (src || '').trim();
                                                let isSafeImg = false;
                                                try {
                                                    const urlObj = new URL(safeSrc);
                                                    isSafeImg = ['http:', 'https:'].includes(urlObj.protocol) || safeSrc.startsWith('data:image/');
                                                } catch (e) {
                                                    isSafeImg = false;
                                                }

                                                if (!isSafeImg) return null; // Drop malicious payloads silently

                                                let width = undefined;
                                                let cleanAlt = alt;

                                                // ✅ NEW: Check '=' first (table-safe), then fall back to '|' (legacy)
                                                const SEP = (alt && alt.includes('=')) ? '=' : (alt && alt.includes('|')) ? '|' : null;
                                                if (SEP) {
                                                    const parts = alt.split(SEP);
                                                    if (parts.length >= 2 && /^\d+(px|%)?$/.test(parts[parts.length - 1].trim())) {
                                                        width = parts[parts.length - 1].trim();
                                                        cleanAlt = parts.slice(0, -1).join(SEP === '|' ? '|' : '=').trim();
                                                    }
                                                }

                                                return (
                                                    <img
                                                        {...props}
                                                        src={safeSrc}
                                                        alt={cleanAlt}
                                                        style={width ? { width: width, maxWidth: '100%' } : {}}
                                                        className="rounded-lg shadow-sm border border-border my-4"
                                                    />
                                                );
                                            }
                                        }}
                                    >
                                        {replaceLeanLinksOutsideCode(stripComments(content) || "*Start writing your note...*", snippets)}
                                    </ReactMarkdown>
                                </MarkdownErrorBoundary>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 relative flex flex-col min-h-0">
                            <CodeMirror
                                value={content}
                                theme="none"
                                height="100%"
                                extensions={extensions}
                                onChange={handleContentChange}
                                className="flex-1 overflow-auto text-base"
                                basicSetup={{
                                    lineNumbers: false,
                                    foldGutter: false,
                                    highlightActiveLine: false
                                }}
                            />

                            {/* Toolbar */}
                            <div className="absolute bottom-4 right-4 flex gap-2">
                                <label className="p-2 bg-bg-elevated border border-border rounded-lg shadow-sm cursor-pointer hover:bg-bg-surface hover:text-primary transition-colors text-text-muted" title="Insert Image" >
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    <ImageIcon size={18} />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* --- DEZENTE HELPER BAR IM EDITOR (IDE Status Bar) --- */}
                    {!isPreview && (
                        <div className="bg-bg-surface/30 border-t border-border py-1 px-3 text-[10px] text-text-faint flex justify-between items-center shrink-0 select-none">
                            {/* Anfänger-Hilfe (Links) */}
                            <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity truncate pr-4">
                                Tip: Use <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">{"{{var}}"}</code> for inputs, <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">{"{{file: doc}}"}</code> for attachments, <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">@</code> for Snippets, and <code className="bg-bg-elevated border border-border px-1 rounded font-mono tracking-tight text-text-muted">#</code> for Prompts.
                            </span>

                            {/* Power-User Cheat-Sheet (Rechts) */}
                            <div
                                className="flex items-center gap-1 opacity-50 hover:opacity-100 hover:text-text-main transition-colors cursor-help shrink-0"
                                title={"ADVANCED SYNTAX:\n• Required: {{!Variable}}\n• Dropdowns: {{Variable: Option 1 | Option 2}}\n• System Macros: {{$date}}, {{$time}}, {{$day}}, {{$uuid}}, {{$language}}\n• Hidden Comments: %% Your note %%"}
                            >
                                <HelpCircle size={12} />
                                <span>Advanced</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. FOOTER (Adaptive State UX) */}
                <div className="p-4 border-t border-border dark:border-white/5 bg-bg-surface/50 dark:bg-[#09090b] flex justify-end gap-3 shrink-0">
                    {checkDirty() && (
                        <button
                            onClick={handleCloseAttempt}
                            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main transition-colors animate-fade-in"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={checkDirty() ? handleSave : onClose}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 active:scale-95 ${
                            checkDirty()
                                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600"
                                : "bg-bg-elevated border border-border text-text-main hover:bg-bg-hover"
                        }`}
                    >
                        {checkDirty() ? <Save size={16} /> : <Check size={16} />} 
                        {checkDirty() ? "Save Note" : "Done"}
                    </button>
                </div>

            </motion.div>
            {/* UNSAVED CHANGES MODAL */}
            {showUnsavedModal && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden w-[400px] max-w-[90vw] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-text-main">Unsaved Changes</h3>
                            <p className="text-sm text-text-muted">
                                You have unsaved changes in your note. Do you want to save them before closing?
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleSaveAndClose}
                                className="w-full py-2 bg-indigo-500 text-white rounded-lg font-bold hover:bg-indigo-600 transition-colors shadow-sm"
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={handleDiscardAndClose}
                                className="w-full py-2 bg-bg-surface border border-border text-text-muted hover:text-red-500 hover:border-red-500/50 rounded-lg font-medium transition-colors"
                            >
                                Discard Changes
                            </button>
                            <button
                                onClick={() => setShowUnsavedModal(false)}
                                className="w-full py-2 text-text-muted hover:text-text-main transition-colors text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HIDDEN EXPORT CONTAINER */}
            <div className="absolute top-[-9999px] left-[-9999px] pointer-events-none opacity-100">
                <div
                    ref={exportRef}
                    className="w-[800px] bg-gradient-to-br from-zinc-800 to-zinc-950 p-12 rounded-xl border border-white/5 shadow-2xl flex flex-col"
                >
                    <div className="bg-[#18181b] rounded-lg shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/50">
                        <div className="h-10 bg-[#27272a] border-b border-white/5 flex items-center justify-between px-4">
                            <div className="flex items-center gap-2.5 opacity-70">
                                <Terminal size={14} className="text-white/60" />
                                <span className="text-xs font-mono text-white/80 tracking-wide pt-0.5">
                                    {title || "Untitled Note"}
                                </span>
                            </div>
                            <div className="flex gap-2 opacity-30">
                                <div className="w-2.5 h-0.5 bg-white rounded-full"></div>
                                <div className="w-2.5 h-2.5 border border-white rounded-[2px]"></div>
                                <div className="w-2.5 h-2.5 relative">
                                    <div className="absolute inset-0 rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                                    <div className="absolute inset-0 -rotate-45 bg-white h-full w-[1px] left-1/2"></div>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-[#18181b] flex-1">
                            <div className="prose prose-invert max-w-none text-[#e4e4e7]">
                                <MarkdownErrorBoundary>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkBreaks]}
                                        urlTransform={safeUrlTransform}
                                        components={{
                                            pre: ({ node, ...props }) => <>{props.children}</>,
                                            code: (props) => <CodeBlock {...props} collectionColor={collections.find(c => c.id === localCollectionId)?.color || null} />,
                                            p: ({ children }) => <p className="mb-3 leading-normal">{children}</p>,
                                            img: ({ node, alt, ...props }) => {
                                                let width = undefined;
                                                let cleanAlt = alt;
                                                // ✅ NEW: Check '=' first (table-safe), then fall back to '|' (legacy)
                                                const SEP = (alt && alt.includes('=')) ? '=' : (alt && alt.includes('|')) ? '|' : null;
                                                if (SEP) {
                                                    const parts = alt.split(SEP);
                                                    if (parts.length >= 2 && /^\d+(px|%)?$/.test(parts[parts.length - 1].trim())) {
                                                        width = parts[parts.length - 1].trim();
                                                        cleanAlt = parts.slice(0, -1).join(SEP === '|' ? '|' : '=').trim();
                                                    }
                                                }
                                                return <img {...props} alt={cleanAlt} style={width ? { width: width, maxWidth: '100%' } : {}} className="rounded-lg my-4 border border-white/10" />;
                                            }
                                        }}
                                    >
                                        {stripComments(content) || "*Start writing your note...*"}
                                    </ReactMarkdown>
                                </MarkdownErrorBoundary>
                            </div>
                        </div>
                        <div className="px-4 py-2 bg-[#27272a] border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-white/40 uppercase tracking-wider">
                            <div className="flex gap-4">
                                <span>Note</span>
                                <span>{(content || "").length} chars</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {localTags.map(t => <span key={t} className="text-white/60">#{t}</span>)}
                                {localTags.length > 0 && <div className="w-px h-3 bg-white/10 mx-1"></div>}
                                <span className="text-white/60 font-bold">LeanPrompts Studio</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <MultiTaggerModal
                isOpen={isMultiTaggerOpen}
                onClose={() => setIsMultiTaggerOpen(false)}
                promptTitle={title || "Untitled Note"}
                allTags={availableTags}
                currentTags={localTags}
                onSave={setLocalTags}
            />
        </div>
    );
}
