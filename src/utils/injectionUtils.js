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
import { getLlmConfig } from './llmConstants';
import { triggerInjection } from './injectionAPI';
import { resolveSnippets, compilePrompt } from './variableParser';

/**
 * Centralized LLM Launch Handler
 *
 * Logic:
 * - Click: Additive injection into existing tab (no reload)
 * - Ctrl+Click: New chat in existing window or new window (force reload)
 * - Shift+Click: Open only (no text/files)
 *
 * @param {Object} options
 * @param {string} options.content - The raw prompt content (from step or snippet)
 * @param {Object} options.llm - The target LLM object
 * @param {Object} options.event - The click event (to check modifier keys)
 * @param {Array} options.files - Optional files to attach
 * @param {Object} options.variableValues - Values for variable replacement
 * @param {Array} options.snippets - All available snippets (for resolution)
 * @param {Array} options.ignoredVariables - Variables to exclude from replacement
 * @param {Function} options.onNotification - Callback for status messages
 */
export const handleLlmLaunch = async ({
    content,
    llm,
    event,
    files = [],
    variableValues = {},
    snippets = [],
    ignoredVariables = [],
    onNotification
}) => {
    try {
        const isShift = !!event?.shiftKey;
        const isNewChat = !!(event?.ctrlKey || event?.metaKey);

        // 1. Resolve Config & URL
        if (!llm) {
            console.error("LeanPrompts: No LLM provided to handleLlmLaunch");
            return;
        }
        const config = getLlmConfig(llm);
        if (!config || !config.url) {
            console.error("LeanPrompts: Invalid LLM config", llm);
            if (onNotification) onNotification("Invalid LLM configuration.", 'error');
            return;
        }
        const targetUrl = isNewChat ? config.newChatUrl : config.url;

        // 2. Prepare Text (Skip if Shift/Open-Only)
        let text = null;
        if (!isShift && content !== undefined && content !== null) {
            const withSnippets = resolveSnippets(content, snippets);
            text = compilePrompt(withSnippets, variableValues, ignoredVariables);
        }

        // 3. Prepare Files (Skip if Shift/Open-Only)
        let processedFiles = [];
        if (!isShift && files && files.length > 0) {
            try {
                processedFiles = await Promise.all(
                    files.filter(f => f instanceof File || f instanceof Blob).map(f => new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({
                            name: f.name || "attachment",
                            type: f.type,
                            data: reader.result
                        });
                        reader.onerror = () => reject(new Error("FileReader failed"));
                        reader.readAsDataURL(f);
                    }))
                );
            } catch (e) {
                console.error("LeanPrompts: File processing failed", e);
                if (onNotification) onNotification("Failed to process attachment.", 'error');
                return;
            }
        }

        // 4. Send Message
        if (onNotification) {
            if (isNewChat) {
                onNotification(`Starting new chat in ${llm.name}...`, 'info');
            } else {
                onNotification(isShift ? `Opening ${llm.name}...` : `Injecting into ${llm.name}...`, 'info');
            }
        }

        triggerInjection({
            url: targetUrl,
            text,
            files: processedFiles,
            forceNavigate: isNewChat
        }, (resp) => {
            if (resp && resp.success) {
                if (onNotification && !isShift) {
                    onNotification(`${llm.name} ready!`);
                }
            } else if (resp && resp.error) {
                console.error("LeanPrompts: Injection error", resp.error);
                if (onNotification) onNotification(resp.error, 'error');
            }
        });
    } catch (globalErr) {
        console.error("LeanPrompts: handleLlmLaunch FATAL", globalErr);
        if (onNotification) onNotification("Launch failed. See console.", 'error');
    }
};
