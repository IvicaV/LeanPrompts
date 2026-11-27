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
 * MiniMax Strategy (agent.minimax.io).
 * Fast O(1) Light-DOM input discovery + Auth-State-Guard, falling back to
 * findBestTextInput() so minor UI changes never break injection.
 */
export class MinimaxStrategy extends AbstractBaseStrategy {
    constructor() {
        super('MiniMax', ['agent.minimax.io']);
    }

    isLoggedOut() {
        // 1. Classic auth modal / form check
        if (
            document.querySelector('input[type="password"]') ||
            document.querySelector('form[action*="login" i], form[action*="auth" i]') ||
            document.querySelector('[role="dialog"] input[type="email"], div[class*="login" i] input[type="tel"]')
        ) {
            return true;
        }

        // 2. MiniMax renders a visible composer even when logged out, alongside visible
        //    "Sign in" CTA buttons (e.g. `.mavis-button` in the top-right header & sidebar).
        //    Interacting with the composer/file input while logged out causes MiniMax to
        //    show a toast and reload the page repeatedly.
        const authCtaRegex = /^(sign\s*in|log\s*in|anmelden|登录)$/i;
        const buttons = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
            if (btn.offsetWidth === 0 && btn.offsetHeight === 0) continue;
            if (btn.closest('[contenteditable="true"]')) continue;
            const text = (btn.textContent || '').trim();
            if (text.length > 0 && text.length <= 16 && authCtaRegex.test(text)) {
                return true;
            }
        }

        return false;
    }

    getInput() {
        // 1. Auth State Guard: Never interact with inputs while logged out
        // (avoids triggering MiniMax's unauthenticated redirect/reload loop)
        if (this.isLoggedOut()) {
            return null;
        }

        const isVisible = (el) => {
            if (!el || !el.isConnected) return false;
            if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return el.offsetWidth > 0 || el.offsetHeight > 0;
        };

        // 2. O(1) Light-DOM Fast-Path
        const fastSelectors = [
            'textarea[placeholder]',
            'textarea',
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
