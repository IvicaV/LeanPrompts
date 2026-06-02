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
import { findBestTextInput, findAllElementsDeep, waitForElement } from '../DOMUtils.js';

/**
 * ChatGPT Strategy: Isolated adapter for chatgpt.com.
 */
export class ChatGPTStrategy extends AbstractBaseStrategy {
    constructor() {
        super('ChatGPT', ['chatgpt.com', 'chat.openai.com']);
    }

    getInput() {
        return document.querySelector('#prompt-textarea');
    }

    getFileInput() {
        return document.querySelector('input[type="file"]:not([id*="upload-photo"])') ||
            document.querySelector('input[type="file"]');
    }

    /**
     * Override injectText to apply a Focus Boost.
     * ChatGPT's ProseMirror editor sometimes loses selection state or requires 
     * explicit focus/range setting before accepting execCommand('insertText').
     */
    async injectText(element, text) {
        if (!element || !text) return false;

        // ChatGPT / ProseMirror Focus Boost
        element.focus();
        try { element.click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 150));

        // Set selection to end to ensure execCommand targets the right place
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

        // ChatGPT ProseMirror: Native Data-PM-Slice Paste Implementation
        // Verified to work by simulating the exact internal clipboard structure 
        // ProseMirror uses when copying/pasting rich text between editors.
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
            } catch (e) { 
                // Fallback to direct text insertion if clipboard event fails
                try { document.execCommand('insertText', false, text); } catch (e2) {}
                await this.triggerHumanSimulation(element);
            }
            
            // We do NOT call `this.verifyInjection(element, text)` here anymore.
            // Aggressive verification loop clashes with ProseMirror's async parsing.
            return true;
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
        // Always return true to prevent AbstractBaseStrategy fallbacks or UI error popups.
        // We removed console.warn to ensure LeanPrompts' global error handler doesn't trigger a fatal UI overlay.
        return true;
    }

    /**
     * Specialized file injection for ChatGPT.
     * 
     * Approach: DOM Priming + Native Input Manipulation + Change Event
     * 1. Click attachment button to prime the DOM
     * 2. Wait for file input to become active
     * 3. Native file input manipulation
     * 4. Change event to trigger handler
     */
    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        const textarea = this.getInput();
        if (!textarea) return false;

        try {
            // Activation
            textarea.focus();
            textarea.click();
            await new Promise(r => setTimeout(r, 100));

            // DOM Priming: Click the attachment/plus button to activate file handling
            const attachBtn = document.querySelector('button[aria-label*="Attach"]') ||
                document.querySelector('button[aria-label*="Anhängen"]') ||
                document.querySelector('button[aria-label*="attach"]') ||
                document.querySelector('button[data-testid="attach-button"]') ||
                // Fallback: Find button with paperclip/attachment icon
                Array.from(document.querySelectorAll('button')).find(b =>
                    b.innerHTML.includes('path') &&
                    (b.innerHTML.includes('M12 5v14') || b.innerHTML.includes('clip') || b.innerHTML.includes('attach'))
                );

            if (attachBtn) {
                attachBtn.click();
                // Smart Wait: Wait for the file input to appear/become interactive
                // This replaces the fixed 300ms sleep which can fail on slow devices
                await waitForElement(() => {
                    const input = this.getFileInput();
                    return (input && input.isConnected) ? input : null;
                }, 3000);
            }

            // Find file input after priming
            let fileInput = this.getFileInput();
            if (!fileInput) {
                // Double check with explicit wait if not found immediately
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

            // Wait for processing
            await new Promise(r => setTimeout(r, 500));

            // Close any menu that might have opened from the attach button click
            // Use specific close button if possible, or body click
            const closeBtn = document.querySelector('button[aria-label="Close"]') || document.body;
            closeBtn.click();

            // Refocus textarea
            textarea.focus();

            return true;
        } catch (e) {
            console.error("ChatGPT file injection failed", e);
            return false;
        }
    }
}
