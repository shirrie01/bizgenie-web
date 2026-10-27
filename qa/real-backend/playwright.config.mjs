import { defineConfig } from '@playwright/test';
const [width, height] = (process.env.BG_VIEWPORT || '1440x900').split('x').map(Number);
// Browser acceptance against the REAL local backend harness (qa/real-backend/server.mjs). Port 4182 serves the built app with every capability gate ON.
export default defineConfig({
  testDir: '.', testMatch: '**/*.rb.qa.mjs', retries: 0, workers: 1, reporter: 'list', timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4182', viewport: { width, height }, browserName: 'chromium', trace: 'retain-on-failure' },
});
