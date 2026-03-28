/**
 * Playwright config for manual smoke tests against real ES.
 *
 * This is a separate config that ONLY runs the manual smoke test file.
 * It's used by scripts/run-smoke.mjs — never invoked directly.
 *
 * Key differences from the main playwright.config.ts:
 * - testMatch targets only manual-smoke-test.spec.ts
 * - No testIgnore (the main config ignores this file)
 * - No globalSetup (real ES doesn't need the local ES health check)
 * - Always headed
 * - Longer timeouts (real cluster + SSH tunnel)
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/manual-smoke-test.spec.ts",

  /* No globalSetup — we don't want the local ES health check.
   * The smoke tests themselves check total > 100k and skip if local. */

  /* Generous timeouts for real cluster + SSH tunnel */
  timeout: 120_000,
  globalTimeout: 10 * 60_000,

  /* No retries — we want to see the real failure */
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
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Don't auto-start a web server — the user already has start.sh --use-TEST running */
});

