import { defineConfig } from '@playwright/test';
// Self-test of the hosted acceptance harness (BG-LAUNCH-017). EVIDENCE CLASS: MOCKED. It proves the harness logic; it is never hosted acceptance.
export default defineConfig({ testDir: '.', testMatch: '**/*.hostedself.qa.mjs', retries: 0, workers: 1, reporter: 'list', timeout: 90000 });
