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
 * Searches the entire DOM including Shadow Roots for elements.
 * Critical for Google pages (Gemini) that use Shadow DOM.
 */
export const findAllElementsDeep = (root, predicate) => {
    const allMatches = [];
    const stack = [root];

    while (stack.length > 0) {
        const currentNode = stack.pop();

        if (!currentNode) continue;

        // 1. Check if node matches
        if (currentNode.nodeType === Node.ELEMENT_NODE && predicate(currentNode)) {
            allMatches.push(currentNode);
        }

        // 2. Add Shadow Root (if present & open)
        if (currentNode.shadowRoot) {
            stack.push(currentNode.shadowRoot);
        }

        // 3. Add children (push in reverse order to maintain intuitive discovery)
        if (currentNode.children && currentNode.children.length > 0) {
            for (let i = currentNode.children.length - 1; i >= 0; i--) {
                stack.push(currentNode.children[i]);
            }
        }
    }

    return allMatches;
};

/**
 * Finds an element deep (incl. Shadow DOM) with polling support.
 */
export const waitForElement = (checker, timeout = 5000) => {
    return new Promise((resolve) => {
        const startTime = Date.now();

        const check = () => {
            // === ZERO-REGRESSION GUARD: Sofortiger Abbruch bei Extension-Update ===
            if (typeof window !== 'undefined' && window.__LP_CONTEXT_INVALIDATED) {
                resolve(null);
                return true;
            }

            // High-Performance Primary Check: Execute the checker directly.
            try {
                const el = checker();
                if (el instanceof HTMLElement || (el && el.nodeType === Node.ELEMENT_NODE)) {
                    resolve(el);
                    return true;
                }
                // 🛡️ SENTINEL-GUARD: Terminate polling immediately if login/auth or specific error is signaled
                if (el && el.error === 'LOGIN_REQUIRED') {
                    resolve(el);
                    return true;
                }
            } catch (e) { }

            if (Date.now() - startTime > timeout) {
                resolve(null);
                return true;
            }

            // High-Frequency Check (100ms) for snappy reaction
            setTimeout(() => requestAnimationFrame(check), 100);
            return false;
        };

        check();
    });
};

// =========================================================================
// [PROTECTED: ZERO-REGRESSION PERFORMANCE STATE]
// Global state variables for throttling the heavy heuristic scan
// =========================================================================
let _lastBestTextScan = 0;
let _cachedBestText = null;

/**
 * Finds the most likely main input field (or dropzone).
 * Uses heuristics like size, position, and type.
 */
export const findBestTextInput = () => {
    // STATELESS THROTTLE: Prevent O(N²) CPU locking system-wide.
    // If this is called in a tight loop (like waitForElement), we only 
    // run the heavy deep scan once every 400ms.
    const now = Date.now();
    if (now - _lastBestTextScan < 400) {
        if (_cachedBestText && _cachedBestText.isConnected) {
            return _cachedBestText;
        }
        return null;
    }
    _lastBestTextScan = now;

    // Definition: What is a text input?
    const isTextInput = (el) => {
        const tag = el.tagName.toLowerCase();

        // 🛡️ AUTH & LOGIN GUARD: Never hijack authentication / login inputs!
        if (el.type === 'password') return false;

        // Only filter standard <input> elements for auth keywords (Textareas & ContentEditables are always safe)
        if (tag === 'input') {
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
            const name = (el.getAttribute('name') || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();

            // Exclude typical login/signup text fields
            if (autocomplete.includes('password') || autocomplete.includes('username') || autocomplete.includes('email')) return false;
            if (name.includes('password') || name.includes('login') || id.includes('login') || id.includes('auth')) return false;
            if (placeholder.includes('password') || placeholder.includes('email') || placeholder.includes('phone') || placeholder.includes('passwort')) return false;

            // Exclude inputs sitting inside an authentication form
            const parentForm = el.closest('form');
            if (parentForm && parentForm.querySelector('input[type="password"]')) {
                return false;
            }
        }

        // Standard Prompt Targets
        if (tag === 'textarea') return true;
        if (tag === 'input' && (el.type === 'text' || el.type === 'search')) return true;
        if (el.isContentEditable) return true;
        if (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true') return true;
        return false;
    };

    // Search everywhere (Deep Search)
    const candidates = findAllElementsDeep(document, isTextInput);

    // Filter: Only visible elements with minimum size
    const visibleCandidates = candidates.filter(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

        // IMPORTANT: Explicit check for disabled state
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.readOnly) return false;

        const rect = el.getBoundingClientRect();
        // Increase minimum size to exclude small search fields
        return rect.width > 20 && rect.height > 20;
    });

    if (visibleCandidates.length === 0) {
        _cachedBestText = null;
        return null;
    }

    // INTELLIGENT SCORING
    visibleCandidates.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        const viewHeight = window.innerHeight;

        // SCORING METRICS
        let scoreA = 0;
        let scoreB = 0;

        // 1. AREA SCORE (Size matters)
        // Large text fields are more likely to be the main prompt than small search bars.
        const areaA = rectA.width * rectA.height;
        const areaB = rectB.width * rectB.height;
        // Normalize and cap so huge divs don't dominate everything
        scoreA += Math.min(areaA, 100000) / 100;
        scoreB += Math.min(areaB, 100000) / 100;

        // 2. TYPE SCORE (Semantic Priority)
        // TEXTAREA > INPUT. Chat apps and image generators almost always use textareas.
        const isTextareaA = a.tagName === 'TEXTAREA' || a.isContentEditable;
        const isTextareaB = b.tagName === 'TEXTAREA' || b.isContentEditable;

        if (isTextareaA) scoreA += 500; // Massive bonus for textareas
        if (isTextareaB) scoreB += 500;

        // 3. POSITION SCORE (Context dependent)
        // We give a slight bonus for being at the bottom (chat layout),
        // but weight size and type much more heavily.
        if (rectA.top > viewHeight * 0.5) scoreA += 50;
        if (rectB.top > viewHeight * 0.5) scoreB += 50;

        return scoreB - scoreA; // Candidate with highest score wins
    });

    _cachedBestText = visibleCandidates[0];
    return _cachedBestText; // The winner
};
