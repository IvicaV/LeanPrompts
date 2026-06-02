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
import { ChatGPTStrategy } from './ChatGPTStrategy.js';
import { ClaudeStrategy } from './ClaudeStrategy.js';
import { GeminiStrategy } from './GeminiStrategy.js';
import { AIStudioStrategy } from './AIStudioStrategy.js';
import { PerplexityStrategy } from './PerplexityStrategy.js';
import { KimiStrategy } from './KimiStrategy.js';
import { QwenStrategy } from './QwenStrategy.js';
import { DeepseekStrategy } from './DeepseekStrategy.js';
import { GrokStrategy } from './GrokStrategy.js';
import { MistralStrategy } from './MistralStrategy.js';
import { BingStrategy } from './BingStrategy.js';
import { ZaiStrategy } from './ZaiStrategy.js';
import { MinimaxStrategy } from './MinimaxStrategy.js';
import { GenericStrategy } from './GenericStrategy.js';
import { MetaStrategy } from './MetaStrategy.js';

/**
 * Injection Manager (Factory/Registry).
 * Decides which strategy to use for a given context.
 */
export class InjectionManager {
    constructor() {
        this.strategies = [
            new BingStrategy(),
            new ChatGPTStrategy(),
            new QwenStrategy(),
            new ClaudeStrategy(),
            new GeminiStrategy(),
            new AIStudioStrategy(),
            new PerplexityStrategy(),
            new DeepseekStrategy(),
            new KimiStrategy(),
            new GrokStrategy(),
            new MistralStrategy(),
            new ZaiStrategy(),
            new MinimaxStrategy(),
            new MetaStrategy(),
        ];
        this.fallback = new GenericStrategy();
    }

    /**
     * Returns the best strategy for the given URL.
     */
    getStrategy(url) {
        for (const strategy of this.strategies) {
            if (strategy.detect(url)) {
                return strategy;
            }
        }
        return this.fallback;
    }

    /**
     * Convenience: Get strategy by name.
     */
    getStrategyByName(name) {
        return this.strategies.find(s => s.name === name) || this.fallback;
    }
}

// Singleton Instance
export const injectionManager = new InjectionManager();
