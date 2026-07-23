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

const QWEN_MIME_SANITIZE_MAP = {
    'image/webp': 'image/png',
    'image/heic': 'image/jpeg',
    'image/heif': 'image/jpeg',
};

export class QwenStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Qwen', ['tongyi.aliyun.com', 'chat.qwenlm.ai', 'chat.qwen.ai']);
    }

    getInput() {
        return document.querySelector('textarea#chat-input') ||
            document.querySelector('.ant-input-textarea textarea') ||
            findBestTextInput();
    }

    async getFileInput() {
        return document.querySelector('input[type="file"]') ||
            findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0];
    }

    _sanitizeFile(fileData) {
        const safeMime = QWEN_MIME_SANITIZE_MAP[fileData.type]
            || fileData.type
            || 'application/octet-stream';

        const safeName = fileData.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        return { ...fileData, type: safeMime, name: safeName };
    }

    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        console.log('LeanPrompts [Qwen] Starting file injection with', filesData.length, 'file(s)');

        const textarea = this.getInput();
        if (!textarea) {
            console.error('LeanPrompts [Qwen] No textarea found');
            return false;
        }

        const safeFiles = filesData.map(f => this._sanitizeFile(f));

        try {
            console.log('LeanPrompts [Qwen] Triggering Main World drop injection via background script...');
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: "EXECUTE_QWEN_MAIN_WORLD",
                    files: safeFiles
                }, (resp) => {
                    if (chrome.runtime.lastError) {
                        console.warn("LeanPrompts [Qwen] Main World bridge message failed:", chrome.runtime.lastError.message);
                        resolve({ success: false });
                    } else {
                        resolve(resp || { success: false });
                    }
                });
            });

            if (response && response.success) {
                await this._delay(800);
                const isValid = await this._validateUpload(safeFiles);
                if (isValid) {
                    console.log("LeanPrompts [Qwen] File upload successfully verified.");
                    return true;
                } else {
                    console.log("LeanPrompts [Qwen] Main world dispatch completed, assuming success.");
                    return true; // True-Override Strategy to prevent double uploads
                }
            }
        } catch (e) {
            console.error("LeanPrompts [Qwen] Main world injection error:", e);
        }

        return false;
    }

    async _validateUpload(uploadedFiles) {
        console.log('LeanPrompts [Qwen] Validating upload...');

        const fileNames = uploadedFiles.map(f => f.name.toLowerCase());
        const start = Date.now();

        while (Date.now() - start < 6000) {
            const allElements = document.querySelectorAll(
                '[class*="file"], [class*="attachment"], [class*="upload"], [class*="chip"], ' +
                '[class*="card"], [class*="item"], .ant-upload-list-item, [data-testid*="file"]'
            );

            for (const el of allElements) {
                const elText = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
                const elTitle = (el.getAttribute('title') || el.getAttribute('data-name') || '').toLowerCase();

                for (const name of fileNames) {
                    const baseName = name.replace(/\.[^.]+$/, '');
                    if (
                        elText.includes(name) ||
                        elTitle.includes(name) ||
                        (baseName.length > 3 && elText.includes(baseName))
                    ) {
                        console.log(`LeanPrompts [Qwen] ✓ Found file chip with name "${name}":`, el);
                        return true;
                    }
                }
            }

            const genericSelectors = [
                '.ant-upload-list-item-name',
                '[class*="file-name"]',
                '[class*="filename"]',
                '[class*="upload-success"]',
                '[class*="file-preview"]',
                '[class*="attachment-item"]',
            ];

            for (const selector of genericSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text && text.length > 1 && !text.match(/^[+×✕✗\-]$/)) {
                        console.log(`LeanPrompts [Qwen] ✓ Found generic upload indicator [${selector}]: "${text}"`);
                        return true;
                    }
                }
            }

            const imageSelectors = [
                'img[src^="blob:"]',
                'img[class*="preview"]',
                '[class*="image-preview"] img',
                '[class*="image-item"] img',
            ];

            for (const selector of imageSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    console.log(`LeanPrompts [Qwen] ✓ Found image preview [${selector}]`);
                    return true;
                }
            }

            await this._delay(300);
        }

        console.warn('LeanPrompts [Qwen] Validation timeout - no upload indicator found after 6s');
        return false;
    }

    _base64ToBlob(base64, mimeType) {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const byteCharacters = atob(base64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }

        return new Blob(byteArrays, { type: mimeType });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}