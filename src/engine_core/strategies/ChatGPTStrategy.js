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
import { findBestTextInput, waitForElement } from '../DOMUtils.js';

/**
 * ChatGPT Strategy: Isolated adapter for chatgpt.com.
 */
export class ChatGPTStrategy extends AbstractBaseStrategy {
    constructor() {
        super('ChatGPT', ['chatgpt.com', 'chat.openai.com']);
    }

    /**
     * Resilient input discovery for ChatGPT (2025/2026).
     * Never depends solely on #prompt-textarea so ID changes or ProseMirror refactors
     * never break getInput() or silently abort injectFiles().
     */
    getInput() {
        const isVisible = (el) => {
            if (!el || !el.isConnected) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const selectors = [
            '#prompt-textarea',
            '[data-testid="prompt-textarea"]',
            'div.ProseMirror[contenteditable="true"]',
            'form [contenteditable="true"][role="textbox"]',
            'form div[contenteditable="true"]',
            'textarea[name="prompt-textarea"]'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) return el;
        }

        return findBestTextInput();
    }

    /**
     * Selects the generic multi-file upload input while ignoring image/video-only inputs.
     * Survives React useId() hash IDs (e.g. _r_n_ image/* vs _r_m_ accept="" multiple=true).
     */
    getFileInput() {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
            .filter(el => !(el.id && el.id.toLowerCase().includes('upload-photo')));

        if (inputs.length === 0) {
            return document.querySelector('input[type="file"]');
        }

        const isGenericAccept = (el) => {
            const acc = (el.getAttribute('accept') || '').trim().toLowerCase();
            return acc === '' || acc === '*/*' || acc.includes('*/*');
        };

        // 1. Best match: generic accept ("" or "*/*") + multiple (ChatGPT's main file uploader)
        const genericMultiple = inputs.find(el => isGenericAccept(el) && el.multiple);
        if (genericMultiple) return genericMultiple;

        // 2. Generic accept ("" or "*/*")
        const genericSingle = inputs.find(el => isGenericAccept(el));
        if (genericSingle) return genericSingle;

        // 3. Any multiple-file input
        const anyMultiple = inputs.find(el => el.multiple);
        if (anyMultiple) return anyMultiple;

        // 4. Fallback
        return inputs[0];
    }

    /**
     * Override injectText to apply a Focus Boost, guard against detached elements
     * after React hydration / file upload, and verify text actually landed before
     * returning true (never emit a false-positive "Text injected" toast).
     */
    async injectText(element, text) {
        if (!text) return false;

        // Re-fetch #prompt-textarea if React hydration replaced the DOM node (e.g. during Ctrl+Click or after injectFiles)
        if (!element || !element.isConnected) {
            element = this.getInput();
        }
        if (!element) return false;

        // ChatGPT / ProseMirror Focus Boost
        element.focus();
        try { element.click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 150));

        // Re-check connection after focus delay (hydration race protection)
        if (!element.isConnected) {
            element = this.getInput();
            if (!element) return false;
            element.focus();
        }

