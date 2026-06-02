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
    }

    getInput() {
        // First: Try to find the ProseMirror editor (the REAL input)
        const proseMirror = document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') ||
            document.querySelector('.ProseMirror[contenteditable="true"]') ||
            document.querySelector('div.tiptap[contenteditable="true"]');

        if (proseMirror) {
            console.log('[LeanPrompts Grok] Found ProseMirror editor');
            return proseMirror;
        }

        // Fallback: Find and click the textarea/wrapper to activate ProseMirror
        const textarea = document.querySelector('textarea.w-full') ||
            document.querySelector('textarea[placeholder]') ||
            document.querySelector('textarea');

        if (textarea) {
            console.log('[LeanPrompts Grok] Found TEXTAREA, clicking to activate ProseMirror');
            textarea.click();
            textarea.focus();

            // Check again for ProseMirror after activation
            const activated = document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') ||
                document.querySelector('.ProseMirror[contenteditable="true"]');

            if (activated) {
                console.log('[LeanPrompts Grok] ProseMirror activated after click');
                return activated;
            }

            // If still no ProseMirror, return the textarea
            return textarea;
        }

        // Ultimate fallback
        return document.querySelector('div[role="textbox"]') ||
            document.querySelector('div[contenteditable="true"]') ||
            findBestTextInput();
    }

    async getFileInput() {
        return await waitForElement(() =>
            document.querySelector('input[type="file"].hidden') ||
            document.querySelector('input[type="file"][data-testid="fileInput"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0]
            , 3000);
    }

    /**
     * Text injection - handles both ProseMirror and TEXTAREA.
     */
    async injectText(element, text) {
        if (!element || !text) return false;

        console.log('[LeanPrompts Grok] injectText called with:', element.tagName, 'contentEditable:', element.isContentEditable);

        // If we got a TEXTAREA, try to find and use ProseMirror instead
        if (element.tagName === 'TEXTAREA') {
            element.click();
            element.focus();
            await new Promise(r => setTimeout(r, 300));

            const proseMirror = document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') ||
                document.querySelector('.ProseMirror[contenteditable="true"]');

            if (proseMirror) {
                console.log('[LeanPrompts Grok] Switching to ProseMirror after TEXTAREA activation');
                element = proseMirror;
            }
        }

        element.focus();
        await new Promise(r => setTimeout(r, 100));

        // ContentEditable (ProseMirror) - use paste simulation
        if (element.isContentEditable) {
            console.log('[LeanPrompts Grok] Using paste for ContentEditable');

            // Prepare HTML content with paragraphs
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

            console.log('[LeanPrompts Grok] Paste dispatched to ContentEditable');
            return true;
        }

        // TEXTAREA - use native setter with React's _valueTracker hack
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            console.log('[LeanPrompts Grok] Using native setter with React valueTracker hack');
            try {
                const prototype = element.tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;

                // Reset React's value tracker to force it to see the change
                const tracker = element._valueTracker;
                if (tracker) {
                    tracker.setValue('');
                }

                nativeSetter.call(element, text);

                // Dispatch comprehensive events
                // Grok/X.ai React Fiber often listens to 'beforeinput' to initialize state buffers
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

                console.log('[LeanPrompts Grok] Native setter with React hack applied');
                return true;
            } catch (e) {
                console.log('[LeanPrompts Grok] Error:', e);
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }

        return super.injectText(element, text);
    }
}
