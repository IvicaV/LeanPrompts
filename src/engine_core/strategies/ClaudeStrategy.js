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
 * Claude Strategy: ProseMirror-based editor with hydration-safe text injection
 * and throttled lazy file input discovery.
 */
export class ClaudeStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Claude', ['claude.ai']);
        this._lastFileDeepScan = 0;
    }

    getInput() {
        const isVisible = (el) => {
            if (!el || !el.isConnected) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const selectors = [
            'div.ProseMirror[contenteditable="true"]',
            '[data-testid="chat-input"][contenteditable="true"]',
            'fieldset [contenteditable="true"]',
            '[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"]'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) return el;
        }

        return findBestTextInput();
    }

    async getFileInput() {
        const pickBest = (inputs) => {
            if (!inputs || inputs.length === 0) return null;
            const isGeneric = (el) => {
                const acc = (el.getAttribute('accept') || '').trim().toLowerCase();
                return acc === '' || acc === '*/*' || acc.includes('*/*');
            };
            return inputs.find(el => isGeneric(el) && el.multiple) ||
                inputs.find(el => isGeneric(el)) ||
                inputs.find(el => el.multiple) ||
                inputs[0];
        };

        return await waitForElement(() => {
            const lightInputs = Array.from(document.querySelectorAll('input[type="file"]'));
            if (lightInputs.length > 0) return pickBest(lightInputs);

            const now = Date.now();
            if (now - this._lastFileDeepScan < 400) return null;
            this._lastFileDeepScan = now;

            const deepInputs = findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file');
            return pickBest(deepInputs);
        }, 3000);
    }

    async injectText(element, text) {
        if (!text) return false;

        if (!element || !element.isConnected) {
            element = this.getInput();
        }
        if (!element) return false;

        // Claude / ProseMirror Focus Boost
        element.focus();
        try { element.click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 150));

        // Re-check connection after focus boost (hydration / post-file-upload guard)
        if (!element.isConnected) {
            element = this.getInput();
            if (!element) return false;
            element.focus();
        }

        // Set selection to end
        if (element.isContentEditable || element.tagName === 'DIV') {
            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(element);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) { }
        }

        return await super.injectText(element, text);
    }
}
