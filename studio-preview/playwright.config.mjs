import { defineConfig } from '@playwright/test';
const [width, height] = (process.env.BG_VIEWPORT || '1440x900').split('x').map(Number);
export default defineConfig({
  testDir: '.',
  testMatch: '**/browser.check.mjs',
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    viewport: { width, height },
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
