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

/**
 * Deepseek Strategy: Standard textarea with lazy file input.
 */
export class DeepseekStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Deepseek', ['chat.deepseek.com']);
    }

    getInput() {
        return document.querySelector('textarea#chat-input') || findBestTextInput();
    }

    async getFileInput() {
        return await waitForElement(() => findAllElementsDeep(document, el => el.tagName === 'INPUT' && el.type === 'file')[0], 3000);
    }
}
