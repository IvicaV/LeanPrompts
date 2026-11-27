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

/**
 * Fallback Strategy: The "Generic Soldier".
 * Uses heuristics to work on any unknown site.
 */
export class GenericStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Generic', []);
    }

    /**
     * Always returns true for compatibility check if known strategies fail.
     */
    detect(url) {
        return true;
    }

    /**
     * Universal File Injection for Custom/Unknown LLMs:
     * 1. Prefer an existing <input type="file"> (choosing a generic/multi-file one if multiple exist).
     * 2. If no file input is mounted in the DOM (common in lazy-mounted React/Vue SPAs),
     *    fall back to a native ClipboardEvent('paste') on the main text input.
     */
    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        // 1. Try existing <input type="file"> (preferring generic / multiple inputs)
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'))
            .filter(el => !el.disabled);

        if (fileInputs.length > 0) {
            const bestInput =
                fileInputs.find(el => el.multiple && (!el.accept || el.accept === '*' || el.accept === '*/*')) ||
                fileInputs.find(el => !el.accept || el.accept === '*' || el.accept === '*/*') ||
                fileInputs.find(el => el.multiple) ||
                fileInputs[0];

            const dt = await this._prepareDataTransfer(filesData);
            try {
                const proto = window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
                nativeSetter.call(bestInput, dt.files);
            } catch (e) {
                bestInput.files = dt.files;
            }
            bestInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            bestInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            return true;
        }

        // 2. Fallback: ClipboardEvent('paste') on the primary composer input
        //    (safe on unknown SPAs — unlike synthetic drag/drop, paste never leaves a stuck drop overlay)
        const inputEl = this.getInput();
        if (!inputEl) return false;

        const dt = await this._prepareDataTransfer(filesData);
        inputEl.focus();
        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: dt
        });
        inputEl.dispatchEvent(pasteEvent);
        return true;
    }
}
