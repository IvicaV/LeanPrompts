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
 * AI Studio Strategy: Shadow DOM aware with lazy file input priming.
 * Validated for new chat URL: https://aistudio.google.com/prompts/new_chat (2026-02-10)
 */
export class AIStudioStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Google AI Studio', ['aistudio.google.com']);
        
        // =========================================================================
        // [PROTECTED: ZERO-REGRESSION PERFORMANCE STATE]
        // Used to prevent O(N²) CPU locking during element polling
        // =========================================================================
        this._lastDeepScanTime = 0;
        this._cachedDeepScanResult = null;
    }

    getInput() {
        const isSystemInstructionEl = (el) => {
            if (!el) return false;
            const label = (el.getAttribute('aria-label') || el.placeholder || '').toLowerCase();
            if (label.includes('system instruction') || label.includes('tone and style')) return true;
            return !!(el.closest && el.closest('ms-system-instructions, [class*="system-instruction" i]'));
        };

        // 0. PRIMARY DIRECT TARGET (Verified Live DOM: formcontrolname="promptText" inside ms-prompt-box)
        const promptBoxInput = document.querySelector('ms-prompt-box textarea[formcontrolname="promptText"], textarea[formcontrolname="promptText"]');
        if (promptBoxInput && !promptBoxInput.disabled && !promptBoxInput.readOnly && (promptBoxInput.offsetWidth > 0 || promptBoxInput.offsetHeight > 0)) {
            return promptBoxInput;
        }

        // 1. EXTENDED FAST-PATH: Direct selectors & Web Component Hosts (O(1) performance)
        // Checks light DOM and direct host shadow roots in <1ms without full DOM traversal
        // Note: ms-chat-turn excluded so historical turns are never targeted before the active prompt box
        const hosts = document.querySelectorAll('ms-prompt-box, ms-prompt-input, ms-autosize-textarea, ms-text-box, ms-chunk-editor, ms-text-chunk-editor, .prompt-box-container, .chat-input-container, div.prompt-container');
        for (let i = hosts.length - 1; i >= 0; i--) {
            const host = hosts[i];
            if (host.closest && host.closest('ms-chat-turn, ms-system-instructions')) continue;
            const light = host.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
            if (light && !isSystemInstructionEl(light) && (light.offsetWidth > 0 || light.offsetHeight > 0)) {
                return light;
            }
            if (host.shadowRoot) {
                const inner = host.shadowRoot.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
                if (inner && !isSystemInstructionEl(inner) && (inner.offsetWidth > 0 || inner.offsetHeight > 0)) {
                    return inner;
                }
            }
        }

        // Broader queries to catch modern Angular 18+ Material elements & Multilingual UI
        let fastMatch = document.querySelector('ms-prompt-box textarea, ms-prompt-input textarea, ms-text-box textarea, .prompt-box-container textarea, ms-autosize-textarea textarea, ms-chunk-editor textarea') ||
            document.querySelector('textarea[aria-label*="prompt" i], textarea[placeholder*="prompt" i], textarea[formcontrolname*="prompt"]') ||
            document.querySelector('textarea[aria-label*="Type" i], textarea[placeholder*="Type" i], textarea[aria-label*="Ask" i], textarea[placeholder*="Ask" i], textarea[aria-label*="Enter" i], textarea[placeholder*="Enter" i]') ||
            document.querySelector('textarea[aria-label*="Eingabe" i], textarea[placeholder*="Eingabe" i], textarea[aria-label*="Frage" i], textarea[placeholder*="Frage" i], textarea[aria-label*="Nachricht" i], textarea[placeholder*="Nachricht" i]') ||
            document.querySelector('textarea.cdk-textarea-autosize:not([aria-label*="System instructions" i]), textarea.textarea:not([aria-label*="System instructions" i])');

        if (fastMatch && !isSystemInstructionEl(fastMatch) && (fastMatch.offsetWidth > 0 || fastMatch.offsetHeight > 0)) {
            return fastMatch;
        }

        // 2. STATELESS THROTTLE: Prevent O(N²) Event Loop Starvation
        // When polling via waitForElement, querying the entire Shadow DOM every 100ms 
        // freezes the browser. We strictly throttle deep scans to once per 400ms.
        const now = Date.now();
        if (now - this._lastDeepScanTime < 400) {
            // CRITICAL: document.body.contains() fails on Shadow DOM nodes.
            // Using .isConnected is the only reliable way to verify node attachment.
            if (this._cachedDeepScanResult && this._cachedDeepScanResult.isConnected && !isSystemInstructionEl(this._cachedDeepScanResult)) {
                return this._cachedDeepScanResult;
            }
            return null; // Return null safely, let the polling loop breathe
        }
        this._lastDeepScanTime = now;

        // 3. DEEP SCAN: Pierce Shadow DOMs
        // Broadened to catch any interactive textarea or editable element
        const candidates = findAllElementsDeep(document, el => el.tagName === 'TEXTAREA' || (el.isContentEditable && el.getAttribute('role') === 'textbox'));

        // Filter out hidden, disabled, or System Instruction textareas
        const validInputs = candidates.filter(el => {
            if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
            if (isSystemInstructionEl(el)) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
            return true;
        });

        if (validInputs.length > 0) {
            // Priority: Context hints in attributes or parent containers (iterate from bottom/latest to top)
            const reversedInputs = [...validInputs].reverse();
            const mainInput = reversedInputs.find(el => {
                const attrText = (el.getAttribute('formcontrolname') || el.getAttribute('aria-label') || el.placeholder || '').toLowerCase();
                if (attrText.includes('prompt') || attrText.includes('type') || attrText.includes('ask') || attrText.includes('enter') || attrText.includes('user') ||
                    attrText.includes('chat') || attrText.includes('message') || attrText.includes('query') || attrText.includes('input') ||
                    attrText.includes('eingabe') || attrText.includes('frage') || attrText.includes('nachricht') || attrText.includes('text')) {
                    return true;
                }
                
                // Check parent tree for semantic clues (including shadow root boundary host)
                let parent = el.parentElement || (el.getRootNode && el.getRootNode().host);
                let depth = 0;
                while (parent && depth < 4) {
                    const cls = typeof parent.className === 'string' ? parent.className.toLowerCase() : "";
                    const tag = (parent.tagName || "").toLowerCase();
                    if (tag === 'ms-system-instructions' || tag === 'ms-chat-turn') return false;
                    if (cls.includes('prompt') || cls.includes('chat') || cls.includes('input') || tag.startsWith('ms-') || tag.includes('prompt') || tag.includes('chat')) {
                        return true;
                    }
                    parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
                    depth++;
                }
                return false;
            });

            this._cachedDeepScanResult = mainInput || reversedInputs[0];
            return this._cachedDeepScanResult;
        }

        // 4. FAILSAFE FALLBACK: Heuristic DOM scan via findBestTextInput
        // Ensures that even if Google dynamically changes web-component tags,
        // the main prompt area is discovered immediately in <15ms instead of timing out.
        const heuristicMatch = findBestTextInput();
        if (heuristicMatch && !isSystemInstructionEl(heuristicMatch)) {
            this._cachedDeepScanResult = heuristicMatch;
            return heuristicMatch;
        }

        this._cachedDeepScanResult = null;
        return null;
    }

    async getFileInput() {
        // LAZY PRIMING: Only click 'Insert' if no file input is already available.
        // This prevents triggering the native "Failed to upload to Drive" error if the input is already present.
        const existingInput = document.querySelector('input[data-test-upload-file-input]') ||
            document.querySelector('input[type="file"].file-input') ||
            document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0];

        if (existingInput) return existingInput;

        const addBtn = document.querySelector('button[aria-label*="Insert"], button[aria-label*="images"], button[aria-label*="Hinzufügen"]');
        if (addBtn) {
            addBtn.click();
            await new Promise(r => setTimeout(r, 600));
        }

        return document.querySelector('input[data-test-upload-file-input]') ||
            document.querySelector('input[type="file"].file-input') ||
            document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0] ||
            await waitForElement(() => document.querySelector('input[type="file"]'), 3000);
    }

    /**
     * Override injectText to handle Angular's file upload DOM-locking.
     * When a file is uploaded, AI Studio temporarily disables or reconstructs the textarea.
     */
    async injectText(element, text) {
        if (!text) return false;

        // Defensive Polling: Wait for the element to become interactive again (max 3 seconds)
        for (let i = 0; i < 15; i++) {
            // Re-fetch element if it's dead, hidden, or became detached
            // CRITICAL: Using .isConnected to respect Shadow DOM boundaries
            if (!element || !element.isConnected || (element.offsetWidth === 0 && element.offsetHeight === 0)) {
                element = this.getInput();
            }

            // Check if it's active and not locked by the upload process
            if (element && !element.disabled && !element.readOnly) {
                // Focus and attempt to wake it up
                try { element.focus(); element.click(); } catch (e) { }
                break; 
            }

            // Wait 200ms before checking again
            await new Promise(r => setTimeout(r, 200));
        }

        // Failsafe: if after 3 seconds we still don't have a valid element, fail gracefully
        if (!element) return false;

        // Call the base implementation which handles the actual execCommand / Clipboard magic
        return await super.injectText(element, text);
    }

    /**
     * Override verifyInjection to handle Angular's digest cycle delays.
     */
    async verifyInjection(element, text) {
        if (!element) return false;

        // Initial delay to let Angular process the simulated events
        await new Promise(r => setTimeout(r, 300));

        // Re-fetch if detached during upload/sync
        if (!element.isConnected) {
            element = this.getInput() || element;
        }

        const normalizeText = (t) => (t || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[*#_~`>+\-]/g, '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const expected = normalizeText(text).substring(0, 15);

        // Advanced Polling: 8 attempts @ 300ms = 2.4 seconds total wait limit for verification
        for (let i = 0; i < 8; i++) {
            // Optimiert: Use textContent instead of innerText
            const content = normalizeText(element.value || element.textContent || "");

            if (content.includes(expected)) return true;

            // Trigger another wave of human simulation to force Angular to notice the change
            if (i % 2 === 0) {
                await this.triggerHumanSimulation(element);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        return false;
    }
}
