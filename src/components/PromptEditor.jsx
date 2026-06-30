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
import React, { useMemo, useState, useEffect } from 'react';
import { resolveSnippets, getIgnoredRanges } from '../utils/variableParser';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { EditorView, Decoration, ViewPlugin, hoverTooltip, tooltips, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { redo } from '@codemirror/commands';
import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { RangeSetBuilder, Prec, Facet } from '@codemirror/state';
import { styleTags, tags } from '@lezer/highlight';
import { leanBaseTheme, leanSyntaxHighlighting } from '../utils/editorTheme';

const snippetsFacet = Facet.define({
  combine: values => values[0] || []
});

/**
 * CUSTOM MARKDOWN EXTENSION
 * Defines atomic nodes for Variables and Snippets.
 * This ensures CodeMirror parses [[...]] as a single unit, avoiding fragmentation.
 */
const leanLanguageExt = {
  defineNodes: ["Variable", "Snippet"],
  parseBlock: [],
  parseInline: [{
    name: "Variable",
    parse(cx, next, pos) {
      if (next === 123 && cx.char(pos + 1) === 123) {
        for (let i = pos + 2; i < cx.end; i++) {
          if (cx.char(i) === 125 && cx.char(i + 1) === 125) {
            return cx.addElement(cx.elt("Variable", pos, i + 2));
          }
        }
      }
      return -1;
    },
    before: "Link"
  }, {
    name: "Snippet",
    parse(cx, next, pos) {
      if (next === 64) { // 64 = '@'
        // --- 100% SAFE BLACKLIST: Blockiere E-Mail-Prefixe ---
        if (pos > 0) {
          const prevChar = String.fromCharCode(cx.char(pos - 1));
          if (/[a-zA-Z0-9_.+\-]/.test(prevChar)) return -1;
        }
        // -----------------------------------------------------
        const rest = cx.slice(pos + 1, cx.end);
        const match = /^([\w-]+(?:\.[\w-]+)*|\{[^}]+\})/.exec(rest);
        if (match) {
          return cx.addElement(cx.elt("Snippet", pos, pos + 1 + match[0].length));
        }
      }
      return -1;
    }
  }],
  props: [
    styleTags({
      Variable: tags.atom,
      Snippet: tags.macroName
    })
  ]
};

/**
 * PLUGIN: LeanPrompts IDE Engine
 * ... (unchanged)
 */
const promptIDEPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.lastDoc = view.state.doc.toString();
    // =========================================================================
    // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
    // Cache the expensive O(N) character-by-character literal parser result.
    // parseLiterals() only runs when the document text changes (docChanged),
    // NOT on cursor movements (selectionSet), eliminating the main typing lag.
    // =========================================================================
    this.cachedLiterals = this.parseLiterals(this.lastDoc);
    this.decorations = this.buildDeco(view);
  }

  // =========================================================================
  // [PROTECTED: ZERO-REGRESSION PERFORMANCE — UPDATE METHOD SPLIT]
  // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
  //
  // WHY THIS IS SPLIT INTO TWO BLOCKS:
  //   Block 1 (docChanged only): Runs the O(N) parseLiterals() scanner.
  //     NEVER add selectionSet or viewportChanged here — it would cause
  //     a full document re-scan on every cursor movement (arrow keys, clicks),
  //     which is the root cause of the typing lag this fix eliminates.
  //
  //   Block 2 (docChanged | viewportChanged | selectionSet): Runs buildDeco()
  //     which now only reads from cache — this is O(viewport), not O(document).
  //     selectionSet IS needed here for "active variable" highlight toggling.
  //
  // REGRESSION RISK: Merging these two blocks back into one, or calling
  // parseLiterals() inside buildDeco(), will immediately reintroduce
  // the O(N)-per-cursor-move bottleneck.
  // =========================================================================
  update(update) {
    // BLOCK 1: Heavy O(N) parser — ONLY on actual text changes
    if (update.docChanged) {
      const newDoc = update.view.state.doc.toString();
      this.cachedLiterals = this.parseLiterals(newDoc);

      // Debounced Suggestion Scan (only on real text change)
      if (newDoc !== this.lastDoc) {
        this.lastDoc = newDoc;
        this.scanForSuggestions(newDoc, update.view.state.selection.main);
      }
    }

    // BLOCK 2: Lightweight decoration rebuild — uses cached literal ranges
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDeco(update.view);
    }
  }

  scanForSuggestions(text, selectionAtChange) {
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.scanTimeout = setTimeout(() => {
      if (!this.view) return;
      const selection = this.view.state.selection.main;

      // =========================================================================
      // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
      // Nutzt Viewport-Scanning statt Full-Document-Scanning.
      // Scannt ausschließlich den Text, der für den User aktuell auf dem Monitor
      // sichtbar ist. Dies garantiert O(1) Performance und löst das Paste-Problem.
      // =========================================================================
      const visibleRanges = this.view.visibleRanges;
      const regex = /(\[\[.*?\]\]|\[[^\]]+\]|\{([^\{}]+)\})/g;
      const suggestions = [];

      for (const { from, to } of visibleRanges) {
        // Puffer von 200 Zeichen, damit Variablen an den Rändern nicht abgeschnitten werden
        const scanStart = Math.max(0, from - 200);
        const scanEnd = Math.min(text.length, to + 200);
        const chunk = text.substring(scanStart, scanEnd);

        let match;
        while ((match = regex.exec(chunk)) !== null) {
          const val = match[0];
          const start = scanStart + match.index;
          const end = start + val.length;

        // Context checks against full text for boundary accuracy
        const charBefore = text[start - 1];
        const charAfter = text[end];

        // 1. Exclude existing {{...}} context
        if (val.startsWith('{') && charBefore === '{') continue;
        if (val.endsWith('}') && charAfter === '}') continue;

        // 2. Exclude Snippets (@{...})
        if (charBefore === '@') continue;

        // 3. Exclude if CodeMirror just auto-wrapped a text selection
        if (selection && selection.from === start + 1 && selection.to === end - 1) {
          continue;
        }

        // === 🛡️ ZERO-REGRESSION HEURISTICS (NO FALSE POSITIVES) ===
        
        // 4. Exclude Markdown Links: [Link Text](https...)
        if (val.startsWith('[') && !val.startsWith('[[') && charAfter === '(') continue;
        
        // 5. Exclude LeanPrompts internal WikiLinks: [[Prompt Title]]
        if (val.startsWith('[[') && val.endsWith(']]')) continue;
        
        // 6. Exclude JSON / CSS / Code: { "key": "val" } or { margin: 0; }
        // If it contains quotes, colons, semicolons, or equals signs, it's code, not a variable.
        if (val.startsWith('{') && (val.includes('"') || val.includes("'") || val.includes(':') || val.includes(';') || val.includes('='))) continue;
        
        // 7. Exclude multiline or excessively long strings (Variables are short!)
        if (val.length > 50 || val.includes('\n')) continue;
        
        // 8. Exclude empty or purely whitespace brackets: [], {}, [ ]
        const innerText = val.replace(/^\[+|\]+$/g, '').replace(/^\{+|\}+$/g, '').trim();
        if (innerText.length === 0) continue;
        
        // ==========================================================

        suggestions.push({ text: val });
      }
      }

      if (suggestions.length > 0) {
        window.dispatchEvent(new CustomEvent('lp-syntax-suggestion', {
          detail: { suggestions: suggestions }
        }));
      }

    }, 500);
  }

  // =========================================================================
  // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
  // Extracted from buildDeco() into its own method so it can be cached.
  // 100% identical logic to the original inline parser — only moved, not changed.
  // =========================================================================
  parseLiterals(fullText) {
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

    return { commentRanges, inlineCodeRanges };
  }

  buildDeco(view) {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const matches = [];
    const selection = view.state.selection.main;
    const availableSnippets = view.state.facet(snippetsFacet);

    const varRegex = /\{\{([\s\S]+?)\}\}/g;
    const snipRegex = /(?<![a-zA-Z0-9_.+\-])(?:@[\w-]+(?:\.[\w-]+)*|@\{[^}]+\})/g;
    
    // =========================================================================
    // [PROTECTED: ZERO-REGRESSION PERFORMANCE — CACHED LITERAL RANGES]
    // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
    // DO NOT replace this with doc.toString() + inline parsing.
    // The literal ranges are pre-computed by parseLiterals() and cached in
    // this.cachedLiterals. Inlining the parser here would re-introduce the
    // O(N) full-document scan on every cursor movement.
    // =========================================================================
    const { commentRanges, inlineCodeRanges } = this.cachedLiterals;

    // =========================================================================
    // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
    // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
    // This restricts syntax highlighting decoration building to strictly the visible UI viewport.
    // Iterating the full document on every keystroke causes severe typing latency.
    // =========================================================================
    const visibleRanges = view.visibleRanges;

    for (const { from: rangeFrom, to: rangeTo } of visibleRanges) {
      // 1.a Apply Comment Decorations for the visible ranges
      for (const cr of commentRanges) {
        if (cr.to >= rangeFrom && cr.from <= rangeTo) {
          matches.push({
            from: Math.max(rangeFrom, cr.from),
            to: Math.min(rangeTo, cr.to),
            value: Decoration.mark({ class: "cm-lean-comment" })
          });
        }
      }

      // 1.b Apply Inline Code Decorations
      for (const ir of inlineCodeRanges) {
        if (ir.to >= rangeFrom && ir.from <= rangeTo) {
          matches.push({
            from: Math.max(rangeFrom, ir.from),
            to: Math.min(rangeTo, ir.to),
            value: Decoration.mark({ class: "cm-inline-code" })
          });
        }
      }

      // Get the text just for this visible viewport
      const text = doc.sliceString(rangeFrom, rangeTo);

      // Helper to check if a position is inside a comment or inline code literal
      const isInsideLiteral = (pos) => 
        commentRanges.some(cr => pos >= cr.from && pos <= cr.to) ||
        inlineCodeRanges.some(ir => pos >= ir.from && pos <= ir.to);

      // 2. VARIABLES {{...}}
      let match;
      while ((match = varRegex.exec(text)) !== null) {
        const globalFrom = rangeFrom + match.index;
        const globalTo = globalFrom + match[0].length;

        // Skip if inside a comment or inline code
        if (isInsideLiteral(globalFrom)) continue;

        // Focus-Aware: Switch to "Active" mode if cursor is inside
        const isActive = (selection.from >= globalFrom && selection.to <= globalTo) ||
          (selection.from <= globalFrom && selection.to >= globalTo);

        const innerText = match[1].trim();
        const isMacro = innerText.startsWith('$');

        let cssClass = "cm-variable";
        if (isMacro) {
          cssClass = isActive ? "cm-macro-active" : "cm-macro";
        } else {
          cssClass = isActive ? "cm-variable-active" : "cm-variable";
        }

        matches.push({
          from: globalFrom,
          to: globalTo,
          value: Decoration.mark({ class: cssClass })
        });
      }

      // 3. SNIPPETS @...
      let sMatch;
      while ((sMatch = snipRegex.exec(text)) !== null) {
        const globalFrom = rangeFrom + sMatch.index;
        const globalTo = globalFrom + sMatch[0].length;
        
        // Skip if inside a comment or inline code
        if (isInsideLiteral(globalFrom)) continue;

        const raw = sMatch[0];

        // Extract name to check existence
        const nameMatch = /^@(?:\{([^{}]+)\}|([\w-]+(?:\.[\w-]+)*))/.exec(raw);
        const snipName = nameMatch ? (nameMatch[1] || nameMatch[2]) : raw.substring(1);

        const exists = availableSnippets.some(s => s.name === snipName);

        const isActivelyTyping = selection.empty &&
          selection.head >= globalFrom &&
          selection.head <= globalTo + 1;

        let cssClass = "";
        if (isActivelyTyping) {
          cssClass = "cm-snippet-active";
        } else {
          cssClass = !exists ? "cm-snippet-broken" : "cm-snippet";
        }

        matches.push({
          from: globalFrom,
          to: globalTo,
          value: Decoration.mark({ class: cssClass })
        });
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

/**
 * Click-to-Focus Extension
 * ... (unchanged)
 */

/**
 * Locator Plugin
 * Passively listens for UI events to scroll the editor to specific variables.
 * 100% React-State isolated to prevent re-renders.
 */
const locatorPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.handleLocate = this.handleLocate.bind(this);
    window.addEventListener('lp-locate-variable-in-editor', this.handleLocate);
  }
  destroy() {
    window.removeEventListener('lp-locate-variable-in-editor', this.handleLocate);
  }
  handleLocate(e) {
    try {
      const targetVar = e.detail.name;
      const doc = this.view.state.doc.toString();
      
      // 1. ACTIVE STEP GUARD: Ignoriere das Event, wenn dieser Editor inaktiv/gesperrt ist
      const isLocked = !!this.view.dom.closest('.step-scroll-locked');
      if (isLocked) {
        return;
      }

      // 2. IGNORED RANGES: Berechne inaktive Bereiche (Kommentare, Code-Blöcke)
      const ignoredRanges = getIgnoredRanges(doc);
      const isPositionIgnored = (pos) => ignoredRanges.some(r => pos >= r.from && pos <= r.to);

      const varRegex = /\{\{([\s\S]+?)\}\}/g;
      let match;
      
      while ((match = varRegex.exec(doc)) !== null) {
        // Überspringe Treffer, die sich in inaktiven Bereichen befinden
        if (isPositionIgnored(match.index)) continue;

        const rawInner = match[1].trim();
        const parts = rawInner.split(':');
        const firstPart = parts[0].trim().toLowerCase();
        
        let varKey = "";
        if ((firstPart === 'file' || firstPart === '!file') && parts.length > 1) {
          const prefix = firstPart === '!file' ? '!file:' : 'file:';
          varKey = `${prefix}${parts[1].trim()}`;
        } else {
          varKey = parts[0].trim();
        }
        
        if (varKey === targetVar) {
          this.view.dispatch({
            selection: { anchor: match.index, head: match.index + match[0].length },
            effects: EditorView.scrollIntoView(match.index, { y: "center" })
          });
          if (!this.view.hasFocus) {
            this.view.focus();
          }
          break; // Nur den ersten echten Treffer im aktiven Editor fokussieren
        }
      }
    } catch (err) {
      console.error("LeanPrompts Locator Error:", err);
    }
  }
});

