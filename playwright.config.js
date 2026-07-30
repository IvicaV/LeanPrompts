import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pathToExtension = path.join(__dirname, 'dist');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 8000
  },
  fullyParallel: false, // Run sequentially for browser extension tab isolation
  retries: 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    headless: false, // Chrome extensions require headed mode or chromium persistent context
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        launchOptions: {
          args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox'
          ]
        }
      }
    }
  ]
});
