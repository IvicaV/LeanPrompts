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
 * Grok Strategy: grok.com integration.
 * Grok has a layered UI - TEXTAREA is visible but ProseMirror is the real input.
 * We need to click/focus first to activate the ProseMirror editor.
 */
export class GrokStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Grok', ['grok.com', 'x.com']);
        this._lastFileDeepScan = 0;
    }

    getInput() {
        // 0. Auth State Guard: If a login modal/form is active, do NOT hijack inputs behind it
        const isLoggedOut = document.querySelector('input[type="password"]') ||
            document.querySelector('form[action*="login" i], form[action*="auth" i]') ||
            document.querySelector('[role="dialog"] a[href*="accounts.x.ai"], [role="dialog"] input[type="email"]');

        if (isLoggedOut) {
            return null;
        }

        const isVisible = (el) => {
            if (!el || !el.isConnected) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        // First: Try to find the visible ProseMirror editor (the REAL input)
        const proseSelectors = [
            'div.tiptap.ProseMirror[contenteditable="true"]',
            '.ProseMirror[contenteditable="true"]',
            'div.tiptap[contenteditable="true"]'
        ];
        for (const sel of proseSelectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) return el;
        }

        // Fallback: Find and click a VISIBLE textarea/wrapper to activate ProseMirror
        const textareaSelectors = ['textarea.w-full', 'textarea[placeholder]', 'textarea'];
        let textarea = null;
        for (const sel of textareaSelectors) {
            const matches = document.querySelectorAll(sel);
            for (const candidate of matches) {
                if (isVisible(candidate)) {
                    textarea = candidate;
                    break;
                }
            }
            if (textarea) break;
        }

        if (textarea) {
            textarea.click();
            textarea.focus();

            const activated = document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') ||
                document.querySelector('.ProseMirror[contenteditable="true"]');

            if (isVisible(activated)) {
                return activated;
            }
            return textarea;
        }

        const genericEditable = document.querySelector('div[role="textbox"]') ||
            document.querySelector('div[contenteditable="true"]');
        if (isVisible(genericEditable)) return genericEditable;

        return findBestTextInput();
    }

    async getFileInput() {
        return await waitForElement(() => {
            const direct = document.querySelector('input[type="file"].hidden') ||
                document.querySelector('input[type="file"][data-testid="fileInput"]') ||
                document.querySelector('input[type="file"]');
            if (direct) return direct;

            const now = Date.now();
            if (now - this._lastFileDeepScan < 400) return null;
            this._lastFileDeepScan = now;

            return findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0] || null;
        }, 3000);
    }

    /**
     * Text injection - handles both ProseMirror and TEXTAREA with hydration & verification guards.
     */
    async injectText(element, text) {
        if (!text) return false;

        if (!element || !element.isConnected) {
            element = this.getInput();
        }
        if (!element) return false;

        // If we got a TEXTAREA, try to find and use ProseMirror instead
        if (element.tagName === 'TEXTAREA') {
            element.click();
            element.focus();
            await new Promise(r => setTimeout(r, 300));

            const proseMirror = document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') ||
                document.querySelector('.ProseMirror[contenteditable="true"]');

            if (proseMirror && proseMirror.isConnected) {
                element = proseMirror;
            }
        }

        if (!element.isConnected) {
            element = this.getInput();
            if (!element) return false;
        }

        element.focus();
        await new Promise(r => setTimeout(r, 100));

        // ContentEditable (ProseMirror) - use paste simulation + verification fallback
        if (element.isContentEditable) {
            const lines = text.split('\n');
            const htmlContent = lines.map(line =>
                line.trim() === '' ? '<p><br></p>' : `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
            ).join('');

            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', text);
            dataTransfer.setData('text/html', htmlContent);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dataTransfer
            });

            element.dispatchEvent(pasteEvent);
            element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));

            await new Promise(r => setTimeout(r, 80));
            if (!element.isConnected) element = this.getInput() || element;
            const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const firstLine = text.split('\n').find(l => l.trim()) || text;
            const snippet = norm(firstLine).slice(0, 15);
            if (snippet.length < 3 || norm(element.textContent).includes(snippet)) {
                return true;
            }

            try {
                element.focus();
                document.execCommand('insertText', false, text);
                element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
            } catch (e) { }

            await new Promise(r => setTimeout(r, 60));
            return norm(element.textContent).includes(snippet);
        }

        // TEXTAREA - use native setter with React's _valueTracker hack
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            try {
                const prototype = element.tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;

                const tracker = element._valueTracker;
                if (tracker) {
                    tracker.setValue('');
                }

                nativeSetter.call(element, text);

                const beforeInputEvent = new InputEvent('beforeinput', {
                    bubbles: true,
                    composed: true,
                    inputType: 'insertText',
                    data: text,
                    isComposing: false
                });
                element.dispatchEvent(beforeInputEvent);

                element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
                return true;
            } catch (e) {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }

        return super.injectText(element, text);
    }
}
