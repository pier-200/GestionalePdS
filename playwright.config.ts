import { defineConfig, devices } from '@playwright/test';

/**
 * Test end-to-end sull'applicazione compilata, nel browser Microsoft Edge installato
 * (nessun download di browser necessario). I backend GitHub e Supabase sono emulati
 * intercettando le richieste di rete del browser.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL ?? 'msedge' }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
