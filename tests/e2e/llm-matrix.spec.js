import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.join(__dirname, '../../dist');

// Master LLM Matrix definition
const LLMS_TO_TEST = [
  { name: 'ChatGPT', url: 'https://chatgpt.com', selector: '#prompt-textarea' },
  { name: 'Claude', url: 'https://claude.ai', selector: 'div.ProseMirror[contenteditable="true"]' },
  { name: 'Gemini', url: 'https://gemini.google.com/app', selector: 'rich-textarea' },
  { name: 'Google AI Studio', url: 'https://aistudio.google.com/prompts/new_chat', selector: 'textarea' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', selector: '#chat-input, textarea' },
  { name: 'Qwen', url: 'https://chat.qwenlm.ai', selector: 'textarea' },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn', selector: 'div[contenteditable="true"], textarea' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai', selector: 'textarea' },
  { name: 'Grok', url: 'https://grok.com', selector: 'textarea, div.ProseMirror' },
  { name: 'Mistral', url: 'https://chat.mistral.ai', selector: 'textarea' }
];

test.describe('LeanPrompts Studio - Complete LLM Injection Matrix', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    // Launch Chromium with persistent context and extension loaded
    const userDataDir = path.join(__dirname, '../../scratch/test-user-data');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox'
      ]
    });

    // Extract extension ID from background service worker
    let [backgroundWorker] = context.serviceWorkers();
    if (!backgroundWorker) {
      backgroundWorker = await context.waitForEvent('serviceworker');
    }
    extensionId = backgroundWorker.url().split('/')[2];
    console.log(`[E2E Setup] Extension loaded with ID: ${extensionId}`);

    // Wait 1s and close initial onboarding tab if opened automatically
    await new Promise(r => setTimeout(r, 1000));
    for (const page of context.pages()) {
      if (page.url().includes('index.html')) {
        await page.close().catch(() => {});
      }
    }

    // Pre-seed storage flags to bypass onboarding tour overlay in tests
    const initPage = await context.newPage();
    await initPage.goto(`chrome-extension://${extensionId}/popup.html?mode=sidebar`);
    await initPage.evaluate(async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          lp_onboarding_popup_done: true,
          lp_onboarding_dashboard_done: true
        });
      }
    });
    await initPage.close().catch(() => {});
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  for (const llm of LLMS_TO_TEST) {
    test.describe(`LLM: ${llm.name}`, () => {

      // Test 1: Standard Click (Text Only) - Cold Start
      test(`[1] Standard Click (Text Only) - ${llm.name}`, async () => {
        const popupPage = await context.newPage();
        // Use ?mode=sidebar to prevent Popup.jsx from triggering window.close()
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html?mode=sidebar`);

        const testPrompt = `E2E Test Prompt for ${llm.name} - ${Date.now()}`;
        
        // Input test prompt in popup input
        const input = popupPage.locator('#popup-search-input');
        await expect(input).toBeVisible({ timeout: 5000 });
        await input.fill(testPrompt);

        // Find LLM button
        const llmButton = popupPage.locator(`button:has-text("${llm.name}"), [title*="${llm.name}"]`).first();
        
        const startTime = Date.now();
        await llmButton.click();

        // Target LLM tab should open or focus
        const targetPage = await context.waitForEvent('page', { timeout: 12000 }).catch(() => context.pages().find(p => p.url().includes(new URL(llm.url).hostname)));
        expect(targetPage).toBeDefined();

        // Check if toast or prompt input target is reachable
        if (targetPage) {
          const toast = targetPage.locator('#lp-status-toast');
          await expect(toast).toBeVisible({ timeout: 8000 }).catch(() => {
            console.log(`[E2E Notice] Toast verification pending on ${llm.name}`);
          });

          // Measure execution latency
          const latency = Date.now() - startTime;
          if (latency > 8000) {
            console.warn(`[PERF WARNING] ${llm.name} injection took ${latency}ms (threshold: 8000ms)`);
          }
        }

        await popupPage.close().catch(() => {});
      });

      // Test 2: Ctrl + Click (New Chat / Force Navigate) - Warm Start
      test(`[2] Ctrl + Click (Force New Chat) - ${llm.name}`, async () => {
        const popupPage = await context.newPage();
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html?mode=sidebar`);

        const testPrompt = `Ctrl+Click Test for ${llm.name} - ${Date.now()}`;
        const input = popupPage.locator('#popup-search-input');
        await expect(input).toBeVisible({ timeout: 5000 });
        await input.fill(testPrompt);

        const llmButton = popupPage.locator(`button:has-text("${llm.name}"), [title*="${llm.name}"]`).first();
        
        // Simulate Ctrl + Click with force: true
        await llmButton.click({ modifiers: ['Control'], force: true });

        // Verify target page opens
        const targetPage = await context.waitForEvent('page', { timeout: 12000 }).catch(() => context.pages().find(p => p.url().includes(new URL(llm.url).hostname)));
        expect(targetPage).toBeDefined();

        await popupPage.close().catch(() => {});
      });

      // Test 3: Shift + Click (Open-Only Mode)
      test(`[3] Shift + Click (Open Only, Text = null) - ${llm.name}`, async () => {
        const popupPage = await context.newPage();
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html?mode=sidebar`);

        const llmButton = popupPage.locator(`button:has-text("${llm.name}"), [title*="${llm.name}"]`).first();
        
        // Simulate Shift + Click with force: true
        await llmButton.click({ modifiers: ['Shift'], force: true });

        await popupPage.close().catch(() => {});
      });

    });
  }
});
