import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:5173',
    video: 'on',
    trace: 'on-first-retry',
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
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
