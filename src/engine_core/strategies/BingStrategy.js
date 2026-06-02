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
 * Bing Image Creator Strategy: Shadow DOM aware with Copilot integration.
 */
export class BingStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Bing Image Creator', ['bing.com/images/create', 'bing.com/create', 'bing.com/search']);
        
        // =========================================================================
        // [PROTECTED: ZERO-REGRESSION PERFORMANCE STATE]
        // =========================================================================
        this._lastDeepScanTime = 0;
        this._cachedDeepScanResult = null;
    }

    getInput() {
        // Fast Light-DOM Path (Legacy/Standard Search)
        const fastMatch = document.querySelector('#sb_form_q, textarea.b_searchbox');
        if (fastMatch && fastMatch.isConnected && fastMatch.offsetWidth > 0) {
            return fastMatch;
        }

        // THROTTLE: Protect CPU from O(N²) Shadow DOM queries
        const now = Date.now();
        if (now - this._lastDeepScanTime < 400) {
            if (this._cachedDeepScanResult && this._cachedDeepScanResult.isConnected) {
                return this._cachedDeepScanResult;
            }
            return null;
        }
        this._lastDeepScanTime = now;

        // Definition of heuristics for the target input
        const isTarget = (el) => {
            const tag = el.tagName.toLowerCase();
            const id = el.id || '';
            const cls = (el.className || '').toString();
            const testId = el.getAttribute('data-testid') || '';

            // 2025 Shadow DOM Target (Copilot/Designer Integration)
            if (tag === 'textarea' && id === 'searchbox') return true;
            if (tag === 'textarea' && cls.includes('text-area')) return true;
            if (tag === 'input' && testId === 'search-input') return true;

            return false;
        };

        // Execution of Deep Search (Shadow DOM Piercing)
        const candidates = findAllElementsDeep(document, isTarget);

        if (candidates.length > 0) {
            const visible = candidates.find(el => {
                return el.offsetParent !== null && !el.disabled && !el.readOnly;
            });
            if (visible) {
                this._cachedDeepScanResult = visible;
                return visible;
            }
        }

        this._cachedDeepScanResult = null;
        return null;
    }

    async injectText(element, text) {
        if (!element || !text) return false;

        try {
            element.focus();
            const prototype = window.HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
            nativeSetter.call(element, text);
            const eventOptions = { bubbles: true, cancelable: true, composed: true };
            ['input', 'change', 'keydown', 'keypress', 'keyup'].forEach(type => {
                element.dispatchEvent(new Event(type, eventOptions));
            });
            return true;
        } catch (e) {
            return await super.injectText(element, text);
        }
    }
}
