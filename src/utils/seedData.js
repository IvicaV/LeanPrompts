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
export const SEED_SNIPPETS = [
  {
    id: 'demo-snippet-1',
    name: 'Expert',
    content: `You are an elite, world-class expert in your field.
Your goal is to break down complex concepts with absolute clarity, avoiding unnecessary jargon and corporate fluff.

Please tailor your explanation perfectly for an audience of: {{Audience_Level: beginner}}.

%%
💡 THE "WRITE ONCE, UPDATE EVERYWHERE" RULE
This is a Snippet. Think of it as a reusable building block. 

Instead of copy-pasting your favorite persona into 50 different prompts, you just type @Expert. The best part? If you ever tweak this text here, EVERY prompt in your library using it updates instantly.

Notice the variable above? Snippets can contain their own variables! When you use this snippet in a prompt, that variable will automatically appear in your sidebar ready to be filled out.
%%`,
    updatedAt: new Date().toISOString()
  }
];

export const SEED_PROMPTS = [
  {
    id: 'demo-prompt-1',
    title: '✨ Welcome to LeanPrompts',
    content: `@Expert

Analyze the attached document: {{file: Reference_Material}}

Select your workflow: {{Mode: Quick|Thorough|Creative}}

%%
PRO-TIPS:
1. DROPDOWN: Use {{Key: Option1|Option2}} to create interactive menus.
2. PASTE: Copy any image to your clipboard and press Ctrl+V over the file zone.
3. COMMENT: Use %% comments %% to leave internal notes the AI won't see.
4. REQUIRED: Use {{!Variable}} to make a field mandatory.
%%`,
    chain: [
      {
        id: 'demo-step-1',
        title: '🎯 Smart Filling',
        content: `@Expert

Analyze the attached document: {{file: Reference_Material}}

Select your workflow: {{Mode: Quick|Thorough|Creative}}`,
        notes: "This step shows how variables and files link together.",
        versions: [],
        isVisible: true
      },
      {
        id: 'demo-step-2',
        title: '⛓️ Phase 2: Chaining & Roadmaps',
        content: `Excellent. Now, based on the roadmap you just created in the previous step, let's execute the first phase.

Please provide **3 highly specific, practical exercises** I can do today to get started. Format the output as a clean Markdown table.

%%
🧠 WHY CHAINS ARE POWERFUL
Don't ask the AI to do 10 complex things at once. It will hallucinate.
Instead, build "Prompt Chains". Inject Step 1, wait for the AI's output, then inject Step 2. This forces a logical "Chain of Thought".

🔥 PRO TIP: Try changing a word in this text right now, then check the "History" tab on the right. LeanPrompts automatically takes snapshots of your edits so you never lose a good prompt version!
%%`,
        notes: "",
        versions: [],
        isVisible: true
      }
    ],
    tags: ['Tutorial', 'Getting Started'],
    versions: [],
    updatedAt: new Date().toISOString()
  }
];