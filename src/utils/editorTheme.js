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
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const leanBaseTheme = EditorView.theme({
  "&": { color: "var(--text-main)", backgroundColor: "transparent" },
  ".dark &": { backgroundColor: "#131316" },
  ".cm-content": { caretColor: "var(--primary)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--selection-bg, rgba(168, 85, 247, 0.4)) !important",
    borderRadius: "2px"
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionMatch": { backgroundColor: "var(--primary-subtle)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    borderRight: "1px solid var(--border-main)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-main)",
    fontWeight: "bold"
  }
});

export const leanSyntaxHighlighting = syntaxHighlighting(HighlightStyle.define([
  // 1. Struktur & Markdown Basics
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6, tags.heading], color: "var(--hl-heading)", fontWeight: "bold" },
  { tag: tags.strong, color: "var(--text-main)", fontWeight: "bold" },
  { tag: tags.emphasis, color: "var(--text-main)", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.list, color: "var(--text-main)" },
  
  // 2. Links & Zitate
  { tag: tags.link, color: "var(--hl-link)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--hl-url)" },
  { tag: tags.quote, color: "var(--hl-quote)", fontStyle: "italic" },

  // 3. XML/HTML Tags (Extrem wichtig für Claude Prompts: <context>, <system>)
  { tag: [tags.angleBracket, tags.tagName], color: "var(--hl-xml-tag)" },
  { tag: tags.attributeName, color: "var(--hl-xml-attr)" },
  
  // 4. Code Blocks & Trennlinien
  { tag: tags.monospace, color: "var(--hl-code)" },
  { tag: tags.contentSeparator, color: "var(--hl-hr)", fontWeight: "bold" }
]));