        // Set selection to end to ensure paste/execCommand targets the right place
        if (element.isContentEditable || element.tagName === 'DIV' || element.id === 'prompt-textarea') {
            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(element);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) { }
        }

        const hasInjectedText = (el) => {
            if (!el || !el.isConnected) return false;
            const norm = (s) => (s || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            const firstLine = text.split('\n').find(l => l.trim()) || text;
            const snippet = norm(firstLine).slice(0, 15);
            if (snippet.length < 3) return norm(el.value ?? el.textContent).length > 0;
            return norm(el.value ?? el.textContent).includes(snippet);
        };

        // ChatGPT ProseMirror: Optimized Plain-Text Paste Implementation
        if (element.isContentEditable || element.id === 'prompt-textarea') {
            element.focus();

            try {
                // Dispatch native paste event with ONLY plain text.
                // ProseMirror's internal plain-text parser is highly optimized for huge documents
                // and natively formats \n into block nodes instantly without React freezing.
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', text);

                element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dataTransfer }));

                // CRITICAL for Opera: The paste event must be immediately followed by an input event 
                // for the Chromium engine to trigger the framework's internal synthetic event validation.
                element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, inputType: 'insertFromPaste' }));
            } catch (e) { }

            // Single fast Zero-Reflow check (80ms) — avoids aggressive polling loops while preventing
            // false-positive "Text injected" toasts when ProseMirror wasn't hydrated yet.
            await new Promise(r => setTimeout(r, 80));
            if (!element.isConnected) element = this.getInput() || element;
            if (hasInjectedText(element)) {
                return true;
            }

            // Fallback: execCommand('insertText') if ProseMirror ignored synthetic paste during early hydration
            try {
                element.focus();
                document.execCommand('insertText', false, text);
                element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text }));
            } catch (e2) { }

            await new Promise(r => setTimeout(r, 80));
            if (!element.isConnected) element = this.getInput() || element;
            return hasInjectedText(element);
        }

        // Non-contenteditable fallback (unlikely for ChatGPT)
        return await super.injectText(element, text);
    }

    /**
     * Override base verification: ChatGPT ProseMirror is too complex/asynchronous for simple innerText checks.
     * The base class retry-loop with human simulations causes extreme lag (1+ minutes).
     * We override it to be completely silent and passive.
     */
    async verifyInjection(element, text) {
        return true;
    }

    /**
     * Specialized file injection for ChatGPT.
     *
     * Approach: Composer-Scoped DOM Priming + Generic Multi-File Input + Change Event
     * 1. Wait briefly for #prompt-textarea if hydrating (e.g. after Ctrl+Click)
     * 2. Click composer-scoped attachment/+ button (never sidebar "New project" button!)
     * 3. Select the generic multi-file input (empty or wildcard accept, multiple=true)
     * 4. Native file input manipulation + change/input events
     */
    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        let textarea = this.getInput();
        if (!textarea) {
            textarea = await waitForElement(() => this.getInput(), 2500);
        }

        try {
            if (textarea) {
                // Activation
                textarea.focus();
                textarea.click();
                await new Promise(r => setTimeout(r, 100));
            }

            // Scope button search strictly to the composer form so sidebar buttons
            // (e.g. "Neues Projekt hinzufügen") are NEVER accidentally clicked!
            const composerRoot = (textarea && (textarea.closest('form') || textarea.parentElement?.parentElement?.parentElement)) || document;

            const attachBtn = composerRoot.querySelector('button[data-testid="composer-plus-btn"]') ||
                composerRoot.querySelector('button[data-testid="attach-button"]') ||
                composerRoot.querySelector('button[aria-label*="Dateien" i]') ||
                composerRoot.querySelector('button[aria-label*="files" i]') ||
                composerRoot.querySelector('button[aria-label*="Attach" i]') ||
                composerRoot.querySelector('button[aria-label*="Anhängen" i]') ||
                // Fallback inside composer only: button with plus/clip SVG
                Array.from(composerRoot.querySelectorAll('button')).find(b =>
                    b.innerHTML.includes('path') &&
                    (b.innerHTML.includes('M12 5v14') || b.innerHTML.includes('clip') || b.innerHTML.includes('attach'))
                );

            if (attachBtn) {
                attachBtn.click();
                await waitForElement(() => {
                    const input = this.getFileInput();
                    return (input && input.isConnected) ? input : null;
                }, 2000);
            }

            // Find generic multi-file input after priming
            let fileInput = this.getFileInput();
            if (!fileInput) {
                fileInput = await waitForElement(() => this.getFileInput(), 2000);
            }

            if (!fileInput) {
                console.error("LeanPrompts: ChatGPT file input not found after priming");
                return false;
            }

            const dt = await this._prepareDataTransfer(filesData);

            // Native file input manipulation
            const proto = window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
            nativeSetter.call(fileInput, dt.files);

            // Dispatch change and input events
            fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

            // Wait for React to ingest the FileList
            await new Promise(r => setTimeout(r, 400));

            // Close any menu opened by the + button cleanly via Escape + refocus
            try {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            } catch (e) { }
            const closeBtn = document.querySelector('button[aria-label="Close"]');
            if (closeBtn) closeBtn.click();

            // Refocus textarea (re-fetch if React re-rendered during upload)
            const freshTextarea = this.getInput() || textarea;
            if (freshTextarea && freshTextarea.isConnected) {
                freshTextarea.focus();
            }

            return true;
        } catch (e) {
            console.error("ChatGPT file injection failed", e);
            return false;
        }
    }
}
