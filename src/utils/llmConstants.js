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
export const DEFAULT_LLMS = [
    // CRITICAL: For AI Studio, do NOT use /app/prompts/new - it causes "Prompt cannot be accessed" error.
    // The correct robust URL is /prompts/new_chat.
    { id: 'aistudio', name: 'AI Studio', url: 'https://aistudio.google.com', newChatUrl: 'https://aistudio.google.com/prompts/new_chat', icon: 'google' },
    { id: 'gpt4', name: 'ChatGPT', url: 'https://chatgpt.com', newChatUrl: 'https://chatgpt.com/?model=auto', icon: 'openai' },
    { id: 'claude', name: 'Claude', url: 'https://claude.ai', newChatUrl: 'https://claude.ai/new', icon: 'anthropic' },
    { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', newChatUrl: 'https://gemini.google.com/app', icon: 'google' },
    { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai', newChatUrl: 'https://www.perplexity.ai/', icon: 'search' },
    { id: 'grok', name: 'Grok', url: 'https://grok.com', newChatUrl: 'https://grok.com/', icon: 'sparkles' },
    { id: 'deepseek', name: 'Deepseek', url: 'https://chat.deepseek.com', newChatUrl: 'https://chat.deepseek.com/', icon: 'brain' },
    { id: 'qwen', name: 'Qwen', url: 'https://chat.qwenlm.ai', newChatUrl: 'https://chat.qwenlm.ai/', icon: 'message-square', alternativeDomains: ['chat.qwen.ai', 'tongyi.aliyun.com'] },
    { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.com', newChatUrl: 'https://www.kimi.com/chat', icon: 'moon' },
    { id: 'poe', name: 'Poe', url: 'https://poe.com', newChatUrl: 'https://poe.com/', icon: 'bot' },
    { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai', newChatUrl: 'https://chat.mistral.ai/chat', icon: 'wind' },
    { id: 'zai', name: 'Z.ai', url: 'https://chat.z.ai', newChatUrl: 'https://chat.z.ai', icon: 'zap' },
    { id: 'minimax', name: 'MiniMax', url: 'https://agent.minimax.io', newChatUrl: 'https://agent.minimax.io', icon: 'bot' },
    { id: 'meta', name: 'Meta AI', url: 'https://www.meta.ai', newChatUrl: 'https://www.meta.ai/', icon: 'message-circle' }
];

export const getLlmConfig = (llm) => {
    if (!llm) return null;

    // Always prefer the "gold standard" defaults for known IDs
    // This fixes stale URLs persisting in storage (like AI Studio's old path)
    const known = DEFAULT_LLMS.find(d => d.id === llm.id);
    if (known) {
        return { ...llm, newChatUrl: known.newChatUrl };
    }

    // Fallback for custom LLMs
    if (llm.newChatUrl) return llm;
    return { ...llm, newChatUrl: llm.url };
};

export const getInjectionTooltip = (llmName, contextLabel = "Content") => {
    return `Click: Inject ${contextLabel} into ${llmName}\nCtrl+Click: New Chat & Inject\nShift+Click: Open ${llmName}`;
};
