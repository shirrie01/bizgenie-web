// Real-browser QA of the public website (BG-WEB-001). Builds the site twice (with and without a registration endpoint), serves each with the reference
// security headers (strict CSP) and runs the in-memory reference lead stub. No network beyond 127.0.0.1. Width is chosen with BG_VIEWPORT=1440x900 etc.
import { defineConfig } from "@playwright/test";
const [w, h] = (process.env.BG_VIEWPORT || "1440x900").split("x").map(Number);
export default defineConfig({
  testDir: ".", testMatch: "*.browser.qa.mjs", timeout: 60000, workers: 1, retries: process.env.CI ? 1 : 0, reporter: [["list"]],
  use: { reducedMotion: "reduce", baseURL: "http://127.0.0.1:4300", viewport: { width: w, height: h }, trace: "off", screenshot: "off" },
  webServer: [
    { command: "SITE_API_URL=http://127.0.0.1:4301 SITE_MEASUREMENT=1 SITE_OUT=site-dist-e2e node site/build.mjs && SITE_OUT=site-dist-e2e SITE_PORT=4300 STUB_PORT=4301 node site/dev/serve.mjs", url: "http://127.0.0.1:4300/", reuseExistingServer: false, timeout: 60000, cwd: "../.." },
    { command: "SITE_OUT=site-dist-closed node site/build.mjs && SITE_OUT=site-dist-closed SITE_PORT=4302 STUB_PORT=4303 node site/dev/serve.mjs", url: "http://127.0.0.1:4302/", reuseExistingServer: false, timeout: 60000, cwd: "../.." },
  ],
});
