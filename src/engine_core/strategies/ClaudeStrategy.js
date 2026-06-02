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
 * Claude Strategy: ProseMirror-based editor with lazy file input.
 */
export class ClaudeStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Claude', ['claude.ai']);
    }

    getInput() {
        return document.querySelector('[contenteditable="true"]') || findBestTextInput();
    }

    async getFileInput() {
        // Robust Wait: Claude might lazy load the input
        return await waitForElement(() =>
            document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0]
            , 3000);
    }

    async injectText(element, text) {
        if (!element || !text) return false;

        // Claude / ProseMirror Focus Boost
        element.focus();
        try { element.click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 150));

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

        // Use base injection
        return await super.injectText(element, text);
    }
}
