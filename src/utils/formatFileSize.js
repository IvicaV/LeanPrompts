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
 * Maximum allowed file size for attachments (25 MB).
 * Used across VariableInspector and Popup to guard file inputs.
 */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Maximum total batch size to prevent Browser Out-Of-Memory (OOM) crashes
 * when converting files to Base64 (100 MB).
 */
export const MAX_BATCH_SIZE = 100 * 1024 * 1024;

/**
 * Formats a byte count into a human-readable string (KB / MB).
 * @param {number} bytes
 * @returns {string} e.g. "1.5 MB" or "340 KB"
 */
export function formatFileSize(bytes) {
    if (bytes == null || bytes === 0) return '0 KB';
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Filters an array of File objects, returning only those within the size limit.
 * Calls `onReject(file)` for each file that exceeds the individual 25MB limit.
 * Silently drops files that exceed the global 100MB batch limit to protect RAM,
 * dispatching a global event to notify the UI without breaking React states.
 * @param {File[]} files
 * @param {function} onReject - callback receiving each rejected file
 * @returns {File[]} accepted files
 */
export function filterOversizedFiles(files, onReject) {
    const accepted = [];
    let currentBatchSize = 0;
    let batchLimitHit = false; // Flag, um Spam zu verhindern
    
    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            if (onReject) onReject(file);
        } else if (currentBatchSize + file.size > MAX_BATCH_SIZE) {
            // RAM Guard greift ein
            if (!batchLimitHit) {
                batchLimitHit = true;
                // Feuert ein globales Event, völlig losgelöst von React
                window.dispatchEvent(new CustomEvent('lp-batch-limit-hit'));
                console.warn(`LeanPrompts: RAM guard triggered. Dropping file ${file.name} to stay under 100MB limit.`);
            }
        } else {
            accepted.push(file);
            currentBatchSize += file.size;
        }
    }
    return accepted;
}
