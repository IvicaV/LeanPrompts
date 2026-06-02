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
 * Perplexity Strategy: Slate.js editor with specialized text/file injection.
 */
export class PerplexityStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Perplexity', ['perplexity.ai']);
    }

    getInput() {
        // SMART SEARCH: Find visible input first
        const currentInput = findBestTextInput();
        if (currentInput) return currentInput;

        // ACTIVATION LAYER: Click placeholder if found
        const placeholder = document.querySelector('div.bg-background .text-text-300') ||
            document.querySelector('div[placeholder*="Ask"]') ||
            Array.from(document.querySelectorAll('div')).find(d => d.innerText === 'Ask anything...' || d.innerText === 'Frag irgendetwas ...');

        if (placeholder) {
            if (!placeholder.dataset.lpClicked) {
                placeholder.click();
                placeholder.dataset.lpClicked = "true";
                return null;
            }
        }

        return document.querySelector('div#ask-input') ||
            document.querySelector('textarea:not([style*="display: none"])');
    }

    async getFileInput() {
        const existingInput = document.querySelector('input[type="file"]');
        if (existingInput) return existingInput;

        const attachBtn = document.querySelector('button[aria-label="Attach"]') ||
            document.querySelector('button[aria-label="Anhängen"]') ||
            document.querySelector('div[aria-label="Attach"]') ||
            Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Attach' || b.innerText === 'Anhängen');

        if (attachBtn) {
            attachBtn.click();
            const fileInput = await waitForElement(() =>
                document.querySelector('input[type="file"]'),
                2000
            );
            if (fileInput) return fileInput;
        }

        return findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0];
    }

    async injectText(element, text) {
        if (!element || !text) return false;

        // Find Slate editor
        let editor = element;
        if (!element.hasAttribute('data-slate-editor')) {
            const slateEditor = document.querySelector('[data-slate-editor="true"]');
            if (slateEditor) editor = slateEditor;
        }
        if (!editor) return false;

        editor.focus();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Set selection to end
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (e) { }

        // Construct HTML payload
        const lines = text.split('\n');
        let htmlContent = lines.map(line => {
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
        editor.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: false,
            composed: true,
            inputType: 'insertFromPaste',
            data: null
        }));

        return true;
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

        let fileInputs = findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file');

        if (fileInputs.length === 0) {
            const attachBtns = findAllElementsDeep(document, el => {
                if (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false;
                const text = (el.innerText || "").toLowerCase();
                const aria = (el.getAttribute('aria-label') || "").toLowerCase();
                return aria.includes('attach') || aria.includes('anhängen') || text === 'attach' || text === 'anhängen';
            });

            const bestBtn = attachBtns[attachBtns.length - 1];
            if (bestBtn) {
                bestBtn.click();
                await new Promise(r => setTimeout(r, 500));
                const newInput = await waitForElement(() =>
                    findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0],
                    2000
                );
                if (newInput) fileInputs = [newInput];
            }
        }

        if (fileInputs.length === 0) return false;

        let success = false;
        for (const input of fileInputs) {
            try {
                const proto = window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
                nativeSetter.call(input, dt.files);
                input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
                success = true;
            } catch (e) { }
        }

        if (success) await new Promise(r => setTimeout(r, 700));
        return success;
    }
}
