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
 * Kimi Strategy: ContentEditable editor with HTML paragraph injection.
 */
export class KimiStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Kimi', ['kimi.moonshot.cn', 'kimi.com', 'kimi.ai']);
    }

    getInput() {
        return document.querySelector('.chat-input-editor[contenteditable="true"]') ||
            document.querySelector('[contenteditable="true"]') ||
            findBestTextInput();
    }

    async getFileInput() {
        return await waitForElement(() =>
            document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0]
            , 3000);
    }

    async injectText(element, text) {
        if (!element || !text) return false;

        element.focus();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Convert plain text to HTML paragraphs for Kimi editor
        const lines = text.split('\n');
        const htmlContent = lines.map(line => {
            if (line.trim() === '') return '<p><br></p>';
            const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<p>${safeLine}</p>`;
        }).join('');

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
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }
}
