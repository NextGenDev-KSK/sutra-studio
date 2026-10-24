import { defineConfig } from '@playwright/test';

// Locally the suite uses the installed Microsoft Edge (no browser download);
// CI installs Playwright's Chromium. Set E2E_TARGET=preview to run against the
// production build (with its Content-Security-Policy) instead of the dev server.
const preview = process.env.E2E_TARGET === 'preview';
const port = preview ? 4173 : 5173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    channel: process.env.CI ? undefined : 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: preview ? 'npx vite build && npx vite preview --port 4173 --strictPort' : 'npx vite --port 5173 --strictPort',
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', testIgnore: /responsive|screens/ },
    { name: 'mobile', testMatch: /responsive/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'screens', testMatch: /screens/ },
  ],
});
