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
import { findBestTextInput, findAllElementsDeep } from '../DOMUtils.js';

const STORAGE_CHANNEL_KEY = 'lp_aistudio_preferred_file_channel';

/**
 * AI Studio Strategy (Angular + Material CDK, 2025/2026 resilient architecture).
 * - O(1) Light-DOM Fast-Path + Semantic Viewport Scoring + Throttled Shadow-DOM Fallback
 * - Angular-native text injection (bypasses AI Studio's paste-to-.txt interceptor)
 * - Self-healing 3-channel file injection cascade (paste -> drop -> fileInput)
 *   with MutationObserver confirmation, Snackbar error watcher & PNG conversion fallback
 * - Zero requestAnimationFrame usage (immune to Chromium background tab throttling)
 * Validated for new chat URL: https://aistudio.google.com/prompts/new_chat
 */
export class AIStudioStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Google AI Studio', ['aistudio.google.com']);
        this.selfVerifiesFiles = true;

        // =========================================================================
        // [PROTECTED: ZERO-REGRESSION PERFORMANCE STATE]
        // Prevents O(N^2) CPU locking during element polling
        // =========================================================================
        this._cachedInput = null;
        this._lastDeepScanTime = 0;
        this._preferredChannel = 'paste';
        this._loadPreferredChannel();
    }

    _loadPreferredChannel() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.get([STORAGE_CHANNEL_KEY], (res) => {
                    if (res?.[STORAGE_CHANNEL_KEY]) {
                        this._preferredChannel = res[STORAGE_CHANNEL_KEY];
                    }
                });
            }
        } catch { /* ignore in non-extension contexts (e.g. unit tests) */ }
    }

    _savePreferredChannel(channel) {
        this._preferredChannel = channel;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ [STORAGE_CHANNEL_KEY]: channel });
            }
        } catch { /* ignore */ }
    }

    _isExcludedElement(el) {
        if (!el) return true;
        if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return true;

        const label = (el.getAttribute('aria-label') || el.placeholder || '').toLowerCase();
        if (
            label.includes('system instruction') ||
            label.includes('systemanweisung') ||
            label.includes('tone and style') ||
            label.includes('search') ||
            label.includes('filter') ||
            label.includes('api key')
        ) {
            return true;
        }

        if (el.closest && el.closest('ms-system-instructions, ms-chat-turn, ms-run-settings, ms-navbar, [class*="system-instruction" i]')) {
            return true;
        }
        return false;
    }

    _isVisible(el) {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && el.offsetWidth === 0 && el.offsetHeight === 0) {
            return false;
        }
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    /**
     * Finds the active prompt input in < 2ms (Cache -> Fast-Path -> Light-DOM Semantic Scoring -> Throttled Deep-Scan).
     */
    getInput() {
        // 0. Instant O(1) cache hit
        if (this._cachedInput && this._isVisible(this._cachedInput) && !this._isExcludedElement(this._cachedInput)) {
            return this._cachedInput;
        }

        // 1. Known AI Studio Fast-Paths (2025/2026 Angular/CDK layouts)
        const fastSelectors = [
            'ms-prompt-box textarea[formcontrolname="promptText"]',
            'ms-prompt-input-wrapper textarea',
            'ms-prompt-box textarea',
            'ms-autosize-textarea textarea',
            'textarea[formcontrolname="promptText"]',
            'footer textarea.cdk-textarea-autosize',
            'textarea.cdk-textarea-autosize'
        ];

        for (const sel of fastSelectors) {
            const matches = document.querySelectorAll(sel);
            // Reverse order: active composer sits lowest in DOM order
            for (let i = matches.length - 1; i >= 0; i--) {
                const el = matches[i];
                if (this._isVisible(el) && !this._isExcludedElement(el)) {
                    this._cachedInput = el;
                    return el;
                }
            }
        }

        // 2. Future-proof Light-DOM Semantic Scoring (survives ms-* tag renames)
        const lightCandidates = Array.from(
            document.querySelectorAll('textarea, div[contenteditable="true"][role="textbox"], [role="textbox"][contenteditable="true"]')
        ).filter(el => this._isVisible(el) && !this._isExcludedElement(el));

        if (lightCandidates.length > 0) {
            const best = this._scoreCandidates(lightCandidates);
            if (best) {
                this._cachedInput = best;
                return best;
            }
        }

        // 3. Emergency Fallback: Throttled Shadow-DOM Deep-Scan (max 1x per 500ms)
        const now = Date.now();
        if (now - this._lastDeepScanTime < 500) {
            return null;
        }
        this._lastDeepScanTime = now;

        const deepCandidates = findAllElementsDeep(document, el =>
            el.tagName === 'TEXTAREA' || (el.isContentEditable && el.getAttribute('role') === 'textbox')
        ).filter(el => this._isVisible(el) && !this._isExcludedElement(el));

        const deepBest = this._scoreCandidates(deepCandidates);
        if (deepBest) {
            this._cachedInput = deepBest;
            return deepBest;
        }

        // 4. Ultimate Failsafe Heuristic
        const heuristicMatch = findBestTextInput();
        if (heuristicMatch && !this._isExcludedElement(heuristicMatch)) {
            this._cachedInput = heuristicMatch;
            return heuristicMatch;
        }

        this._cachedInput = null;
        return null;
    }

    _scoreCandidates(elements) {
        if (!elements || !elements.length) return null;
        const vh = window.innerHeight || 800;

        let bestEl = null;
        let bestScore = -Infinity;

        for (const el of elements) {
            let score = 0;
            const rect = el.getBoundingClientRect();
            const meta = (
                (el.getAttribute('formcontrolname') || '') + ' ' +
                (el.getAttribute('aria-label') || '') + ' ' +
                (el.placeholder || '') + ' ' +
                (typeof el.className === 'string' ? el.className : '')
            ).toLowerCase();

            if (el.tagName === 'TEXTAREA') score += 20;
            if (rect.bottom > vh * 0.45) score += 30;
            if (rect.width > 240) score += 20;
            if (el.closest && el.closest('footer, ms-prompt-input-wrapper, ms-prompt-box, [class*="prompt" i]')) score += 40;
            if (/prompt|type|ask|enter|eingabe|frage|nachricht|cdk-textarea/.test(meta)) score += 25;
            if (el === document.activeElement) score += 15;

            if (score > bestScore) {
                bestScore = score;
                bestEl = el;
            }
        }
        return bestEl;
    }

    /**
     * Returns the tightest composer wrapper that includes both the textarea and
     * any sibling attachment chip row (prevents MutationObserver blind spots and body scans).
     */
    getPromptContainer(inputEl) {
        if (!inputEl) return document.body;

        const outerWrapper = inputEl.closest && inputEl.closest('ms-prompt-input-wrapper, footer, form, .prompt-box-container');
        if (outerWrapper && outerWrapper !== document.body) {
            return outerWrapper;
        }

        const promptBox = inputEl.closest && inputEl.closest('ms-prompt-box');
        if (promptBox) {
            // If chips render as a sibling above ms-prompt-box, step up one level if still compact
            const parent = promptBox.parentElement;
            if (parent && parent !== document.body && parent.tagName !== 'MAIN') {
                const rect = parent.getBoundingClientRect();
                if (rect.height > 0 && rect.height < (window.innerHeight || 800) * 0.6) {
                    return parent;
                }
            }
            return promptBox;
        }

        return inputEl.parentElement?.parentElement || inputEl.parentElement || document.body;
    }

    /**
     * TEXT INJECTION (< 60ms, Angular-native, immune to AI Studio's paste-to-.txt interceptor
     * and immune to Chromium background tab rAF suspension).
     */
    async injectText(element, text) {
        if (!text) return false;

        // Wait briefly if textarea is temporarily locked right after a file upload (max 1.5s)
        for (let i = 0; i < 15; i++) {
            if (!element || !element.isConnected || !this._isVisible(element)) {
                element = this.getInput();
            }
            if (element && !element.disabled && !element.readOnly) {
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!element) return false;

        element.focus();

        // Path 1: Native Prototype Setter for <textarea> (bypasses AI Studio paste interceptor)
        if (element.tagName === 'TEXTAREA') {
            const proto = window.HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            let nextValue = text;
            let nextCursorPos = text.length;
            let supportsSelection = false;

            try {
                const start = element.selectionStart;
                const end = element.selectionEnd;
                if (typeof start === 'number' && typeof end === 'number') {
                    supportsSelection = true;
                    const existing = element.value || '';
                    if (existing.length > 0 && start === end && start === existing.length && !existing.endsWith('\n')) {
                        nextValue = `${existing}\n${text}`;
                        nextCursorPos = nextValue.length;
                    } else {
                        nextValue = existing.substring(0, start) + text + existing.substring(end);
                        nextCursorPos = start + text.length;
                    }
                }
            } catch { /* ignore */ }

            if (element._valueTracker) {
                try { element._valueTracker.setValue(''); } catch { /* ignore */ }
            }

            if (nativeSetter) {
                nativeSetter.call(element, nextValue);
            } else {
                element.value = nextValue;
            }

            if (supportsSelection) {
                try { element.selectionStart = element.selectionEnd = nextCursorPos; } catch { /* ignore */ }
            }

            // Wake Angular DefaultValueAccessor & cdkTextareaAutosize synchronously
            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                composed: true,
                inputType: 'insertText',
                data: text
            }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

            // Deterministic 50ms tick (NEVER requestAnimationFrame — Chromium freezes rAF in inactive tabs!)
            await new Promise(r => setTimeout(r, 50));
            if (this._textPresentInElement(element, text)) {
                return true;
            }

            // Path 2: Fallback via execCommand if Angular Signal reverted the value
            element.focus();
            try {
                document.execCommand('insertText', false, text);
                element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await new Promise(r => setTimeout(r, 50));
                if (this._textPresentInElement(element, text)) {
                    return true;
                }
            } catch { /* ignore */ }
        }

        // Path 3: Base strategy fallback (e.g. if Google migrates to contenteditable)
        return await super.injectText(element, text);
    }

    _textPresentInElement(el, text) {
        if (!el) return false;
        const norm = (s) => (s || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[*#_~`>+\-]/g, '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const snippet = norm(text).slice(0, 20);
        if (snippet.length < 3) return true;
        return norm(el.value ?? el.textContent).includes(snippet);
    }

    /**
     * FILE INJECTION: Self-healing 3-channel cascade (paste -> drop -> fileInput)
     * with real-time MutationObserver verification, Error-Snackbar detection & PNG fallback.
     */
    async injectFiles(filesData) {
        if (!filesData || filesData.length === 0) return false;

        const inputEl = this.getInput();
        if (!inputEl) return false;

        let fileObjects = await this._prepareFiles(filesData);
        if (!fileObjects.length) return false;

        const allChannels = ['paste', 'drop', 'fileInput'];
        const orderedChannels = [
            this._preferredChannel,
            ...allChannels.filter(c => c !== this._preferredChannel)
        ];

        for (const channel of orderedChannels) {
            const result = await this._tryFileChannel(channel, inputEl, fileObjects);

            if (result.ok) {
                this._savePreferredChannel(channel);
                return true;
            }

            // If AI Studio rejected an image format (e.g. WebP/AVIF), convert to PNG on-the-fly and retry
            if (result.reason === 'UNSUPPORTED_FORMAT') {
                const converted = await this._convertUnsupportedImagesToPng(fileObjects);
                if (converted.changed) {
                    fileObjects = converted.files;
                    const retry = await this._tryFileChannel(channel, inputEl, fileObjects);
                    if (retry.ok) {
                        this._savePreferredChannel(channel);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    async _prepareFiles(filesData) {
        const files = [];
        for (const f of filesData) {
            try {
                const res = await fetch(f.data);
                const blob = await res.blob();
                const mime = f.type || blob.type || this._guessMimeFromName(f.name);
                const cleanName = f.name || `attachment_${Date.now()}`;
                files.push(new File([blob], cleanName, { type: mime, lastModified: Date.now() }));
            } catch (e) {
                console.warn('LeanPrompts: Could not build File object for', f?.name, e);
            }
        }
        return files;
    }

    _guessMimeFromName(name = '') {
        const ext = name.split('.').pop()?.toLowerCase();
        const map = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
            txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
            json: 'application/json', mp4: 'video/mp4', mp3: 'audio/mpeg'
        };
        return map[ext] || 'application/octet-stream';
    }

    async _convertUnsupportedImagesToPng(files) {
        let changed = false;
        const out = [];
        for (const file of files) {
            if (file.type.startsWith('image/') && file.type !== 'image/png' && file.type !== 'image/jpeg') {
                try {
                    const bmp = await createImageBitmap(file);
                    const canvas = document.createElement('canvas');
                    canvas.width = bmp.width;
                    canvas.height = bmp.height;
                    canvas.getContext('2d').drawImage(bmp, 0, 0);
                    bmp.close?.();
                    const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                    if (pngBlob) {
                        const newName = file.name.replace(/\.[^.]+$/, '') + '.png';
                        out.push(new File([pngBlob], newName, { type: 'image/png', lastModified: Date.now() }));
                        changed = true;
                        continue;
                    }
                } catch { /* fallback to original */ }
            }
            out.push(file);
        }
        return { files: out, changed };
    }

    async _tryFileChannel(channel, inputEl, fileObjects) {
        const container = this.getPromptContainer(inputEl);
        const dt = new DataTransfer();
        fileObjects.forEach(f => {
            try { dt.items.add(f); } catch { /* ignore */ }
        });

        // Start observer BEFORE dispatching to eliminate race conditions
        const observerPromise = this._observeUploadOutcome(container, fileObjects, 2500);

        let dispatched = false;
        if (channel === 'paste') {
            dispatched = this._dispatchPasteFiles(inputEl, dt);
        } else if (channel === 'drop') {
            dispatched = this._dispatchDropFiles(container, inputEl, dt);
        } else if (channel === 'fileInput') {
            dispatched = await this._dispatchViaFileInput(dt);
        }

        if (!dispatched) {
            return { ok: false, reason: 'DISPATCH_FAILED' };
        }
        return await observerPromise;
    }

    _dispatchPasteFiles(inputEl, dt) {
        try {
            inputEl.focus();
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dt
            });
            if (!pasteEvent.clipboardData || pasteEvent.clipboardData.files.length === 0) {
                Object.defineProperty(pasteEvent, 'clipboardData', { value: dt, configurable: true });
            }
            inputEl.dispatchEvent(pasteEvent);
            return true;
        } catch {
            return false;
        }
    }

    _dispatchDropFiles(container, inputEl, dt) {
        try {
            const target = container || inputEl;
            const opts = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt };
            target.dispatchEvent(new DragEvent('dragenter', opts));
            target.dispatchEvent(new DragEvent('dragover', opts));
            target.dispatchEvent(new DragEvent('drop', opts));
            return true;
        } catch {
            return false;
        }
    }

    async _dispatchViaFileInput(dt) {
        const fileInput = await this.getFileInput();
        if (!fileInput) return false;
        try {
            const proto = window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'files')?.set;
            if (nativeSetter) nativeSetter.call(fileInput, dt.files);
            else fileInput.files = dt.files;

            fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

            document.querySelector('.cdk-overlay-backdrop')?.click();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Event-driven upload verification (typically 100-350ms instead of 5.2s blind wait).
     * Watches the local prompt container for attachment chips AND .cdk-overlay-container for error snackbars.
     */
    _observeUploadOutcome(promptContainer, fileObjects, timeoutMs = 2500) {
        return new Promise((resolve) => {
            const countChips = () => promptContainer.querySelectorAll(
                'ms-file-chip, img, [class*="chip" i], [class*="attachment" i], [class*="media" i], [class*="file-preview" i], [class*="thumbnail" i]'
            ).length;

            const initialChips = countChips();
            const fileTokens = fileObjects
                .map(f => f.name.toLowerCase().split('.')[0].slice(0, 10))
                .filter(t => t.length >= 2);

            let settled = false;
            const done = (res) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                promptObserver.disconnect();
                overlayObserver?.disconnect();
                resolve(res);
            };

            const checkErrorSnackbars = () => {
                const alerts = document.querySelectorAll(
                    '.cdk-overlay-container [role="alert"], .mat-mdc-snack-bar-container, simple-snack-bar'
                );
                for (const alert of alerts) {
                    const msg = (alert.textContent || '').toLowerCase();
                    if (/not supported|unsupported|invalid file|cannot upload|format/i.test(msg)) {
                        return done({ ok: false, reason: 'UNSUPPORTED_FORMAT', message: msg });
                    }
                    if (/failed|error|limit|too large/i.test(msg)) {
                        return done({ ok: false, reason: 'UPLOAD_ERROR', message: msg });
                    }
                }
            };

            const checkSuccess = () => {
                checkErrorSnackbars();
                if (settled) return;

                const currentChips = countChips();
                const containerText = (promptContainer.textContent || '').toLowerCase();
                const nameMatched = fileTokens.some(t => containerText.includes(t));

                if (currentChips > initialChips || nameMatched) {
                    const hasSpinner = promptContainer.querySelector('[role="progressbar"], mat-progress-spinner, mat-spinner');
                    if (!hasSpinner) {
                        setTimeout(() => done({ ok: true }), 120);
                    }
                }
            };

            const promptObserver = new MutationObserver(checkSuccess);
            promptObserver.observe(promptContainer, { childList: true, subtree: true, attributes: true });

            const overlayRoot = document.querySelector('.cdk-overlay-container') || document.body;
            const overlayObserver = new MutationObserver(checkErrorSnackbars);
            overlayObserver.observe(overlayRoot, { childList: true, subtree: true });

            const timer = setTimeout(() => {
                checkSuccess();
                if (!settled) done({ ok: false, reason: 'TIMEOUT' });
            }, timeoutMs);
        });
    }

    async getFileInput() {
        const findDirect = () =>
            document.querySelector('input[data-test-upload-file-input], input[type="file"].file-input, ms-prompt-box input[type="file"], input[type="file"]');

        const existing = findDirect();
        if (existing) return existing;

        const addBtn = document.querySelector(
            'ms-add-chunk-menu button, ms-prompt-box button[aria-label*="Add" i], button[aria-label*="Insert" i], button[aria-label*="Upload" i], button[aria-label*="Hinzufügen" i]'
        );
        if (addBtn) {
            addBtn.click();
            await new Promise(r => setTimeout(r, 250));
            const primed = findDirect();
            if (primed) return primed;
        }
        return null;
    }

    /**
     * Fast verification without 300ms mandatory upfront wait (Zero-Reflow textContent).
     */
    async verifyInjection(element, text) {
        if (!element) return false;
        if (this._textPresentInElement(element, text)) return true;

        for (let i = 0; i < 4; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (!element.isConnected) element = this.getInput() || element;
            if (this._textPresentInElement(element, text)) return true;
        }
        return false;
    }
}
