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
import { findBestTextInput, findAllElementsDeep } from '../DOMUtils.js';

/**
 * Mistral Strategy: ProseMirror editor with attach button priming.
 */
export class MistralStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Mistral', ['mistral.ai', 'chat.mistral.ai']);
    }

    getInput() {
        // Auth State Guard: If a login modal/form is active, do NOT hijack inputs behind it
        const isLoggedOut = document.querySelector('input[type="password"]') ||
            document.querySelector('form[action*="login" i], form[action*="auth" i]');
        if (isLoggedOut) {
            return null;
        }

        return document.querySelector('.ProseMirror') ||
            document.querySelector('div.ProseMirror') ||
            document.querySelector('input#message') ||
            document.querySelector('textarea') ||
            findBestTextInput();
    }

    async getFileInput() {
        // Try finding visible file input first
        let fileInput = document.querySelector('input[type="file"]');
        if (fileInput) return fileInput;

        // Click attach button to reveal file input
        const attachBtn = document.querySelector('button[aria-label*="attach"]') ||
            document.querySelector('button[aria-label*="Attach"]') ||
            document.querySelector('button[aria-label*="upload"]') ||
            document.querySelector('button[aria-label*="Upload"]') ||
            document.querySelector('button[aria-label*="file"]') ||
            document.querySelector('button[aria-label*="File"]') ||
            document.querySelector('button svg path[d*="M12"]')?.closest('button') ||
            Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent?.toLowerCase().includes('attach') ||
                b.textContent?.toLowerCase().includes('datei') ||
                b.textContent?.toLowerCase().includes('upload'));

        if (attachBtn) {
            attachBtn.click();
            await new Promise(r => setTimeout(r, 400));
        }

        return document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0];
    }

    /**
     * Override verification for Mistral's ProseMirror contenteditable div.
     * ProseMirror updates innerText asynchronously, so the base class
     * polling window (5×200ms) may be too short.
     */
    async verifyInjection(element, text) {
        if (!element) return false;

        if (!element.isConnected) {
            element = this.getInput() || element;
        }

        const normalize = (str) => (str || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[*#_~`>+\-]/g, '') // Strip Markdown auto-formatting
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const expected = normalize(text).substring(0, 15);

        // Fast path: Check immediately with minimal delay (covers the common case)
        await new Promise(r => setTimeout(r, 50));

        const quickCheck = normalize(
            (element.value || "") + " " +
            (element.textContent || "") // Optimized: Use textContent instead of innerText
        );
        if (quickCheck.includes(expected)) return true;

        // Slow path: Patient polling for async framework updates
        for (let i = 0; i < 8; i++) {
            if (i % 2 === 0) {
                await this.triggerHumanSimulation(element);
            }
            await new Promise(r => setTimeout(r, 300));

            const content = normalize(
                (element.value || "") + " " +
                (element.textContent || "") // Optimized: Use textContent instead of innerText
            );

            if (content.includes(expected)) return true;
        }

        return false;
    }

    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        // Method 1 (Primary): Direct <input type="file"> — avoids triggering Mistral's full-screen
        // "Ziehen Sie hier Ihre Dateien..." drag overlay that otherwise stays stuck on screen!
        const targetInput = await this.getFileInput();
        if (targetInput) {
            try {
                const dt = await this._prepareDataTransfer(filesData);
                const proto = window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
                nativeSetter.call(targetInput, dt.files);
                targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                targetInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await new Promise(r => setTimeout(r, 300));
                const editor = this.getInput();
                if (editor) editor.focus();
                return true;
            } catch (e) {
                // Fall through to drop fallback
            }
        }

        // Method 2 (Fallback): Drop on ProseMirror editor + explicit dragleave/dragend cleanup
        const editor = this.getInput();
        if (editor) {
            try {
                const dt = await this._prepareDataTransfer(filesData);
                editor.focus();
                const dropSuccess = this.dispatchDropSequence(editor, dt);
                // Always dismiss any drag overlay opened by dragenter/dragover
                const leaveOpts = { bubbles: true, cancelable: true, composed: true };
                [editor, document.body, window].forEach(t => {
                    try {
                        t.dispatchEvent(new DragEvent('dragleave', leaveOpts));
                        t.dispatchEvent(new DragEvent('dragend', leaveOpts));
                    } catch { /* ignore */ }
                });
                if (dropSuccess) {
                    await new Promise(r => setTimeout(r, 500));
                    return true;
                }
            } catch (e) { }
        }

        return false;
    }
}
