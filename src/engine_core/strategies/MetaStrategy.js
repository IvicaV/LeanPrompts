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
 * Meta AI Strategy
 * Isoliert, kapselt alle Meta-spezifischen Formatierungs-Logiken.
 */
import { AbstractBaseStrategy } from './AbstractBaseStrategy.js';

export class MetaStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Meta AI', ['meta.ai']);
    }

    getInput() {
        // Fokus auf das primäre Eingabefeld ohne globale Heuristiken zu kompromittieren
        return document.querySelector('textarea[aria-label*="Message"]') || 
               document.querySelector('div[contenteditable="true"]') ||
               null;
    }

    async injectText(element, text) {
        if (!element || !text) return false;

        element.focus();
        
        // 1. CLEAR: Sicherer Reset
        if (element.value !== undefined) element.value = "";
        else element.innerText = "";

        // 2. PASTE-SIMULATION: Statt einzelner Zeichen senden wir das Ganze als Paste-Event.
        // Das trickst Meta.ai aus, weil es denkt, der User hätte den Text mit STRG+V eingefügt.
        // Das ist für React fast unmöglich zu blocken, da es ein User-Event ist.
        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', text);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dataTransfer
            });
            
            element.dispatchEvent(pasteEvent);

            // 3. Nach dem Paste-Event senden wir ein Input-Event zur Synchronisierung
            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: text
            }));
            
            return true;
        } catch (e) {
            console.error("LeanPrompts Meta: Paste failed, falling back", e);
            // Fallback auf die manuelle Simulation, aber diesmal langsamer
            return await super.injectText(element, text);
        }
    }
}
