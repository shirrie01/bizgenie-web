import { defineConfig } from '@playwright/test';
const [width, height] = (process.env.BG_VIEWPORT || '1440x900').split('x').map(Number);
// Cloudflare Pages release candidate check (BG-LAUNCH-011): the build in dist-pages served WITH the generated _headers (strict CSP) on port 4190. Mocked identity and API (class: MOCKED).
export default defineConfig({
  testDir: '.', testMatch: '**/*.pages.qa.mjs', retries: 0, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4190', viewport: { width, height }, browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
