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

/**
 * Z.ai Strategy
 * 
 * Minimal-invasive implementation for Z.ai.
 * Relies on the robust findBestTextInput() heuristic from the base class
 * to ensure we don't break on minor UI updates.
 */
export class ZaiStrategy extends AbstractBaseStrategy {
    constructor() {
        super('Z.ai', ['chat.z.ai', 'z.ai']);
    }

    /**
     * Use default behavior from AbstractBaseStrategy:
     * 1. getInput() -> findBestTextInput()
     * 2. injectText() -> Standard DOM manipulation + Events
     * 
     * This is the safest, most "zero-regression" approach for a new platform
     * where we don't have deep specific knowledge of their DOM quirks yet.
     */
}
