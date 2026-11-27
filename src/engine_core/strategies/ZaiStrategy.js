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
import { findBestTextInput } from '../DOMUtils.js';

/**
 * Z.ai Strategy (chat.z.ai / z.ai).
 * Fast O(1) Light-DOM input discovery + Auth-State-Guard, falling back to
 * findBestTextInput() so minor UI changes never break injection.
 */
export class ZaiStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Z.ai', ['chat.z.ai', 'z.ai']);
    }

    getInput() {
        // 1. Auth State Guard: Never hijack inputs behind an active login modal/form
        const isLoggedOut = document.querySelector('input[type="password"]') ||
            document.querySelector('form[action*="login" i], form[action*="auth" i]');
        if (isLoggedOut) {
            return null;
        }

        const isVisible = (el) => {
            if (!el || !el.isConnected) return false;
            if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return el.offsetWidth > 0 || el.offsetHeight > 0;
        };

        // 2. O(1) Light-DOM Fast-Path (avoids 400ms deep-scan throttle on chat.z.ai)
        const fastSelectors = [
            'textarea#chat-input',
            'textarea[placeholder]',
            'textarea',
            'div.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"]'
        ];

        for (const sel of fastSelectors) {
            const matches = document.querySelectorAll(sel);
            for (let i = matches.length - 1; i >= 0; i--) {
                if (isVisible(matches[i])) return matches[i];
            }
        }

        // 3. Heuristic fallback
        return findBestTextInput();
    }
}
