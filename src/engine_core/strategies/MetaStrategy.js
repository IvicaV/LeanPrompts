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
/**
 * Meta AI Strategy
 * Isoliert, kapselt alle Meta-spezifischen Formatierungs-Logiken.
 */
import { AbstractBaseStrategy } from './AbstractBaseStrategy.js';
import { findBestTextInput } from '../DOMUtils.js';

export class MetaStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Meta AI', ['meta.ai']);
    }

    getInput() {
        return document.querySelector('textarea[aria-label*="Message" i]') ||
               document.querySelector('textarea[aria-label*="Nachricht" i]') ||
               document.querySelector('div[contenteditable="true"][role="textbox"]') ||
               document.querySelector('div[contenteditable="true"]') ||
               findBestTextInput();
    }

    async injectText(element, text) {
        if (!text) return false;

        if (!element || !element.isConnected) {
            element = this.getInput();
        }
        if (!element) return false;

        element.focus();

        // PASTE-SIMULATION: Triggers Meta AI's React paste handler cleanly
        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', text);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dataTransfer
            });

            element.dispatchEvent(pasteEvent);

            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: text
            }));

            await new Promise(r => setTimeout(r, 80));
            if (!element.isConnected) element = this.getInput() || element;
            const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const snippet = norm(text).slice(0, 15);
            if (snippet.length < 3 || norm(element.value ?? element.textContent).includes(snippet)) {
                return true;
            }
        } catch (e) {
            console.error("LeanPrompts Meta: Paste failed, falling back", e);
        }

        // Fallback to base strategy (native setter for textarea / execCommand for contenteditable)
        return await super.injectText(element, text);
    }
}
