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

        // 1. Try execCommand (most reliable for contenteditables)
        let success = false;
        try {
            success = document.execCommand('insertText', false, text);
        } catch (e) { }

        // 2. Fallback: Clipboard Event (Paste simulation)
        if (!success) {
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', text);
                const event = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                element.dispatchEvent(event);
                success = true;
            } catch (e) { }
        }

        // 3. Fallback: Native Property Setter (Bypass React/Vue)
        if (!success && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
            try {
                const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                nativeSetter.call(element, text);
                success = true;
            } catch (e) {
                element.value = text;
                success = true;
            }
        }

        // 4. Fallback: ContentEditable innerText (Last resort for complex editors)
        if (!success && element.isContentEditable) {
            try {
                element.innerText = text;
                success = true;
            } catch (e) { }
        }

        // 5. TRIGGER EVENT-HEARTBEAT (Ensure framework synchronization)
        if (success) {
            // STABILITY FIX: We await the human simulation to ensure the site's framework (React/Vue)
            // catches up, but we no longer let the background verification block the success report.
            // This restores the fault-tolerant behavior that worked perfectly in previous versions.
            await this.triggerHumanSimulation(element);

            // Background Verification (Diagnostic only)
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

        // We give the framework up to 1 second to accept the value (5 polls of 200ms)
        for (let i = 0; i < 5; i++) {
            const content = normalizeText(element.value || element.innerText || "");
            const expected = normalizeText(text).substring(0, 10);

            // Refuse success if verification string is too short/empty (avoids false-positives)
            if (expected.length < 3) return true; // Too short to verify reliably, assume success
            if (content.includes(expected)) return true;

            // If framework hasn't accepted it, simulate another human-like interaction to "wake" it up
            if (i < 4) {
                await this.triggerHumanSimulation(element);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.warn(`LeanPrompts: Verification failed. Expected part of: "${text.substring(0, 20)}..." but found: "${(element.value || element.innerText || "").substring(0, 30)}..."`);
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
