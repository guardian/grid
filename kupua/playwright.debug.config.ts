/**
 * Playwright config for scrubber diagnostic tests.
 *
 * Works against both local ES and real ES (TEST via start.sh --use-TEST).
 * No globalSetup (no local ES health check — the test itself handles it).
 * No webServer (assumes dev server is already running on port 3000).
 *
 * Run:
 *   npx playwright test e2e/scrubber-debug.spec.ts --config=playwright.debug.config.ts --headed
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/scrubber-debug.spec.ts"],

  /* Generous timeouts for real cluster + SSH tunnel */
  timeout: 120_000,
  globalTimeout: 10 * 60_000,

  retries: 0,
  workers: 1,

  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1987, height: 1110 },
    deviceScaleFactor: 1.25,
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  /* Don't auto-start — user already has dev server running */
});

