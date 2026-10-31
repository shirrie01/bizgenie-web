import { defineConfig } from '@playwright/test';
const [width, height] = (process.env.BG_VIEWPORT || '1440x900').split('x').map(Number);
// Premium Studio browser QA (BG-STUDIO-008-FE). Runs against a build made with VITE_PREMIUM_STUDIO_ENABLED=true.
// Its files end in .browser.qa.mjs so the flag-off job (qa/playwright.config.mjs) never picks them up.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.browser.qa.mjs',
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4180', viewport: { width, height }, browserName: 'chromium', trace: 'retain-on-failure' },
});
