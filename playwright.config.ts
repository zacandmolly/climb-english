import { defineConfig, devices } from '@playwright/test';

// Allow local runs on a free port when another worktree owns 5173:
//   PLAYWRIGHT_PORT=5174 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const port = process.env.PLAYWRIGHT_PORT ?? '5173';

// E2E walkthrough (R5): drives the karaoke studio against the local dev server
// (Express + Vite middleware on 127.0.0.1:5173). Playback is recorded to
// test-results/ via `video: 'on'`, and the spec takes fixed-time screenshots.
export default defineConfig({
  testDir: './e2e',
  // Video loading + a ≥10s playback window needs headroom over the default 30s.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'on',
    // The app is a local prototype; block external requests so the test never
    // depends on YouTube/analytics and always falls back to the local mp4.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Issue #22/#24: the mobile player flows must run on a real mobile
      // Chromium profile (Pixel 7) and on mobile WebKit, not only desktop.
      name: 'pixel-7-chromium',
      testMatch: /youtube-(?:handoff|failure)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: /youtube-(?:handoff|failure)\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: `node scripts/port-guard.mjs --port ${port} && PORT=${port} node server/index.mjs`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
