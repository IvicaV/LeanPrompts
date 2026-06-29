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
 * Gemini Strategy: Quill-based editor with button-triggered file upload.
 */
export class GeminiStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Gemini', ['gemini.google.com']);
    }

    getInput() {
        // 1. Deep Shadow Root traversal for the modern Gemini rich-textarea
        const host = document.querySelector('rich-textarea');
        if (host && host.shadowRoot) {
            const inner = host.shadowRoot.querySelector('div[contenteditable="true"]') ||
                host.shadowRoot.querySelector('.ql-editor') ||
                host.shadowRoot.querySelector('p[contenteditable="true"]');
            if (inner) return inner;
        }

        // 2. High-Performance Selectors
        const selectors = [
            'rich-textarea div[contenteditable="true"]',
            'div.ql-editor',
            'div[contenteditable="true"][role="textbox"]',
            'rich-textarea p'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }

        // 3. Fallback to heuristics
        return findBestTextInput();
    }

    /**
     * Override verification to handle Gemini's rich-text synchronization lag and Shadow DOM quirks.
     */
    async verifyInjection(element, text) {
        if (!element) return false;

        if (!document.body.contains(element)) {
            element = this.getInput() || element;
        }

        // Gemini/Quill can be slow to update internal model. 
        // We poll more patiently and normalize whitespace (crucial for Quill).
        const normalize = (str) => (str || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[*#_~`>+\-]/g, '') // Strip Markdown auto-formatting
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const expected = normalize(text).substring(0, 15);

        for (let i = 0; i < 10; i++) {
            const val = element.value !== undefined ? element.value : "";
            // Optimized: Use textContent instead of innerText
            const content = normalize(val + " " + element.textContent);

            if (content.includes(expected)) return true;

            // Trigger events to nudge the framework
            if (i % 2 === 0) {
                await this.triggerHumanSimulation(element);
            }
            await new Promise(r => setTimeout(r, 400));
        }

        return false;
    }

    async getFileInput() {
        // GEMINI SPECIAL: Robust Polling for Buttons with Lazy Priming
        const checkExisting = () => document.querySelector('input[name="Filedata"]') || document.querySelector('input[type="file"]');
        if (checkExisting()) return checkExisting();

        // 1. Wait for Upload Button (Essential for New Chat)
        const uploadBtn = await waitForElement(() =>
            document.querySelector('button[aria-label*="Datei hochladen"]') ||
            document.querySelector('button[aria-label*="Upload"]') ||
            document.querySelector('button[aria-label*="hochladen"]')
            , 5000);

        if (uploadBtn) {
            uploadBtn.click();
            await new Promise(r => setTimeout(r, 800));

            // Check again after first click
            if (checkExisting()) return checkExisting();

            const fileBtn = await waitForElement(() =>
                document.querySelector('button[aria-label*="Dateien hochladen"]') ||
                document.querySelector('button[aria-label*="Upload files"]') ||
                Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('Dateien hochladen') || b.innerText?.includes('Upload files'))
                , 3000);

            if (fileBtn) {
                fileBtn.click();
                await new Promise(r => setTimeout(r, 800));
            }
        }
        return await waitForElement(() => checkExisting(), 3000);
    }
}
