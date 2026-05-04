// PR — Cursor IDE live test + Playwright canvas screenshots.
//
// Two test directories:
//   tests/playwright/                — generic specs (canvas, user docs)
//   tests/playwright/cursor_live/    — manual-trigger specs the operator runs
//                                      from a real Cursor IDE session
//
// Tests assume a static HTTP server is serving the `Sima (Remix)/` folder
// on http://localhost:8000 (`npm run ui:serve` does exactly that).

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/playwright/_report' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  // Auto-start the static server before tests; tear down after.
  webServer: process.env.PLAYWRIGHT_NO_SERVER ? undefined : {
    command: 'python3 -m http.server 8000 --directory "Sima (Remix)"',
    url: 'http://localhost:8000/index.html',
    timeout: 10_000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
