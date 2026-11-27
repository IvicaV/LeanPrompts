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
import { AbstractBaseStrategy } from './AbstractBaseStrategy.js';
import { findBestTextInput, waitForElement, findAllElementsDeep } from '../DOMUtils.js';

/**
 * Perplexity Strategy: Slate.js / Lexical editor with Zero-Reflow discovery
 * and single-target file injection (prevents duplicate uploads).
 */
export class PerplexityStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Perplexity', ['perplexity.ai']);
    }

    getInput() {
        // 1. Direct Slate / Lexical / Ask-Input fast selectors
        const direct = document.querySelector('[data-slate-editor="true"][contenteditable="true"]') ||
            document.querySelector('[data-lexical-editor="true"][contenteditable="true"]') ||
            document.querySelector('div#ask-input[contenteditable="true"]') ||
            document.querySelector('textarea:not([style*="display: none"])');
        if (direct && (direct.offsetWidth > 0 || direct.offsetHeight > 0)) {
            return direct;
        }

        // 2. Smart heuristic fallback
        const currentInput = findBestTextInput();
        if (currentInput) return currentInput;

        // 3. Activation layer (Zero-Reflow: textContent instead of innerText)
        const placeholder = document.querySelector('div.bg-background .text-text-300') ||
            document.querySelector('div[placeholder*="Ask"]') ||
            Array.from(document.querySelectorAll('div')).find(d => {
                if (d.children.length > 0) return false;
                const t = (d.textContent || '').trim();
                return t === 'Ask anything...' || t === 'Frag irgendetwas ...';
            });

        if (placeholder && !placeholder.dataset.lpClicked) {
            placeholder.click();
            placeholder.dataset.lpClicked = "true";
            return null;
        }

        return document.querySelector('div#ask-input') || null;
    }

    async getFileInput() {
        const existingInput = document.querySelector('input[type="file"]');
        if (existingInput) return existingInput;

        const attachBtn = document.querySelector('button[aria-label*="Attach" i]') ||
            document.querySelector('button[aria-label*="Anhängen" i]') ||
            document.querySelector('div[aria-label*="Attach" i]') ||
            Array.from(document.querySelectorAll('button')).find(b => {
                const t = (b.textContent || '').trim();
                return t === 'Attach' || t === 'Anhängen';
            });

        if (attachBtn) {
            attachBtn.click();
            const fileInput = await waitForElement(() =>
                document.querySelector('input[type="file"]'),
                2000
            );
            if (fileInput) return fileInput;
        }

        return findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0] || null;
    }

    async injectText(element, text) {
        if (!text) return false;

        // Find active Slate or Lexical editor (re-fetch if detached)
        let editor = (element && element.isConnected) ? element : this.getInput();
        if (editor && !editor.hasAttribute('data-slate-editor') && !editor.hasAttribute('data-lexical-editor')) {
            const richEditor = document.querySelector('[data-slate-editor="true"], [data-lexical-editor="true"]');
            if (richEditor && richEditor.isConnected) editor = richEditor;
        }
        if (!editor) return false;

        editor.focus();
        try { editor.click(); } catch (e) { }
        await new Promise(resolve => setTimeout(resolve, 100));

        const isLexical = editor.getAttribute('data-lexical-editor') === 'true';

        // Place caret INSIDE the inner <p> node for Lexical (collapsing on the root div causes Lexical to ignore paste!)
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            const targetNode = (isLexical && editor.querySelector('p')) || editor;
            range.selectNodeContents(targetNode);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (e) { }

        // Construct HTML payload
        const lines = text.split('\n');
        const htmlContent = lines.map(line => {
            if (line.trim() === '') return '<p><br></p>';
            const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<p>${safeLine}</p>`;
        }).join('');

        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        dataTransfer.setData('text/html', htmlContent);

        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clipboardData: dataTransfer
        });

        editor.dispatchEvent(pasteEvent);

        // Only dispatch synthetic insertFromPaste InputEvent for legacy Slate (on Lexical, data: null triggers empty reconciliation!)
        if (!isLexical) {
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: false,
                composed: true,
                inputType: 'insertFromPaste',
                data: null
            }));
        }

        // Fast Zero-Reflow verification (compare first non-empty line so <p>/<div> line breaks never mismatch textContent)
        await new Promise(r => setTimeout(r, 80));
        if (!editor.isConnected) editor = this.getInput() || editor;
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const firstLine = text.split('\n').find(l => l.trim()) || text;
        const snippet = norm(firstLine).slice(0, 15);
        if (snippet.length < 3 || norm(editor.value ?? editor.textContent).includes(snippet)) {
            return true;
        }

        // Lexical/Fallback: beforeinput (Lexical's native text ingestion hook) + execCommand('insertText')
        try {
            editor.focus();
            editor.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                composed: true,
                inputType: 'insertText',
                data: text
            }));
            await new Promise(r => setTimeout(r, 50));
            if (norm(editor.value ?? editor.textContent).includes(snippet)) {
                return true;
            }
            document.execCommand('insertText', false, text);
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
        } catch (e) { }

        await new Promise(r => setTimeout(r, 60));
        return norm(editor.value ?? editor.textContent).includes(snippet);
    }

    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        const dt = new DataTransfer();
        for (const f of filesData) {
            const response = await fetch(f.data);
            const blob = await response.blob();
            const mime = f.type || "application/octet-stream";
            dt.items.add(new File([blob], f.name, { type: mime, lastModified: Date.now() }));
        }

        let targetInput = await this.getFileInput();
        if (!targetInput) {
            const attachBtns = findAllElementsDeep(document, el => {
                if (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false;
                const text = (el.textContent || "").trim().toLowerCase();
                const aria = (el.getAttribute('aria-label') || "").toLowerCase();
                return aria.includes('attach') || aria.includes('anhängen') || text === 'attach' || text === 'anhängen';
            });

            const bestBtn = attachBtns[attachBtns.length - 1];
            if (bestBtn) {
                bestBtn.click();
                await new Promise(r => setTimeout(r, 400));
                targetInput = await waitForElement(() =>
                    document.querySelector('input[type="file"]') ||
                    findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0],
                    2000
                );
            }
        }

        if (!targetInput) return false;

        // Single-target dispatch (prevents duplicate uploads if multiple file inputs exist)
        try {
            const proto = window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
            nativeSetter.call(targetInput, dt.files);
            targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            targetInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            targetInput.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
            await new Promise(r => setTimeout(r, 500));
            return true;
        } catch (e) {
            return false;
        }
    }
}
