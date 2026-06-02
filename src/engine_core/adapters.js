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
// @protected-file: INJECTION_ENGINE_CORE
// @lock-status: LOCKED
// @edit-permission: RESTRICTED
// -----------------------------------------------------------------------------
// WARNING: This file is PART OF THE CORE ENGINE.
// Manual changes are FORBIDDEN.
// Any change must be authorized through the 'UNLOCK ENGINE' process.
// -----------------------------------------------------------------------------

// =============================================================================
// STRATEGY PATTERN BRIDGE
// This file now delegates to the Strategy Pattern architecture.
// All site-specific logic has been moved to individual Strategy classes.
// =============================================================================

import { injectionManager } from './strategies/InjectionManager.js';
import { findBestTextInput, waitForElement, findAllElementsDeep } from './DOMUtils.js';

// Re-export DOM utilities for backward compatibility with main.js
export { findBestTextInput, waitForElement, findAllElementsDeep };

/**
 * Legacy Adapters array - maintained for backward compatibility.
 * The Strategy Pattern now handles all site-specific logic.
 */
export const Adapters = [
    { name: "Bing Image Creator", matches: ["bing.com/images/create", "bing.com/create", "bing.com/search"] },
    { name: "ChatGPT", matches: ["chatgpt.com", "chat.openai.com"] },
    { name: "Qwen", matches: ["tongyi.aliyun.com", "chat.qwenlm.ai", "chat.qwen.ai"] },
    { name: "Claude", matches: ["claude.ai"] },
    { name: "Gemini", matches: ["gemini.google.com"] },
    { name: "Google AI Studio", matches: ["aistudio.google.com"] },
    { name: "Perplexity", matches: ["perplexity.ai"] },
    { name: "Deepseek", matches: ["chat.deepseek.com"] },
    { name: "Kimi", matches: ["kimi.moonshot.cn", "kimi.com", "kimi.ai"] },
    { name: "Z.ai", matches: ["chat.z.ai", "z.ai"] },
    { name: "MiniMax", matches: ["agent.minimax.io"] },
    { name: "Grok", matches: ["grok.com", "x.com"] },
    { name: "Mistral", matches: ["mistral.ai", "chat.mistral.ai"] },
    { name: "Generic", matches: [] }
];

/**
 * Gets the current adapter/strategy for the given URL.
 * Now delegates to InjectionManager.
 */
export const getCurrentAdapter = (url) => {
    const strategy = injectionManager.getStrategy(url);

    // Return an adapter-like object for backward compatibility
    return {
        name: strategy.name,
        matches: strategy.domains,
        getInput: () => strategy.getInput(),
        getFileInput: async () => strategy.getFileInput ? await strategy.getFileInput() : null,
        // Pass through to strategy methods
        _strategy: strategy
    };
};

/**
 * Inserts text into the given element using the appropriate strategy.
 * This is the main entry point for text injection.
 */
export const insertText = async (element, text, adapterName) => {
    if (!element || !text) return false;

    // Safe fallback for window (proactive defense for background worker context)
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

    // Get strategy by name or URL
    const strategy = adapterName
        ? injectionManager.getStrategyByName(adapterName)
        : injectionManager.getStrategy(hostname);

    return await strategy.injectText(element, text);
};

/**
 * Injects files using the appropriate strategy.
 * This is the main entry point for file injection.
 */
export const injectFiles = async (filesData, adapterName = "Generic") => {
    if (!filesData || filesData.length === 0) return false;

    // Get strategy by name
    const strategy = injectionManager.getStrategyByName(adapterName);

    // Use strategy's injectFiles method
    const success = await strategy.injectFiles(filesData);
    if (success) return true;
    if (adapterName !== "Generic") return success;

    // Fallback: Try generic file injection
    try {
        const fileObjects = await Promise.all(filesData.map(f =>
            fetch(f.data)
                .then(r => r.blob())
                .then(blob => new File([blob], f.name, { type: f.type, lastModified: Date.now() }))
        ));

        const dt = new DataTransfer();
        fileObjects.forEach(f => dt.items.add(f));

        // Try to find any file input
        const fileInputs = findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file');
        if (fileInputs.length > 0) {
            const targetInput = fileInputs.find(i => !i.disabled) || fileInputs[0];
            try {
                const proto = window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "files").set;
                nativeSetter.call(targetInput, dt.files);
            } catch (e) {
                targetInput.files = dt.files;
            }
            targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            targetInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            return true;
        }

        // Last resort: Drop on body
        const mainInput = strategy.getInput ? strategy.getInput() : findBestTextInput();
        if (mainInput) {
            if (strategy.dispatchDropSequence(mainInput, dt)) return true;
            if (mainInput.parentNode && strategy.dispatchDropSequence(mainInput.parentNode, dt)) return true;
        }

        return strategy.dispatchDropSequence(document.body, dt);

    } catch (e) {
        console.error("File injection failed:", e);
        return false;
    }
};