/**
 * THEME OVERRIDE
 */
const promptTheme = EditorView.theme({
  ".cm-variable": {
    color: "var(--hl-variable-text) !important",
    backgroundColor: "var(--hl-variable-bg) !important",
    borderRadius: "2px",
    padding: "0 2px",
    fontWeight: "bold !important",
    fontStyle: "normal !important",
    textDecoration: "none !important"
  },
  ".cm-macro": {
    color: "#818cf8 !important",
    backgroundColor: "rgba(129, 140, 248, 0.15) !important",
    borderRadius: "2px",
    padding: "0 2px",
    fontWeight: "bold !important",
    fontStyle: "normal !important",
    textDecoration: "none !important"
  },
  ".cm-macro-active": {
    color: "#6366f1 !important",
    backgroundColor: "rgba(99, 102, 241, 0.2) !important",
    borderRadius: "2px",
    padding: "0 2px",
    fontWeight: "bold !important",
    fontStyle: "normal !important",
    textDecoration: "none !important"
  },
  ".cm-snippet": {
    color: "var(--hl-snippet-text) !important",
    backgroundColor: "var(--hl-snippet-bg) !important",
    borderRadius: "4px",
    padding: "0 2px",
    fontWeight: "bold !important"
  },
  ".cm-snippet-broken": {
    color: "#ff4d4f !important", // Red text
    backgroundColor: "rgba(255, 77, 79, 0.1) !important", // Light red bg
    borderRadius: "4px",
    padding: "0 2px",
    fontWeight: "bold !important",
    textDecoration: "line-through !important" // Strike-through
  },
  ".cm-snippet-tooltip": {
    display: "block",
    padding: "8px 12px",
    backgroundColor: "var(--bg-elevated, #1e1e2e)",
    color: "var(--text-main, #e0e0e0)",
    border: "1px solid var(--border, #333)",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "var(--font-mono, monospace)",
    whiteSpace: "pre-wrap",
    maxWidth: "400px",
    maxHeight: "300px",
    overflowY: "auto",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
    zIndex: "100"
  },
  ".cm-lean-comment": {
    color: "#8b949e !important",
    fontStyle: "italic !important"
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

const PromptEditor = ({ value, onChange, snippets = [], allowAttachments = true, onNotification }) => {
  const [recursionError, setRecursionError] = useState(false);

  // =========================================================================
  // [PROTECTED: ZERO-REGRESSION PERFORMANCE SHIELD]
  // Kapselt Callbacks und Settings in Refs. Verhindert, dass CodeMirror 
  // bei Prop-Änderungen (wie onNotification) neu berechnet werden muss.
  // =========================================================================
  const onChangeRef = React.useRef(onChange);
  const optionsRef = React.useRef({ allowAttachments, onNotification });
  
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
    optionsRef.current = { allowAttachments, onNotification };
  }, [onChange, allowAttachments, onNotification]);

  const stableOnChange = React.useCallback((val, viewUpdate) => {
    if (onChangeRef.current) onChangeRef.current(val, viewUpdate);
  }, []);

  // --- SMART EVENT INTERCEPTOR (Verhindert Main-Thread Freeze & falsche Attachments) ---
  const interactionExtension = useMemo(() => EditorView.domEventHandlers({
    mousedown: (event, view) => {
      const target = event.target;
      const varEl = target.closest('.cm-variable');
      if (varEl) {
        const rawInner = varEl.innerText.replace(/\{|\}/g, '').replace(/\[|\]/g, '').trim();
        const parts = rawInner.split(':');
        let varName = "";
        
        // 1:1 Parität mit variableParser.js
        const firstPart = parts[0].trim().toLowerCase();
        if ((firstPart === 'file' || firstPart === '!file') && parts.length > 1) {
            const prefix = firstPart === '!file' ? '!file:' : 'file:';
            varName = `${prefix}${parts[1].trim()}`;
        } else {
            varName = parts[0].trim();
        }
        
        if (varName) window.dispatchEvent(new CustomEvent('lp-focus-variable', { detail: { name: varName } }));
        return;
      }
      const snipEl = target.closest('.cm-snippet');
      if (snipEl) {
        const raw = snipEl.innerText;
        const match = /^@(?:\{([^{}]+)\}|([\w-]+(?:\.[\w-]+)*))/.exec(raw);
        const snipName = match ? (match[1] || match[2]) : raw.substring(1);
        if (snipName) window.dispatchEvent(new CustomEvent('lp-focus-snippet', { detail: { name: snipName } }));
      }
    },
    paste: (event, view) => {
      const pastedText = event.clipboardData?.getData('text/plain');
      const hasFiles = event.clipboardData?.files?.length > 0;
      const MAX_LENGTH = 100000;
      const { allowAttachments, onNotification } = optionsRef.current;

      // GUARD 1: Schutz vor Main-Thread Freeze bei großen Text-Mengen
      if (pastedText && pastedText.length > MAX_LENGTH) {
          event.preventDefault();
          if (allowAttachments) {
              const blob = new Blob([pastedText], { type: 'text/plain' });
              const file = new File([blob], `large_text_snippet_${Date.now().toString().slice(-4)}.txt`, { type: 'text/plain' });
              window.dispatchEvent(new CustomEvent('lp-paste-files', { detail: { files: [file] } }));
              if (onNotification) onNotification(`Text too large (${Math.round(pastedText.length / 1024)}KB). Converted to file attachment.`, 'info');
          } else {
              if (onNotification) onNotification(`Paste blocked: Text exceeds 100KB limit.`, 'error');
          }
          return true;
      }

      // GUARD 2: Kontextsensitiver Schutz vor versehentlichen Datei-Pastes
      if (hasFiles) {
          if (!pastedText) event.preventDefault();
          
          if (allowAttachments) {
              const files = Array.from(event.clipboardData.files);
              window.dispatchEvent(new CustomEvent('lp-paste-files', { detail: { files } }));
          } else {
              if (onNotification) onNotification("Snippets only support text. Attachments blocked.", 'warning');
          }
          return !pastedText; 
      }
      return false;
    },
    drop: (event, view) => {
      // GUARD 3: Verhindert immer, dass der Browser PDFs im aktuellen Tab öffnet
      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
          event.preventDefault(); 
          const { allowAttachments, onNotification } = optionsRef.current;
          
          if (allowAttachments) {
              const files = Array.from(event.dataTransfer.files);
              window.dispatchEvent(new CustomEvent('lp-paste-files', { detail: { files } }));
          } else {
              if (onNotification) onNotification("Snippets only support text. Attachments blocked.", 'error');
          }
          return true;
      }
      return false;
    }
  }), []); // <-- LEERES DEPENDENCY ARRAY! Garantiert absolut null Re-Renders.
  // --------------------------------

  // Proactive recursion check: Reset error and try resolving
  useEffect(() => {
    setRecursionError(false);
    if (!value || snippets.length === 0) return;

    // This triggers the event inside variableParser if recursion limit is hit
    try {
      resolveSnippets(value, snippets);
    } catch (e) {
      if (e.message === "RECURSION_LIMIT") {
        setRecursionError(true);
      }
    }
  }, [value, snippets]);

  const snippetCompletions = (context) => {
    // Erkennt das '@' und alles, was danach getippt wird
    let word = context.matchBefore(/(?<![a-zA-Z0-9_.+\-])@[\w-]*(?:\.[\w-]+)*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    // Das ist der Suchbegriff des Users (ohne das '@')
    const query = word.text.substring(1).toLowerCase();

    // 1. DEEP SEARCH LOGIK: Filtere nach Name, Inhalt ODER Tags
    let filteredSnippets = snippets;
    if (query) {
      filteredSnippets = snippets.filter(s =>
        // Suche im Namen
        s.name.toLowerCase().includes(query) ||
        // Suche im Text-Inhalt des Snippets
        (s.content && s.content.toLowerCase().includes(query)) ||
        // Suche in den Tags (z.B. wenn das Snippet den Tag "Marketing" hat)
        (s.tags && s.tags.some(t => t.toLowerCase().includes(query)))
      );
    }

    return {
      from: word.from,
      // 2. DAS IST DER MAGISCHE SCHLÜSSEL: 
      // Wir sagen CodeMirror, dass wir das Filtern selbst übernommen haben!
      filter: false,
      options: filteredSnippets.map(s => ({
        label: `@${s.name}`,
        // Zeige einen Ausschnitt des Inhalts als Vorschau (ohne Zeilenumbrüche)
        detail: s.content.length > 45 ? s.content.substring(0, 45).replace(/\n/g, ' ') + '...' : s.content.replace(/\n/g, ' '),
        apply: `@{${s.name}}`,
        type: 'variable'
      }))
    };
  };

  const variableCompletions = (context) => {
    let word = context.matchBefore(/\{\{[!\w:-]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    // --- CONTEXT-AWARE LOOK-AHEAD ---
    // Hole die nächsten 250 Zeichen nach dem Cursor (erweitert für längere markierte Sätze)
    const nextText = context.state.doc.sliceString(context.pos, context.pos + 250);

    // NEU: Prüfe ob wir uns in einem CodeMirror-Auto-Wrap befinden.
    // Wenn der User Text markiert und '{' tippt, macht CodeMirror daraus "{{Markierter Text}}"
    // In dem Fall wollen wir den GANZEN markierten Text als Variable vorschlagen.
    // Das regex sucht nach Text ohne '{' oder '}', gefolgt von '}}'.
    const wrapMatch = nextText.match(/^(\s*)([^}{]+?)(\s*)\}\}/);

    let adjacentWord = null;
    let fullMatchLength = 0;

    if (wrapMatch) {
      adjacentWord = wrapMatch[2]; // Der eingewickelte Text ohne äußere Leerzeichen
      // fullMatchLength = Länge des Matches exklusive "}}"
      fullMatchLength = wrapMatch[0].length - 2;
    } else {
      // Suche nach einem angrenzenden Wort
      // \s* = Erlaubt versehentliche Leerzeichen nach den {{
      // ([a-zA-Z0-9_äöüÄÖÜß-]+) = Das Wort selbst (inkl. Umlaute und Bindestriche!)
      const matchNextWord = nextText.match(/^\s*([a-zA-Z0-9_äöüÄÖÜß-]+)/);
      if (matchNextWord) {
        adjacentWord = matchNextWord[1];
        fullMatchLength = matchNextWord[0].length;
      }
    }

    // Fallback auf Standard, falls kein Wort da ist
    const varName = adjacentWord || "Text";
    const fileName = adjacentWord || "Name";

    // Sicherheit für CodeMirror-Snippets: '$' und '\' escapen, damit sie nicht als Snippet-Variablen interpretiert werden.
    const safeVarName = varName.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
    const safeFileName = fileName.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');

    // --- ZERO-REGRESSION: STATISCHE SYSTEM MACROS ---
    const systemOptions = [
      { label: '{{$date}}', detail: 'Current date', type: 'keyword', boost: -1 },
      { label: '{{$time}}', detail: 'Current time', type: 'keyword', boost: -2 },
      { label: '{{$day}}', detail: 'Current weekday', type: 'keyword', boost: -3 },
      { label: '{{$uuid}}', detail: 'Unique ID', type: 'keyword', boost: -4 },
      { label: '{{$language}}', detail: 'Browser locale', type: 'keyword', boost: -5 }
    ].map(opt => ({
      ...opt,
      apply: (view, completion, from, to) => {
        let deleteTo = to;
        if (view.state.doc.sliceString(deleteTo, deleteTo + 2) === '}}') {
          deleteTo += 2;
        }
        view.dispatch({
          changes: { from, to: deleteTo, insert: opt.label },
          selection: { anchor: from + opt.label.length }
        });
      }
    }));

    return {
      from: word.from,
      options: [
        {
          label: adjacentWord ? `{{${adjacentWord}}}` : '{{Text}}',
          detail: adjacentWord ? 'Wrap text as variable' : 'Standard text variable',
          type: 'variable',
          boost: 2,
          apply: (view, completion, from, to) => {
            // Wenn wir ein Wort gefunden haben, weiten wir den Lösch-Bereich (deleteTo) 
            // um die Länge des gefundenen Wortes (inkl. Leerzeichen) aus.
            let deleteTo = adjacentWord ? to + fullMatchLength : to;

            // Dein originaler Check: Verhindert {{Wort}}}}
            if (view.state.doc.sliceString(deleteTo, deleteTo + 2) === '}}') {
              deleteTo += 2;
            }

            const insertText = `{{${safeVarName}}}`;
            view.dispatch({
              changes: { from, to: deleteTo, insert: insertText },
              selection: { anchor: from + insertText.length } // Cursor präzise ans Ende setzen
            });
          }
        },
        {
          label: adjacentWord ? `{{file: ${adjacentWord}}}` : '{{file: Name}}',
          detail: adjacentWord ? 'Wrap text as File Dropzone' : 'File Dropzone variable',
          type: 'variable',
          boost: 1,
          apply: (view, completion, from, to) => {
            let deleteTo = adjacentWord ? to + fullMatchLength : to;

            if (view.state.doc.sliceString(deleteTo, deleteTo + 2) === '}}') {
              deleteTo += 2;
            }

            const insertText = `{{file: ${safeFileName}}}`;
            view.dispatch({
              changes: { from, to: deleteTo, insert: insertText },
              selection: { anchor: from + insertText.length } // Cursor präzise ans Ende setzen
            });
          }
        },
        // --- HIER DIE SYSTEM OPTIONEN ANHÄNGEN ---
        ...systemOptions
      ]
    };
  };

  const slashCompletions = (context) => {
    let word = context.matchBefore(/\/\w*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    return {
      from: word.from,
      options: [
        {
          label: '/variable',
          detail: 'Insert standard text variable',
          type: 'keyword',
          boost: 3,
          apply: (view, completion, from, to) => {
            const insert = '{{Variable}}';
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + 2, head: from + 10 }
            });
          }
        },
        {
          label: '/file',
          detail: 'Insert file dropzone variable',
          type: 'keyword',
          boost: 2,
          apply: (view, completion, from, to) => {
            const insert = '{{file: Name}}';
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + 8, head: from + 12 }
            });
          }
        },
        {
          label: '/snippet',
          detail: 'Insert a snippet reference',
          type: 'keyword',
          boost: 1,
          apply: (view, completion, from, to) => {
            const insert = '@SnippetName';
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + 1, head: from + 12 }
            });
          }
        }
      ]
    };
  };

  const extensions = useMemo(() => [
    keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }]), // Custom: Ctrl+Shift+Z = Redo (IDE-standard)
    cmPlaceholder("Press '/' for commands..."),
    snippetsFacet.of(snippets), // Pass snippets to the state!
    Prec.highest(promptIDEPlugin),
    Prec.highest(interactionExtension),
    Prec.highest(locatorPlugin),
    Prec.highest(autocompletion({
      override: [snippetCompletions, variableCompletions, slashCompletions],
      activateOnTyping: true
    })),
    hoverTooltip((view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const relPos = pos - line.from;
      
      // =========================================================================
      // [PROTECTED: ZERO-REGRESSION PERFORMANCE OPTIMIZATION]
      // DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
      // Includes check is incredibly fast natively. Prevents running expensive regex
      // on every micro-movement of the mouse when no snippet exists on the line.
      // =========================================================================
      if (!text.includes('@')) return null;

      // Match @name or @{name with spaces}
      const snipRegex = /(?<![a-zA-Z0-9_.+\-])(?:@[\w-]+(?:\.[\w-]+)*|@\{[^}]+\})/g;

      let match;
      while ((match = snipRegex.exec(text)) !== null) {
        if (relPos >= match.index && relPos < match.index + match[0].length) {
          const raw = match[0];
          const nameMatch = /^@(?:\{([^{}]+)\}|([\w-]+(?:\.[\w-]+)*))/.exec(raw);
          const snipName = nameMatch ? (nameMatch[1] || nameMatch[2]) : raw.substring(1);
          const found = snippets.find(s => s.name === snipName);

          if (!found) return null;

          return {
            pos: line.from + match.index,
            end: line.from + match.index + match[0].length,
            above: true,
            create() {
              let dom = document.createElement("div");
              dom.className = "cm-snippet-tooltip animate-in fade-in zoom-in duration-200";
              dom.textContent = found.content.length > 500 ? found.content.substring(0, 500) + "..." : found.content;
              return { dom };
            }
          };
        }
      }
      return null;
    }),
    leanBaseTheme,
    leanSyntaxHighlighting,
    promptTheme,
    markdown({ extensions: [leanLanguageExt] }), // Enable Atomic Parsing
    html(),
    xml(),
    EditorView.lineWrapping,
    tooltips({ parent: document.body }) // Fix: Prevent popup cutoff by modal overflow
  ], [snippets]);


  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden relative group">
      <div className="flex-1 overflow-hidden font-mono text-sm">
        <CodeMirror
          value={value}
          theme="none"
          height="100%"
          extensions={extensions}
          onChange={stableOnChange}
          className="h-full"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          style={{
            fontSize: '14px'
          }}
        />
      </div>

      {recursionError && (
        <div className="absolute bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="bg-red-500/10 border border-red-500/50 backdrop-blur-md text-red-500 text-xs px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg">
            <span className="animate-pulse">⚠️</span>
            <span className="font-bold">Circular Reference Detected</span>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// [PROTECTED: ZERO-REGRESSION PERFORMANCE — REACT.MEMO SHIELD]
// DO NOT REMOVE OR ALTER WITHOUT EXPLICIT USER CONSENT.
//
// PURPOSE: Prevents inactive step editors from re-rendering when the user
// types in a different step. Without this wrapper, every keystroke triggers
// N heavy CodeMirror re-renders (one per step), causing severe typing lag
// in multi-step prompts (5+ steps).
//
// WHY onChange IS EXCLUDED FROM THE COMPARATOR:
// React generates a new onChange closure on every parent render. Including
// it would make React.memo useless (always re-renders). This is safe because
// PromptEditor stabilizes onChange via onChangeRef (useLayoutEffect pattern).
//
// KNOWN EDGE CASE: When switching to a step with identical content, the first
// keystroke uses handleStepChangeImmediate instead of handleEditorChange.
// This self-corrects after one round-trip (store update → value diverges →
// memo allows re-render → closure refreshes).
//
// REGRESSION RISK: Removing this export wrapper will immediately reintroduce
// the N×CodeMirror re-render cascade on every keystroke.
// DO NOT convert back to: export default function PromptEditor(...)
// DO NOT convert back to: export default PromptEditor
// =========================================================================
export default React.memo(PromptEditor, (prevProps, nextProps) => {
  const snippetsEqual = prevProps.snippets === nextProps.snippets || 
    (prevProps.snippets.length === nextProps.snippets.length && 
     prevProps.snippets.every((s, i) => 
       s.id === nextProps.snippets[i].id && 
       s.name === nextProps.snippets[i].name && 
       s.content === nextProps.snippets[i].content
     ));

  return prevProps.value === nextProps.value &&
         snippetsEqual &&
         prevProps.allowAttachments === nextProps.allowAttachments; // onNotification wird hier explizit ignoriert!
});