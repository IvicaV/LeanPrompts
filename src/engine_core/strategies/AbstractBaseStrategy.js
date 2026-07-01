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
import { findBestTextInput, waitForElement } from '../DOMUtils.js';

/**
 * Abstract Base Class for LLM Injection Strategies.
 * Covers the "Contract" and "Shared Kernel".
 */
export class AbstractBaseStrategy {
    constructor(name, domains) {
        this.name = name;
        this.domains = domains;
    }

    /**
     * CONTRACT: Is this strategy responsible for the current site?
     */
    detect(url) {
        return this.domains.some(domain => url.includes(domain));
    }

    /**
     * CONTRACT: Is the UI ready?
     */
    async isReady() {
        return !!(await this.getInput());
    }

    /**
     * CONTRACT: Find the primary text input.
     * Default implementation uses findBestTextInput heuristics.
     */
    getInput() {
        return findBestTextInput();
    }

    /**
     * CONTRACT: Find the file upload input.
     */
    getFileInput() {
        return document.querySelector('input[type="file"]');
    }

    /**
     * SHARED KERNEL: Simulates a sequence of events to trigger framework state updates.
     * Fires keydown -> input -> keyup with appropriate delays.
     */
    async triggerHumanSimulation(element) {
        if (!element) return;
        const events = ['keydown', 'keypress', 'input', 'keyup', 'change'];
        for (const type of events) {
            element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true }));
            // Tiny jitter to satisfy some throttle logics
            if (type === 'input') await new Promise(r => setTimeout(r, 20));
        }
    }

    /**
     * CONTRACT: Inject text into the target element.
     * Shared Kernel logic for standard inputs and textareas.
     */
    async injectText(element, text) {
        if (!element || !text) return false;

        element.focus();
        await new Promise(r => setTimeout(r, 100));

        if (!document.body.contains(element)) {
            element = this.getInput() || element;
        }

        let success = false;

        // Hilfsfunktion zur Text-Normalisierung für den schnellen Vergleich
        const normalizeText = (t) => (t || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[*#_~`>+\-]/g, '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        // PFAD A: Rich-Text-Editoren (ContentEditable)
        if (element.isContentEditable) {
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', text);
                
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                element.dispatchEvent(pasteEvent);
                
                element.dispatchEvent(new InputEvent('input', { 
                    bubbles: true, 
                    cancelable: true, 
                    composed: true, 
                    inputType: 'insertFromPaste' 
                }));
                
                // Kurze Pause für asynchrone Framework-Zustandsänderungen
                await new Promise(r => setTimeout(r, 50));

                const expected = normalizeText(text).substring(0, 10);
                const currentContent = normalizeText(element.value || element.textContent || "");
                if (expected.length < 3 || currentContent.includes(expected)) {
                    success = true;
                }
            } catch (e) { }

            // Fallback 1: execCommand (unser bewährter Standard)
            if (!success) {
                try {
                    success = document.execCommand('insertText', false, text);
                } catch (e) { }
            }

            // Fallback 2: Roher Text-Ersatz
            if (!success) {
                try {
                    element.textContent = text;
                    success = true;
                } catch (e) { }
            }
        }
        // PFAD B: Standard-Textareas und Inputs (z. B. Deepseek, AI Studio)
        else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            let newValue = text;
            let newCursorPos = text.length;
            let start = 0;
            let end = 0;
            let supportsSelection = false;

            try {
                start = element.selectionStart;
                end = element.selectionEnd;
                // Prüfen, ob das Element Selektionen unterstützt (z.B. nicht bei input[type="email"])
                supportsSelection = typeof start === 'number' && typeof end === 'number';
            } catch (e) { }

            // Option 1: Native Property Setter (schnell, umgeht React-Sperren)
            try {
                const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                
                if (element._valueTracker) {
                    element._valueTracker.setValue('');
                }
                
                if (supportsSelection) {
                    const val = element.value || "";
                    newValue = val.substring(0, start) + text + val.substring(end);
                    newCursorPos = start + text.length;
                }
                
                nativeSetter.call(element, newValue);
                
                if (element.value === newValue) {
                    success = true;
                }

                // Cursor-Position separat setzen, damit Fehler hier nicht das "success" verhindern
                if (success && supportsSelection) {
                    try {
                        element.selectionStart = element.selectionEnd = newCursorPos;
                    } catch (e) { }
                }
            } catch (e) { }

            // Option 2: Direkte Zuweisung (Fallback)
            if (!success) {
                try {
                    if (supportsSelection) {
                        const val = element.value || "";
                        newValue = val.substring(0, start) + text + val.substring(end);
                        newCursorPos = start + text.length;
                    }
                    element.value = newValue;
                    if (element.value === newValue) {
                        success = true;
                    }
                    if (success && supportsSelection) {
                        try {
                            element.selectionStart = element.selectionEnd = newCursorPos;
                        } catch (e) { }
                    }
                } catch (e) { }
            }

            // Sync-Events feuern
            if (success) {
                element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            } else {
                // Letzter Not-Fallback (execCommand)
                try {
                    success = document.execCommand('insertText', false, text);
                } catch (e) { }
            }
        }

        // TRIGGER EVENT-HEARTBEAT
        if (success) {
            await this.triggerHumanSimulation(element);
            this.verifyInjection(element, text);
            return true;
        }

        return false;
    }

    async verifyInjection(element, text) {
        if (!element) return false;

        // PROTECTION: Small initial delay for fast systems
        await new Promise(r => setTimeout(r, 150));

        if (!document.body.contains(element)) {
            element = this.getInput() || element;
        }

        const normalizeText = (t) => (t || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove hidden Zero-Width markers
            .replace(/[*#_~`>+\-]/g, '')           // Strip Markdown chars that might be consumed by auto-formatting
            .replace(/\u00A0/g, ' ')               // Normalize NBSP
            .replace(/\s+/g, ' ')                  // Normalize multi-whitespace
            .trim()
            .toLowerCase();

        // Einmalige Berechnung vor der Schleife spart wertvolle CPU-Zyklen bei großen Prompts
        const expected = normalizeText(text).substring(0, 10);

        // We give the framework up to 1 second to accept the value (5 polls of 200ms)
        for (let i = 0; i < 5; i++) {
            // Optimiert: Nutzung von textContent zur Vermeidung von Layout-Reflows
            const content = normalizeText(element.value || element.textContent || "");

            // Refuse success if verification string is too short/empty (avoids false-positives)
            if (expected.length < 3) return true; // Too short to verify reliably, assume success
            if (content.includes(expected)) return true;

            // If framework hasn't accepted it, simulate another human-like interaction to "wake" it up
            if (i < 4) {
                await this.triggerHumanSimulation(element);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.warn(`LeanPrompts: Verification failed. Expected part of: "${text.substring(0, 20)}..." but found: "${(element.value || element.textContent || "").substring(0, 30)}..."`);
        return false;
    }

    /**
     * CONTRACT: Inject files via DataTransfer objects.
     */
    async injectFiles(filesData) {
        // Base implementation for standard file inputs
        if (!filesData || filesData.length === 0) return false;

        const targetInput = await this.getFileInput();
        if (!targetInput) return false;

        const dt = await this._prepareDataTransfer(filesData);

        try {
            const proto = window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
            nativeSetter.call(targetInput, dt.files);
        } catch (e) {
            targetInput.files = dt.files;
        }

        targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        targetInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        return true;
    }

    /**
     * SHARED KERNEL: Helper to prepare DataTransfer from file data.
     */
    async _prepareDataTransfer(filesData) {
        const fileObjects = await Promise.all(filesData.map(f =>
            fetch(f.data)
                .then(r => r.blob())
                .then(blob => {
                    const originalName = f.name || "";
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(originalName.split('.')[0]);
                    const name = (originalName && !isUuid)
                        ? originalName
                        : `attachment_${Date.now().toString().slice(-4)}.${(f.type || 'bin').split('/')[1] || 'dat'}`;

                    return new File([blob], name, { type: f.type, lastModified: Date.now() });
                })
        ));

        const dt = new DataTransfer();
        fileObjects.forEach(f => {
            try { dt.items.add(f); } catch (e) { }
        });
        return dt;
    }

    /**
     * SHARED KERNEL: Drag & Drop simulation helper.
     */
    dispatchDropSequence(elem, dt) {
        if (!elem) return false;
        try {
            const createEvent = (type) => new DragEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                dataTransfer: dt,
                clientX: elem.getBoundingClientRect().left + 10,
                clientY: elem.getBoundingClientRect().top + 10,
            });

            elem.dispatchEvent(createEvent('dragenter'));
            elem.dispatchEvent(createEvent('dragover'));
            elem.dispatchEvent(createEvent('drop'));
            return true;
        } catch (e) {
            return false;
        }
    }
}
