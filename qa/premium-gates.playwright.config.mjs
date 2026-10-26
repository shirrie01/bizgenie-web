import { defineConfig } from '@playwright/test';
const [width, height] = (process.env.BG_VIEWPORT || '1440x900').split('x').map(Number);
// Premium QA with the 019 capability gates ON (port 4181). Its files end in .gates.qa.mjs so neither the flag-off job nor the default
// Premium job (qa/premium.playwright.config.mjs, port 4180, gates off) ever picks them up.
export default defineConfig({
  testDir: '.', testMatch: '**/*.gates.qa.mjs', retries: 0, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4181', viewport: { width, height }, browserName: 'chromium', trace: 'retain-on-failure' },
});
