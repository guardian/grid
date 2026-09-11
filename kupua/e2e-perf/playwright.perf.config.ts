/**
 * Playwright config for rendering performance tests.
 *
 * Runs only perf.spec.ts.
 *
 * Key differences from the main playwright.config.ts:
 * - testDir is ./e2e-perf (this directory)
 * - No globalSetup — real ES doesn't need the local ES health check
 * - Always headed (so the developer can watch)
 * - Longer timeouts (real cluster + SSH tunnel)
 * - JSON reporter + list reporter (JSON feed the audit harness)
 *
 * Invoked by:
 *   node e2e-perf/run-audit.mjs --label "..."
 * or directly:
 *   npx playwright test --config=e2e-perf/playwright.perf.config.ts
 *
 * MANUAL ONLY — never invoked by CI.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/perf.spec.ts"],

  /* No globalSetup — we don't want the local ES health check.
   * The perf tests themselves check total > 100k and skip if local. */

  /* Generous timeouts for real cluster + SSH tunnel */
  timeout: 240_000,
  globalTimeout: 60 * 60_000,

  /* No retries — we want to see real failure */
  retries: 0,

  workers: 1,

  reporter: [
    ["list"],
    ["json", { outputFile: "e2e-perf/results/.playwright-report.json" }],
  ],

  use: {
    baseURL: process.env.KUPUA_PERF_BASE_URL || "http://localhost:3000",
    headless: false,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
     /* Laptop-fitting maintained perf profile. Shared with perceived suites so
       headed runs remain fully visible on the machine used for measurements.
       This intentionally invalidates the legacy 1987×1110 jank baseline. */
     viewport: { width: 1720, height: 960 },
    deviceScaleFactor: 2,
    ...(process.env.KUPUA_PERF_AUTH_FILE && { storageState: process.env.KUPUA_PERF_AUTH_FILE }),
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        /* Do NOT spread ...devices["Desktop Chrome"] — it overrides
           viewport and deviceScaleFactor with its own defaults. */
      },
    },
  ],

  /* Don't auto-start a web server — the user already has start.sh --use-TEST running */
});

