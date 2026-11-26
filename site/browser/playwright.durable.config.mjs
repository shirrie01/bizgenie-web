import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "durable.browser.mjs",
  workers: 1,
  use: {
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.BG_CHROMIUM_EXECUTABLE || undefined },
  },
});
