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
 * @file injectionAPI.js
 * @description The ONLY allowed gateway for UI components to trigger injections.
 * Direct use of chrome.runtime.sendMessage for OPEN_AND_INJECT is FORBIDDEN.
 */

import { copyToClipboard } from './clipboard';

/* @PROTECTED_REGION START: API_VALIDATION_LOGIC
   CRITICAL: Do not modify validation rules without "UNLOCK ENGINE". */

/**
 * Triggers the "Open and Inject" workflow.
 * @param {Object} payload
 * @param {string} payload.url - The target URL (optional if only injecting into current)
 * @param {string} payload.text - The prompt text to inject
 * @param {Array} payload.files - Array of file objects {name, type, data}
 * @param {boolean} payload.forceNavigate - Whether to force a new tab/reload
 * @param {Function} callback - Optional callback (receives response object)
 */
export const triggerInjection = (payload, callback) => {
    // 1. Validation
    if (!payload || typeof payload !== 'object') {
        console.error("InjectionAPI: Invalid payload structure", payload);
        if (callback) callback({ success: false, error: "INVALID_PAYLOAD" });
        return;
    }

    /* @PROTECTED_REGION: Multi-monitor targeting - DO NOT MODIFY
       targetWindowId enables multi-monitor split-screen.
       See: .agent/skills/split-screen-governance/SKILL.md */
    // 2. Construct Standard Message
    const message = {
        action: payload.action || "OPEN_AND_INJECT",
        url: payload.url,
        text: payload.text,
        files: payload.files || [],
        forceNavigate: !!payload.forceNavigate,
        alternativeDomains: payload.alternativeDomains || [],
        targetWindowId: payload.targetWindowId || null // Multi-monitor split-screen support
    };

    // 3. Safe Dispatch with LastError Protection
    try {
        // ZERO-REGRESSION: 'async' hinzugefügt, um das Clipboard API nutzen zu können
        chrome.runtime.sendMessage(message, async (response) => {
            // Trap the inevitable "Channel closed" error if background is busy renaming
            if (chrome.runtime.lastError) {
                // Muted console.warn to console.log to prevent polluting the chrome://extensions error dashboard
                console.log(`InjectionAPI: Connection closed: ${chrome.runtime.lastError.message || "Unknown error"}`);
                if (callback) callback({ success: false, error: "CONNECTION_ERROR" });
                return;
            }

            // --- START: ZERO-REGRESSION AUTO-COPY EXECUTION ---
            // Nutzt dein eigenes, robustes Fallback-Utility aus clipboard.js!
            if (response && response.success === false && response.fallbackText) {
                await copyToClipboard(response.fallbackText);
            }
            // --- END: ZERO-REGRESSION AUTO-COPY EXECUTION ---

            if (callback) callback(response);
        });
    } catch (e) {
        console.error("InjectionAPI: Dispatch failed", e);
        if (callback) callback({ success: false, error: e.message });
    }
};
/* @PROTECTED_REGION END: API_VALIDATION_LOGIC */
