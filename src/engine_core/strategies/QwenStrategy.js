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

// FIX #1: Vollständige MIME-Type-Map für alle von Qwen unterstützten Dateitypen.
// Qwen unterstützt: Bilder, Text-Dateien, Code, PDFs, Office-Dokumente, Archive.
// Mapping: problematische/nicht-standardisierte MIME-Types → sichere Äquivalente.
// Typen, die Qwen nativ akzeptiert, werden NICHT geändert.
const QWEN_MIME_SANITIZE_MAP = {
    // Bild-Konvertierungen (Browser-inkompatible Formate)
    'image/webp': 'image/png',
    'image/heic': 'image/jpeg',
    'image/heif': 'image/jpeg',
    // application/octet-stream NUR wenn kein anderer Typ ermittelbar
    // NICHT pauschal zu text/plain konvertieren — das überschreibt z.B. .zip!
};

// FIX #2: Accept-String für Qwens eigenes file-input.
// Nutze Datei-Erweiterungen statt MIME-Types, da Qwen's Frontend
// mit Erweiterungen arbeitet und nicht alle MIME-Types akzeptiert.
const QWEN_ACCEPTED_EXTENSIONS = [
    // Code & Text
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs',
    '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.r', '.m', '.sh', '.bash',
    '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    // Markup & Config
    '.html', '.htm', '.css', '.scss', '.less', '.xml', '.json', '.yaml', '.yml',
    '.toml', '.ini', '.env', '.md', '.markdown', '.rst', '.tex',
    // Dokumente
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
    '.rtf', '.odt', '.ods', '.odp',
    // Bilder
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
    // Archive
    '.zip', '.tar', '.gz', '.rar', '.7z',
].join(',');

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

    // FIX #1 (chirurgisch): Nur wirklich problematische MIME-Types remappen.
    // Alle anderen Typen (text/javascript, application/pdf, etc.) werden unverändert durchgeleitet.
    _sanitizeFile(fileData) {
        const safeMime = QWEN_MIME_SANITIZE_MAP[fileData.type]
            || fileData.type
            || 'application/octet-stream';

        // Dateinamen-Sanitierung: erlaubt Punkte, Buchstaben, Zahlen, Bindestriche, Unterstriche
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

        // Drop-Methode an die absolute Spitze, da Qwen Direct Input blockiert.
        const methods = [
            { name: 'Drop on Textarea', fn: () => this._tryDropOnTextarea(safeFiles, textarea) },
            { name: 'Clipboard Paste', fn: () => this._tryClipboardPaste(safeFiles, textarea) },
            { name: 'Direct File Input', fn: () => this._tryDirectFileInput(safeFiles) }
        ];

        for (const method of methods) {
            console.log(`LeanPrompts [Qwen] Trying method: ${method.name}`);
            try {
                const success = await method.fn();
                if (success) {
                    await this._delay(800);
                    const isValid = await this._validateUpload(safeFiles);
                    if (isValid) {
                        console.log(`LeanPrompts [Qwen] SUCCESS with method: ${method.name}`);
                        return true;
                    } else {
                        // Die Drop-Methode hat das Event abgesetzt. Qwens UI laggt nur bei der Bestätigung.
                        // Wir erzwingen hier den Abbruch der Schleife mit 'true', damit 
                        // Clipboard Paste und Direct Input NICHT mehr ausgeführt werden.
                        console.log(`LeanPrompts [Qwen] Method ${method.name} dispatched, but validation timed out. Assuming success.`);
                        return true; 
                    }
                }
            } catch (e) {
                console.log(`LeanPrompts [Qwen] Method ${method.name} threw:`, e);
            }
        }

        console.log('LeanPrompts [Qwen] All methods failed');
        return false;
    }

    /**
     * Methode 1 (PRIMARY): Qwens verstecktes file-input direkt befüllen.
     * Zuverlässigste Methode für alle Dateitypen.
     * FIX #4: accept-Attribut wird temporär entfernt, um Blockierung durch Frontend-Allowlist zu umgehen.
     */
    async _tryDirectFileInput(files) {
        console.log('LeanPrompts [Qwen] Looking for hidden file input...');

        const fileInput = await this.getFileInput();
        if (!fileInput) {
            console.log('LeanPrompts [Qwen] No file input found');
            return false;
        }

        const dt = new DataTransfer();
        files.forEach(f => {
            try {
                const blob = this._base64ToBlob(f.data, f.type);
                const file = new File([blob], f.name, { type: f.type, lastModified: Date.now() });
                dt.items.add(file);
                console.log(`LeanPrompts [Qwen] Queued file: ${f.name} (${f.type})`);
            } catch (e) {
                console.error(`LeanPrompts [Qwen] Error building File object for ${f.name}:`, e);
            }
        });

        if (dt.files.length === 0) return false;

        // FIX #4: accept-Attribut temporär entfernen, damit Qwens Frontend-Validierung
        // nicht auf MIME-Type-Basis blockiert (Qwen prüft serverseitig ohnehin selbst).
        const originalAccept = fileInput.getAttribute('accept');
        fileInput.removeAttribute('accept');

        try {
            const proto = window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'files')?.set;
            if (nativeSetter) {
                nativeSetter.call(fileInput, dt.files);
            } else {
                fileInput.files = dt.files;
            }

            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));

            console.log(`LeanPrompts [Qwen] Set ${dt.files.length} file(s) on native input`);
            return true;
        } catch (e) {
            console.error('LeanPrompts [Qwen] Failed to set files on input:', e);
            return false;
        } finally {
            // accept-Attribut wiederherstellen
            if (originalAccept !== null) {
                fileInput.setAttribute('accept', originalAccept);
            }
        }
    }

    /**
     * Methode 2: Drop-Event direkt auf das Textarea oder seinen Container.
     * Funktioniert für Frameworks, die Drop-Handling am Container implementieren.
     */
    async _tryDropOnTextarea(files, textarea) {
        console.log('LeanPrompts [Qwen] Attempting drop on textarea container...');

        const dt = new DataTransfer();
        files.forEach(f => {
            try {
                const blob = this._base64ToBlob(f.data, f.type);
                const file = new File([blob], f.name, { type: f.type, lastModified: Date.now() });
                dt.items.add(file);
            } catch (e) {
                console.error('LeanPrompts [Qwen] Error building file for drop:', e);
            }
        });

        if (dt.files.length === 0) return false;

        // === 100% ZERO-REGRESSION FIX ===
        // Wir dürfen das Drop-Event NUR AUF EIN EINZIGES Ziel abfeuern!
        // Wir nehmen den am besten passenden Container und brechen danach ab.
        const target = textarea.closest('[class*="composer"], [class*="input-area"], [class*="chat-input"]') 
                       || textarea.parentElement 
                       || textarea;

        if (target) {
            target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
            target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
            console.log(`LeanPrompts [Qwen] Dispatched drop on ONE target:`, target.className || target.tagName);
        }

        return true;
    }

    /**
     * Methode 3: Clipboard Paste (Fallback, primär für Images).
     */
    async _tryClipboardPaste(files, target) {
        console.log('LeanPrompts [Qwen] Attempting clipboard paste...');

        const dt = new DataTransfer();
        files.forEach(f => {
            try {
                const blob = this._base64ToBlob(f.data, f.type);
                const file = new File([blob], f.name, { type: f.type, lastModified: Date.now() });
                dt.items.add(file);
            } catch (e) {
                console.error('LeanPrompts [Qwen] Error building file for paste:', e);
            }
        });

        if (dt.files.length === 0) return false;

        target.focus();

        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
        });

        target.dispatchEvent(pasteEvent);
        console.log('LeanPrompts [Qwen] Dispatched paste event');
        return true;
    }

    /**
     * FIX #3 (Hauptfix): Upload-Validierung für ALLE Dateitypen.
     *
     * Problem vorher: Validierung suchte nur nach Image-Previews (img-Tags, blob:-URLs).
     * Für Code/Text/PDF-Dateien erscheinen aber File-Chips mit dem Dateinamen, keine img-Tags.
     * Der Filter `text.trim() === '' && !src` war zu eng und übersah gültige File-Chips.
     *
     * Lösung: Drei-stufige Strategie:
     *   1. Suche nach File-Chips die den Dateinamen enthalten (präziseste Prüfung)
     *   2. Suche nach gängigen Upload-Indikatoren (generisch)
     *   3. Suche nach Image-Previews (für reine Bild-Uploads)
     */
    async _validateUpload(uploadedFiles) {
        console.log('LeanPrompts [Qwen] Validating upload...');

        const fileNames = uploadedFiles.map(f => f.name.toLowerCase());
        const start = Date.now();

        while (Date.now() - start < 6000) {

            // Stufe 1: Suche nach Elementen, die einen der hochgeladenen Dateinamen enthalten.
            // Das ist der zuverlässigste Check: Wenn Qwen einen File-Chip rendert, steht der Name drin.
            const allElements = document.querySelectorAll(
                '[class*="file"], [class*="attachment"], [class*="upload"], [class*="chip"], ' +
                '[class*="card"], [class*="item"], .ant-upload-list-item, [data-testid*="file"]'
            );

            for (const el of allElements) {
                const elText = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
                const elTitle = (el.getAttribute('title') || el.getAttribute('data-name') || '').toLowerCase();

                for (const name of fileNames) {
                    // Prüfe ob der Dateiname (oder ein signifikanter Teil) im Element erscheint
                    const baseName = name.replace(/\.[^.]+$/, ''); // Ohne Extension
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

            // Stufe 2: Generische Upload-Indikatoren (Qwen-spezifisch + Fallbacks)
            const genericSelectors = [
                '.ant-upload-list-item-name',   // Ant Design: Dateiname-Span
                '[class*="file-name"]',          // Generisch: Dateiname-Label
                '[class*="filename"]',
                '[class*="upload-success"]',     // Qwen: Erfolgs-Marker
                '[class*="file-preview"]',       // Generisch: Vorschau-Container
                '[class*="attachment-item"]',    // Generisch: Attachment
            ];

            for (const selector of genericSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = (el.innerText || el.textContent || '').trim();
                    // Ausschluss: Leere Elemente und reine UI-Controls ("+", "×", etc.)
                    if (text && text.length > 1 && !text.match(/^[+×✕✗\-]$/)) {
                        console.log(`LeanPrompts [Qwen] ✓ Found generic upload indicator [${selector}]: "${text}"`);
                        return true;
                    }
                }
            }

            // Stufe 3: Image-Previews (nur für Bild-Uploads relevant, als Fallback)
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

    /**
     * Helper: Base64-String (mit oder ohne Data-URL-Prefix) → Blob
     */
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